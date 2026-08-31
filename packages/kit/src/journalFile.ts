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

import type { AgentLink, JournalDraft, OpenDispatch } from "./record";

/** One file per session, beside the repo it describes. */
export const RUNS_DIR = join(".nullius", "runs");

export const LOCK_SUFFIX = ".lock";

/**
 * The schema this build writes.
 *
 * It sat at `0.2` for three validator versions, and the lag was deliberate:
 * a journal declaring a version an older standalone kernel does not know is
 * met with `UNSUPPORTED-VERSION` and then nothing at all, so the producer only
 * moves when it has something to say that the old floor cannot carry. The
 * header's identity fields needed no bump, because unknown header keys are
 * ignored at every version and read at every version — they landed at `0.2`
 * and were read the day they landed.
 *
 * `0.6` is the first version this producer *cannot* stay below, and the reason
 * is that three of the things it now writes are only meaningful at that floor:
 *
 *  - `prompt` is a new kind. Below `0.6` it is an unknown kind, which is
 *    MALFORMED — the record would be rejected rather than ignored.
 *  - `stage`/`resolution`/`decision`/`check` written by `witness ledger` carry
 *    `origin: "self-reported"`, and only at `0.6` does the validator require
 *    and read it. Below the floor the field is ignored, so a coordinator's
 *    account of its own run would be laundered by a header that says `hooks`.
 *  - `expects: "findings"` scopes SILENT-REVIEWER. Below `0.6` the verdict is
 *    unscoped and fires on every untagged return, which is the calibration
 *    failure this change exists to avoid.
 *
 * It lives here rather than in `cli.ts` because this module writes the header,
 * and because `doctor`'s live proof validates a journal it assembles itself:
 * with two copies of the number, that proof would keep certifying a version
 * the producer had stopped writing.
 */
export const SCHEMA_VERSION = "0.6";

/**
 * How long to wait for another writer before refusing.
 *
 * Exported because it is a ceiling other work has to stay under, not merely a
 * local constant: anything a hook does before taking the lock — resolving
 * identity, reading a subagent transcript — has to finish well inside this, or
 * the append it was preparing is refused rather than delayed. `record.ts`'s
 * `TRANSCRIPT_BUDGET_MS` duplicates a smaller number on purpose (that module is
 * deliberately free of `node:fs` and cannot import this one); the relation is
 * asserted in `journalFile.test.ts`.
 */
export const DEFAULT_WAIT_MS = 2_000;

/** A lock older than this outlived its process. Hooks are short. */
const STALE_LOCK_MS = 30_000;

const POLL_MS = 20;

export interface JournalHeaderDraft {
  version: string;
  origin: JournalOrigin;
  session: string | null;
  source: string | null;
  /**
   * Where the run began, already resolved.
   *
   * Data, never a callback. Resolving identity means spawning git, and this
   * draft is consumed inside `writeRecords` — which runs while the append lock
   * is held, where a hook that has to wait 2 000 ms is not delayed but
   * REFUSED. Anything that could spawn a process must have finished before the
   * lock was taken; see `identity.ts` and the pre-check in `cli.ts`.
   *
   * Each is `null`/absent when git could not answer. Absent is a valid header.
   */
  branch?: string | null;
  head?: string | null;
  worktree?: string | null;
  /**
   * Who git says is steering the tree — `git config user.name`.
   *
   * Nested, and therefore not one of the three above: `identityFields` is a
   * flat `Record<string, string>` loop and cannot carry an object, which is
   * how this field spent its first chunk being resolved by `identity.ts` and
   * then dropped on the floor by the writer.
   *
   * ABSENT, never blank. At `0.6` the validator reports MALFORMED for a `user`
   * that is present but carries no non-empty `name`, so a producer that wrote
   * `user: { name: "" }` would be emitting journals its own validator rejects.
   */
  user?: { name: string } | null;
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

/**
 * Bind an agent id to the dispatch it was launched for, and to the model the
 * harness resolved for it.
 *
 * The model rides here because the launch acknowledgement is the only event
 * that states it for an asynchronous dispatch — `SubagentStop`, which is where
 * the `report` is written, carries no model at all. Without this the field is
 * unrecoverable for exactly the dispatch shape this repository's pipeline uses.
 *
 * `link` takes the bare-string form as well, which is a dispatch id and no
 * model. That is the shape every sidecar written before this existed uses, and
 * `resolveLink` still reads it.
 */
export function recordLink(
  linksFile: string,
  agentId: string,
  link: AgentLink,
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
        // The bare string when there is no model to record, so a sidecar keeps
        // the shape it has always had unless there is something new in it.
        // `{ dispatch, model: null }` would be a second way of saying nothing.
        const dispatch = typeof link === "string" ? link : link.dispatch;
        const model = typeof link === "string" ? null : (link.model ?? null);
        links[agentId] = model === null ? dispatch : { dispatch, model };
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
 * The dispatch an agent id was launched for, and the model it was launched on.
 *
 * Takes the lock, and falls back to an unlocked read when it cannot — which is
 * safe only because writes land by rename: there is no window in which the file
 * is half-written, so the fallback sees a complete file or none. Refusing to
 * read here would be the expensive failure, since an unresolved link turns a
 * subagent that reported into one recorded as never having come back.
 *
 * Always the two-part shape, whichever shape the file used. A sidecar written
 * before the model existed says `"d:toolu_A"`, and it resolves to
 * `{ dispatch: "d:toolu_A", model: null }` — "no model was recorded", which is
 * the truth about that file and not the same as a model this build failed to
 * read. Both come out as an absent `report.model`, and the journal says nothing
 * either way rather than guessing which.
 */
export function resolveLink(
  linksFile: string,
  agentId: string,
  options: AppendOptions = {},
): { dispatch: string; model: string | null } | null {
  const read = (): { dispatch: string; model: string | null } | null => {
    const found = readLinks(linksFile)[agentId];
    if (typeof found === "string") return { dispatch: found, model: null };
    if (typeof found !== "object" || found === null || Array.isArray(found)) return null;
    const { dispatch, model } = found as { dispatch?: unknown; model?: unknown };
    if (typeof dispatch !== "string" || dispatch.length === 0) return null;
    return { dispatch, model: typeof model === "string" && model.length > 0 ? model : null };
  };
  return withLock(linksFile, options.waitMs ?? DEFAULT_WAIT_MS, read, read);
}

/**
 * A missing link file resolves nothing, which is ordinary — no subagent has
 * been launched yet. An unreadable one is not ordinary: writes are atomic, so
 * a file that fails to parse is corrupt rather than mid-write, and the caller
 * is told through the null it gets back that no dispatch could be joined.
 *
 * Values are `unknown` rather than `string` because both entry shapes are
 * live: the bare dispatch id every sidecar used before `report.model` existed,
 * and the `{ dispatch, model }` object written since. `resolveLink` narrows.
 */
function readLinks(linksFile: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(linksFile, "utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * A pure function of its draft, and it stays one.
 *
 * It is called from `writeRecords`, under the append lock. Teaching it to
 * resolve anything — to spawn git for a branch name, to read a config — would
 * put that work on the one path where every other hook is counting down to
 * being refused. Whatever the header needs, it is handed.
 *
 * A `null` identity field is omitted rather than written. `branch: ""` is a
 * producer asserting it knows the branch and naming none, which is a different
 * and worse fact than saying nothing; a `0.4` validator calls it MALFORMED.
 */
function headerRecord(header: JournalHeaderDraft): JournalDraft {
  return {
    kind: "journal",
    version: header.version,
    origin: header.origin,
    ...(header.session === null ? {} : { session: header.session }),
    ...(header.source === null ? {} : { source: header.source }),
    ...identityFields(header),
    ...userField(header),
  };
}

function identityFields(header: JournalHeaderDraft): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const key of ["branch", "head", "worktree"] as const) {
    const value = header[key];
    if (typeof value === "string" && value.length > 0) fields[key] = value;
  }
  return fields;
}

/**
 * The operator, when git named one.
 *
 * Its own function rather than a fourth entry in the loop above, because the
 * loop is typed `Record<string, string>` and this value is an object — the
 * exact reason `user` could be resolved and still never reach a header.
 *
 * A blank or absent name omits the KEY, not just the name. `user: {}` and
 * `user: { name: "" }` are both MALFORMED at 0.6, so either would make this
 * producer write journals that fail its own validator; and a blank name
 * compares equal to every other blank, which is worse than saying nothing.
 */
function userField(header: JournalHeaderDraft): { user?: { name: string } } {
  const name = header.user?.name;
  if (typeof name !== "string" || name.trim().length === 0) return {};
  return { user: { name } };
}

/**
 * Does this journal already hold something? Asked WITHOUT the lock.
 *
 * The authoritative "does this need a header" decision is the `needsHeader`
 * test inside `writeRecords`, and it stays there. This is the unsynchronised
 * pre-check that lets `cli.ts` skip resolving identity on every event without
 * moving git under the lock — see the comment on `identityFor` in `cli.ts` for
 * why the race it admits is the cheap kind.
 */
export function journalHasContent(file: string): boolean {
  try {
    return statSync(file).size > 0;
  } catch {
    return false;
  }
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
