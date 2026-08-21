/**
 * Where a journal lives, and how a record gets into one without racing.
 *
 * Under parallel subagents, several hook processes append to the same journal
 * at the same moment. `O_APPEND` gives atomicity only for writes small enough
 * to land in one go — a guarantee with no number attached to it — and a
 * half-written line is the one failure a journal cannot survive: the validator
 * reports MALFORMED, and the record that would have said what happened is the
 * one that got shredded.
 *
 * So every append takes an advisory lock first. `flock` is not reachable from
 * Node without a native module, so the lock is the portable equivalent: an
 * exclusive-create lock file (`O_EXCL`), polled with a deadline, and broken
 * when it is old enough to have outlived the process that made it — a hook
 * that died must not wedge every hook after it.
 *
 * When the lock cannot be had, the append is REFUSED, not forced. The caller
 * prints the refusal; the dispatch that went unrecorded then shows up at
 * validation as a missing record, which is the honest end state. Forcing the
 * write would trade a visible gap for an invisible corruption.
 */

import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  renameSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

import { validateJournal, type JournalOrigin } from "@nullius-inverba/claims";

import type { JournalDraft, OpenDispatch } from "./record";

/** One file per session, beside the repo it describes. */
export const RUNS_DIR = join(".nullius", "runs");

export const LOCK_SUFFIX = ".lock";

/** How long to wait for another writer before refusing. */
const DEFAULT_WAIT_MS = 2_000;

/** A lock older than this outlived its process. Hooks are short. */
const STALE_LOCK_MS = 30_000;

const POLL_MS = 20;

export interface JournalHeaderDraft {
  version: string;
  origin: JournalOrigin;
  session: string | null;
  source: string | null;
}

export interface AppendOutcome {
  written: number;
  /** null when the records landed; otherwise why they did not. */
  refused: string | null;
}

export interface AppendOptions {
  waitMs?: number;
  /**
   * Whether a journal should be created when there is nothing to write.
   * A session starting is worth a file; an ignored Bash call is not.
   */
  createEmpty?: boolean;
}

/**
 * Records to append, or a way to decide them.
 *
 * The function form is the one that matters: it runs UNDER the lock, so a
 * decision that depends on the journal's current contents — which dispatches
 * are still open, whether one already has a terminal — is made against state
 * that cannot change before the write lands.
 */
export type RecordSource = readonly JournalDraft[] | (() => readonly JournalDraft[]);

/**
 * A session id comes from the harness, and it is used to build a path. It is
 * therefore untrusted input in the only sense that matters here: anything not
 * plainly a name is replaced, so no journal can be written outside the runs
 * directory whatever the harness sends.
 */
export function journalPathFor(root: string, session: string | null): string {
  const cleaned = (session ?? "").replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[.-]+/, "");
  const name = cleaned.length > 0 ? cleaned.slice(0, 120) : "unknown-session";
  return join(root, RUNS_DIR, `${name}.jsonl`);
}

/**
 * Run `write` with an exclusive lock on `target`, or refuse.
 *
 * Refusing is the whole point: forcing the write would trade a visible gap for
 * an invisible corruption, and a half-written line is the one failure a journal
 * cannot survive.
 */
function withLock<T>(
  target: string,
  waitMs: number,
  write: () => T,
  refusal: (reason: string) => T,
): T {
  mkdirSync(dirname(target), { recursive: true });

  const lock = `${target}${LOCK_SUFFIX}`;
  const deadline = Date.now() + waitMs;
  // Written into the lock so release can tell our lock from a successor's.
  const token = `${process.pid}:${randomUUID()}`;
  let held: number;

  for (;;) {
    try {
      held = openSync(lock, "wx");
      break;
    } catch (error) {
      if (code(error) !== "EEXIST") return refusal(`could not take the lock: ${message(error)}`);

      // The deadline is checked on EVERY pass, before anything else can decide
      // to retry. An earlier version checked it only after a stale-break
      // attempt declined to retry, so a lock that could never be removed —
      // a directory in its place, a root-owned file, a read-only parent — sent
      // this into a tight loop with no exit. A hook that hangs is worse than a
      // hook that records nothing: it takes the session down with it.
      if (Date.now() >= deadline) {
        return refusal(
          `another writer holds the lock on ${target} — nothing was written, so this record is missing rather than mangled`,
        );
      }
      if (!breakIfStale(lock)) pause(POLL_MS);
    }
  }

  try {
    writeSync(held, token);
    return write();
  } finally {
    closeSync(held);
    releaseLock(lock, token);
  }
}

/**
 * Remove a lock only if we still hold it.
 *
 * A stale-break can hand our lock to someone else while we are still working —
 * the age test measures when a lock was CREATED, not whether its holder is
 * alive, so a merely slow writer looks dead. If we then deleted whatever lock
 * file happened to be there, we would evict the writer that replaced us and
 * let a third in beside it. Checking the token makes a wrong break cost one
 * confused writer instead of a cascade.
 */
export function releaseLock(lock: string, token: string): void {
  try {
    if (readFileSync(lock, "utf8") !== token) return;
  } catch {
    return; // already gone, or unreadable — either way not ours to remove
  }
  rmSync(lock, { force: true });
}

export function appendRecords(
  file: string,
  source: RecordSource,
  header: JournalHeaderDraft,
  options: AppendOptions = {},
): AppendOutcome {
  return withLock(
    file,
    options.waitMs ?? DEFAULT_WAIT_MS,
    () => {
      const records = typeof source === "function" ? source() : source;
      if (records.length === 0 && options.createEmpty === false && !existsSync(file)) {
        return { written: 0, refused: null };
      }
      return writeRecords(file, records, header);
    },
    (reason) => ({ written: 0, refused: reason }),
  );
}

function writeRecords(
  file: string,
  records: readonly JournalDraft[],
  header: JournalHeaderDraft,
): AppendOutcome {
  try {
    // Under the lock, so two hooks cannot both decide the file is new. Asked
    // by size rather than by reading: this runs on every hook invocation, and
    // reading a growing journal end to end each time is O(N²) across a session
    // — paid while holding the lock, which is exactly when other hooks are
    // waiting on their 2-second deadline.
    const needsHeader = !existsSync(file) || statSync(file).size === 0;
    const payload = [
      ...(needsHeader ? [headerRecord(header)] : []),
      ...records,
    ]
      .map((record) => `${JSON.stringify(record)}\n`)
      .join("");

    if (payload.length > 0) appendFileSync(file, payload, "utf8");
    return { written: records.length, refused: null };
  } catch (error) {
    return { written: 0, refused: `could not write ${file}: ${message(error)}` };
  }
}

/**
 * Where the launch links live: beside the journal, never in it.
 *
 * `agentId → dispatch` is bookkeeping this recorder needs to join a
 * `SubagentStop` back to the dispatch that started it. It is not something a
 * reader of the run needs, and the journal schema is not a place to put
 * whatever the producer found convenient.
 */
export function linksPathFor(journalFile: string): string {
  return journalFile.replace(/\.jsonl$/, "") + ".links.json";
}

export function recordLink(
  linksFile: string,
  agentId: string,
  dispatch: string,
  options: AppendOptions = {},
): AppendOutcome {
  return withLock(
    linksFile,
    options.waitMs ?? DEFAULT_WAIT_MS,
    () => {
      const scratch = `${linksFile}.tmp-${process.pid}`;
      try {
        // Read-modify-write under the lock: parallel launches bind their own
        // agents at the same moment, and last-write-wins would drop one.
        const links = readLinks(linksFile);
        links[agentId] = dispatch;
        // Write elsewhere and rename into place. `writeFileSync` truncates
        // first, and a reader landing in that window parses nothing, resolves
        // no dispatch, and lets a subagent that reported be sealed as one that
        // never came back. A rename is atomic, so a reader sees the whole old
        // file or the whole new one and never a seam.
        writeFileSync(scratch, `${JSON.stringify(links, null, 2)}\n`, "utf8");
        renameSync(scratch, linksFile);
        return { written: 1, refused: null };
      } catch (error) {
        rmSync(scratch, { force: true });
        return { written: 0, refused: `could not write ${linksFile}: ${message(error)}` };
      }
    },
    (reason) => ({ written: 0, refused: reason }),
  );
}

/**
 * The dispatch an agent id was launched for.
 *
 * Takes the lock, and falls back to an unlocked read when it cannot — which is
 * safe only because writes land by rename: there is no window in which the file
 * is half-written, so the fallback sees a complete file or none. Refusing to
 * read here would be the expensive failure, since an unresolved link turns a
 * subagent that reported into one recorded as never having come back.
 */
export function resolveLink(
  linksFile: string,
  agentId: string,
  options: AppendOptions = {},
): string | null {
  const read = (): string | null => {
    const found = readLinks(linksFile)[agentId];
    return typeof found === "string" ? found : null;
  };
  return withLock(linksFile, options.waitMs ?? DEFAULT_WAIT_MS, read, read);
}

/**
 * A missing link file resolves nothing, which is ordinary — no subagent has
 * been launched yet. An unreadable one is not ordinary: writes are atomic, so
 * a file that fails to parse is corrupt rather than mid-write, and the caller
 * is told through the null it gets back that no dispatch could be joined.
 */
function readLinks(linksFile: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(linksFile, "utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

function headerRecord(header: JournalHeaderDraft): JournalDraft {
  return {
    kind: "journal",
    version: header.version,
    origin: header.origin,
    ...(header.session === null ? {} : { session: header.session }),
    ...(header.source === null ? {} : { source: header.source }),
  };
}

/**
 * The dispatches with no terminal record — read from the validator's own
 * NO-TERMINAL findings rather than by walking the journal again. One
 * definition of "never came back", used both to report it and to seal it: two
 * implementations would eventually disagree, and the disagreement would look
 * exactly like a run where nothing went wrong.
 */
export function openDispatchesIn(content: string): OpenDispatch[] {
  const open = validateJournal(content).findings
    .filter((finding) => finding.verdict === "no-terminal")
    .map((finding) => finding.subject);
  if (open.length === 0) return [];

  const tasks = new Map<string, string>();
  for (const line of content.split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      const record: unknown = JSON.parse(line);
      if (typeof record !== "object" || record === null) continue;
      const { id, task } = record as { id?: unknown; task?: unknown };
      if (typeof id === "string" && typeof task === "string") tasks.set(id, task);
    } catch {
      // Unreadable lines are the validator's business, not this function's.
    }
  }

  return open.map((id) => ({ id, task: tasks.get(id) ?? null }));
}

/**
 * True only when a stale lock was actually removed.
 *
 * Reporting success it had not achieved is what made the retry loop spin: the
 * caller reads `true` as "something changed, try again immediately". If the
 * lock cannot be removed, nothing changed, and the honest answer is `false` —
 * let the deadline end it.
 */
/** Dispatch ids that already have a terminal report in this journal. */
export function terminalsIn(content: string): Set<string> {
  const terminated = new Set<string>();
  for (const line of content.split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      const record: unknown = JSON.parse(line);
      if (typeof record !== "object" || record === null) continue;
      const { kind, dispatch } = record as { kind?: unknown; dispatch?: unknown };
      if (kind === "report" && typeof dispatch === "string") terminated.add(dispatch);
    } catch {
      // Unreadable lines are the validator's business.
    }
  }
  return terminated;
}

function breakIfStale(lock: string): boolean {
  try {
    if (Date.now() - statSync(lock).mtimeMs < STALE_LOCK_MS) return false;
  } catch {
    return false; // cannot stat it; the deadline decides
  }
  try {
    rmSync(lock, { force: true });
    return true;
  } catch {
    return false; // a directory in its place, or no permission
  }
}

/** A synchronous pause. The whole write path is sync because hooks are. */
function pause(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function code(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
