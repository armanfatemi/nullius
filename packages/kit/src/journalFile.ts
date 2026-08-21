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
  statSync,
  writeFileSync,
} from "node:fs";
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
}

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
  let held: number;

  for (;;) {
    try {
      held = openSync(lock, "wx");
      break;
    } catch (error) {
      if (code(error) !== "EEXIST") return refusal(`could not take the lock: ${message(error)}`);
      if (breakIfStale(lock)) continue;
      if (Date.now() >= deadline) {
        return refusal(
          `another writer holds the lock on ${target} — nothing was written, so this record is missing rather than mangled`,
        );
      }
      pause(POLL_MS);
    }
  }

  try {
    return write();
  } finally {
    closeSync(held);
    rmSync(lock, { force: true });
  }
}

export function appendRecords(
  file: string,
  records: readonly JournalDraft[],
  header: JournalHeaderDraft,
  options: AppendOptions = {},
): AppendOutcome {
  return withLock(
    file,
    options.waitMs ?? DEFAULT_WAIT_MS,
    () => writeRecords(file, records, header),
    (reason) => ({ written: 0, refused: reason }),
  );
}

function writeRecords(
  file: string,
  records: readonly JournalDraft[],
  header: JournalHeaderDraft,
): AppendOutcome {
  try {
    // Under the lock, so two hooks cannot both decide the file is new.
    const needsHeader = !existsSync(file) || readFileSync(file, "utf8").trim().length === 0;
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
      try {
        // Read-modify-write under the lock: parallel launches bind their own
        // agents at the same moment, and last-write-wins would drop one.
        const links = readLinks(linksFile);
        links[agentId] = dispatch;
        writeFileSync(linksFile, `${JSON.stringify(links, null, 2)}\n`, "utf8");
        return { written: 1, refused: null };
      } catch (error) {
        return { written: 0, refused: `could not write ${linksFile}: ${message(error)}` };
      }
    },
    (reason) => ({ written: 0, refused: reason }),
  );
}

export function resolveLink(linksFile: string, agentId: string): string | null {
  const found = readLinks(linksFile)[agentId];
  return typeof found === "string" ? found : null;
}

/** An unreadable link file resolves nothing. It is a cache, not a record. */
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

function breakIfStale(lock: string): boolean {
  try {
    if (Date.now() - statSync(lock).mtimeMs < STALE_LOCK_MS) return false;
    rmSync(lock, { force: true });
    return true;
  } catch {
    // Gone between the check and the stat: the next attempt will take it.
    return true;
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
