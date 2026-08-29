/**
 * Where a run began: the branch, the head commit, and an identity for the
 * worktree. Resolved once per session, before the append lock is taken, and
 * handed to the journal header as data.
 *
 * Three constraints shape everything in this file, and each one has a failure
 * behind it.
 *
 * **1. A git failure is never a recording failure.** Not a repository, no git
 * binary, a detached HEAD, an unborn branch, a timeout — every one of them
 * resolves to `null`, the field is omitted from the header, and the append
 * proceeds. A hook that can break the session it observes gets uninstalled the
 * first time it misfires, and then observes nothing. Nothing here throws.
 *
 * **2. No git call may run while the append lock is held.** The expensive case
 * is not git failing, it is git *succeeding slowly*: a hook that cannot take
 * the lock does not queue, it waits `DEFAULT_WAIT_MS` and is then REFUSED, and
 * its records are lost rather than deferred. A cold `rev-parse` on a large
 * repository, run under the lock, would silently cost every concurrently
 * appending hook its records — while fully satisfying constraint 1, because
 * git did not fail. So this module is called from `cli.ts` before
 * `appendRecords`, and `journalFile.ts` spawns nothing.
 *
 * **3. Every call is bounded far below the lock's wait deadline.** The kernel's
 * `DEFAULT_GIT_TIMEOUT_MS` is 10 000 ms — five times the deadline at which a
 * waiting hook's append is refused outright — so it is deliberately not reused
 * here. The budget below is in the hundreds of milliseconds. A `rev-parse`
 * that has not answered inside it is treated exactly like a git failure.
 *
 * `revFileReader` in the kernel is not the reuse candidate for any of this: it
 * reads *a file at a rev* and cannot answer branch, head or worktree. What is
 * reused is the discipline — `shell: false`, an argument vector, a timeout, a
 * `SIGKILL`, and every error path folded into one "no answer".
 */

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

/**
 * Wall-clock budget for ONE git call while resolving identity.
 *
 * Hundreds of milliseconds, strictly below `journalFile.ts`'s
 * `DEFAULT_WAIT_MS` of 2 000 — see constraint 3 above. Not the kernel's
 * `DEFAULT_GIT_TIMEOUT_MS`.
 */
export const IDENTITY_TIMEOUT_MS = 250;

/**
 * Wall-clock budget for ALL of them together.
 *
 * The per-call timeout bounds one `rev-parse`; without a total, resolution
 * costs the sum of however many calls this file grows. The sum is what a
 * session's first hook actually waits for, so it is the number that has to
 * stay under the lock deadline.
 */
export const IDENTITY_BUDGET_MS = 600;

/**
 * The salt file's name. It lives in the git common directory, which makes the
 * salt per-CLONE, not per-worktree.
 *
 * Task 3.5b required this to be decided rather than inherited, so here is the
 * decision with its reason. Two placements were live: `.nullius/salt`, beside
 * the runs directory in the working tree, or the git common directory, shared
 * by every worktree of one clone. The git common directory wins on two counts.
 *
 * **It cannot be committed, by construction.** A salt in the working tree is
 * safe only while a `.gitignore` rule holds, and that rule is a per-repository
 * ritual this change can perform for exactly one repository — every other repo
 * the kit records in would get an unignored salt beside a `.nullius/` directory
 * that is itself committed. Git tracks nothing inside the git directory, so
 * here the placement *is* the guarantee, and no ignore rule can be deleted out
 * from under it. That matters because the failure is silent: a committed salt
 * makes every `worktree` digest reproducible by anyone holding the repository,
 * the preimage argument evaporates, and nothing reports it. This is task
 * 3.5a's obligation discharged by placement rather than by an ignore rule, and
 * it is why `.gitignore` gains no entry in this change.
 *
 * **Per-clone loses nothing and gains a comparison.** Distinctness between
 * sibling worktrees comes from the PATH, which differs, not from the salt — so
 * both placements give sibling worktrees different digests, which is the case
 * the field exists to distinguish. Sharing the salt additionally makes those
 * digests mutually meaningful across one clone's worktrees, which is the corpus
 * this schema is built for: sixty-four sibling trees producing journals
 * together.
 *
 * Still not promised: `worktree` does not compare across clones or across
 * machines. That is by construction and it is the correct trade. Decision 6 of
 * the design document names this same unit — per-clone — and nothing else in
 * the change may name a different one.
 */
export const SALT_FILE = "nullius-worktree-salt";

/**
 * Where a run began. `null` is the only failure mode: it means "git could not
 * answer", and the header omits the key rather than inventing a value for it.
 */
export interface JournalIdentity {
  branch: string | null;
  head: string | null;
  worktree: string | null;
}

/** What a directory git cannot speak for resolves to. */
export const NO_IDENTITY: JournalIdentity = { branch: null, head: null, worktree: null };

/**
 * Resolve identity for `root`, best-effort and bounded.
 *
 * Must be called BEFORE the append lock is acquired — see constraint 2. The
 * result is data; `headerRecord` stays a pure function of its draft.
 */
export function resolveIdentity(
  root: string,
  perCallMs: number = IDENTITY_TIMEOUT_MS,
  budgetMs: number = IDENTITY_BUDGET_MS,
): JournalIdentity {
  const deadline = Date.now() + budgetMs;
  const git = (...args: string[]): string | null => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    return runGit(root, args, Math.min(perCallMs, remaining));
  };

  // Asked first, and the gate for everything else: a directory git will not
  // name a toplevel for is not a repository we can say anything about.
  const paths = git("rev-parse", "--show-toplevel", "--git-common-dir");
  if (paths === null) return NO_IDENTITY;
  const [toplevel, commonDir] = paths.split("\n");
  if (toplevel === undefined || toplevel.length === 0) return NO_IDENTITY;

  return {
    // `symbolic-ref` rather than `rev-parse --abbrev-ref HEAD`, because the
    // latter prints the literal string "HEAD" on a detached head. That is a
    // sentinel invented by the producer and indistinguishable, to a reader,
    // from a branch. Detached means the key is absent; the spec says so.
    branch: git("symbolic-ref", "--quiet", "--short", "HEAD"),
    // A repository with no commits yet answers nothing here, and that is a
    // header with `branch` and `worktree` and no `head` — which is true.
    head: git("rev-parse", "HEAD"),
    worktree: worktreeId(resolveGitDir(root, commonDir), toplevel),
  };
}

/**
 * A stable identifier for a worktree that carries nothing about the machine.
 *
 * SHA-256 of the absolute worktree path, salted, hex, truncated to 16
 * characters. Every clause of that is load-bearing:
 *
 * - **Not the path.** An absolute worktree path is a home directory. The probe
 *   corpus already had to redact absolute paths out of captured hook payloads
 *   before committing them; a header field is no different.
 * - **Salted.** An unsalted digest is not a redaction of a low-entropy input.
 *   `/Users/<name>/<a few likely roots>/<repo>` is guessable, so a bare hash is
 *   confirmable by preimage guess — and confirming a guess is exactly the
 *   disclosure being avoided. A hash that only stops casual reading reads as
 *   anonymised and is not.
 * - **16 hex characters.** Long enough that the worktrees of one machine do not
 *   collide in practice, short enough to read in a header.
 *
 * The consequence, stated rather than discovered later: `worktree` values are
 * comparable only where the salt is. That is the whole of what the field
 * promises — "were these two journals written in the same tree?" — and
 * `branch` already carries the human-readable half.
 */
export function worktreeId(gitCommonDir: string | null, toplevel: string): string | null {
  if (gitCommonDir === null) return null;
  const salt = readOrCreateSalt(join(gitCommonDir, SALT_FILE));
  if (salt === null) return null;
  return createHash("sha256").update(salt).update("\0").update(toplevel).digest("hex").slice(0, 16);
}

/** Where the salt is looked for. See the placement decision above `SALT_FILE`. */
function resolveGitDir(root: string, commonDir: string | undefined): string | null {
  if (commonDir === undefined || commonDir.length === 0) return null;
  // `--git-common-dir` answers relative to git's own cwd, which is the `-C`
  // directory we handed it, not the toplevel.
  return isAbsolute(commonDir) ? commonDir : resolve(root, commonDir);
}

/**
 * Read the salt, or create it once.
 *
 * `wx` is an atomic exclusive create, so two hooks racing on a session's first
 * append cannot both install a salt and end up hashing the same tree two ways:
 * the loser's write fails, it re-reads, and both agree. An unwritable git
 * directory returns null, which costs the `worktree` field and nothing else.
 */
function readOrCreateSalt(file: string): string | null {
  const existing = readSalt(file);
  if (existing !== null) return existing;

  const candidate = randomBytes(32).toString("hex");
  try {
    writeFileSync(file, `${candidate}\n`, { encoding: "utf8", flag: "wx" });
    return candidate;
  } catch {
    // Either someone created it between our read and our write, or we cannot
    // write here at all. Re-reading settles both cases without a second guess.
    return readSalt(file);
  }
}

function readSalt(file: string): string | null {
  try {
    const salt = readFileSync(file, "utf8").trim();
    return salt.length > 0 ? salt : null;
  } catch {
    return null;
  }
}

/**
 * One git call. Returns its trimmed stdout, or null for every kind of "no".
 *
 * "No" covers a missing binary, a directory that is not a repository, a
 * non-zero exit, and a timeout — deliberately collapsed, because the caller's
 * response to all four is identical: omit the field. A timeout in particular
 * is treated exactly as a failure, which is the clause that makes `git
 * succeeding slowly` safe rather than merely slow.
 */
function runGit(root: string, args: readonly string[], timeoutMs: number): string | null {
  let result;
  try {
    result = spawnSync("git", ["-C", root, ...args], {
      shell: false,
      encoding: "utf8",
      timeout: timeoutMs,
      killSignal: "SIGKILL",
      // Nothing on stdin: a git subcommand that decides to prompt would
      // otherwise hold the hook open for its whole timeout.
      input: "",
      // 64 KiB is far more than any of these commands can produce, and caps a
      // pathological repository rather than trusting it.
      maxBuffer: 64 * 1024,
    });
  } catch {
    // spawnSync throws for a handful of platform errors rather than reporting
    // them on the result. Same answer.
    return null;
  }

  if (result.error !== undefined || result.status !== 0) return null;
  const out = (result.stdout ?? "").trim();
  return out.length > 0 ? out : null;
}
