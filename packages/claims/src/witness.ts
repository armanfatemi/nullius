/**
 * `fiducial witness validate` — the deterministic half of the retro kit.
 *
 * `check` asks whether the author looked. This asks a different question, and
 * one nothing else in the toolchain asks: **did the checking itself actually
 * happen?** A multi-agent run leaves a journal behind, and a journal is exactly
 * as trustworthy as a design doc — it is text an agent wrote about work an
 * agent did. So it gets the same treatment: three invariants a machine can
 * refuse, and no model anywhere in the loop.
 *
 *  1. **Three states, never two.** Every dispatch ends in one of `found`,
 *     `empty` (the agent came back and explicitly said "nothing"), or
 *     `no-report` (the agent never came back). Collapsing the last two is the
 *     bug this exists for: silence reads as a clean result, and a run that
 *     dropped half its agents on the floor summarises identically to one where
 *     they all reported nothing.
 *  2. **Verified-once is not verified.** A verification names the artifact it
 *     verified AND that artifact's hash. Anything relying on that verification
 *     later is invalid if the artifact changed in between — the record proves
 *     something about a file that no longer exists in that form.
 *  3. **Omission is invalid.** An append must state what it corrected since
 *     the last one. `"None."` passes; leaving the field out does not. A field
 *     that can be silently absent is one that always will be.
 *
 * The journal is JSON Lines: one record per line, append-only, in time order.
 * Order is load-bearing — invariant 2 is a question about what happened
 * BETWEEN two records — so a reordered journal is a different journal.
 *
 * See spec/witness-journal.md.
 */

export type JournalVerdict =
  /** The record satisfies every invariant. */
  | "ok"
  /** Not JSON, or not a record shape this schema knows. */
  | "malformed"
  /** A dispatch that never reached a terminal record. */
  | "no-terminal"
  /** Two terminal records for one dispatch. */
  | "duplicate-terminal"
  /** A terminal record whose outcome is missing or outside the three states. */
  | "collapsed-state"
  /** An `empty` or `no-report` terminal with nothing said about it. */
  | "silent-empty"
  /** A reference to a record that is not in the journal. */
  | "dangling-reference"
  /** Reliance on a verification of an artifact that has since changed. */
  | "stale-verification"
  /** An append that does not say what it corrected. */
  | "omitted-corrections"
  /** Two records claiming the same id. */
  | "duplicate-id";

export interface JournalFinding {
  /** 1-based line in the journal. */
  line: number;
  verdict: JournalVerdict;
  /** Record id, or the raw line when there is no usable id. */
  subject: string;
  detail: string;
}

export interface JournalReport {
  findings: JournalFinding[];
  records: number;
  dispatches: number;
  /** Terminal outcomes, counted apart — the point of invariant 1 is that
   *  these three numbers are three numbers. */
  outcomes: { found: number; empty: number; noReport: number };
  verifications: number;
}

const PASSING: ReadonlySet<JournalVerdict> = new Set<JournalVerdict>(["ok"]);

export function isJournalFailure(verdict: JournalVerdict): boolean {
  return !PASSING.has(verdict);
}

/** The three terminal states. Two of them are not the same state. */
const OUTCOMES = ["found", "empty", "no-report"] as const;
type Outcome = (typeof OUTCOMES)[number];

const KINDS = ["dispatch", "report", "verification", "reliance", "append"] as const;
type Kind = (typeof KINDS)[number];

interface JournalRecord {
  line: number;
  kind: Kind;
  id: string;
  raw: Readonly<Partial<{
    dispatch: unknown;
    outcome: unknown;
    statement: unknown;
    findings: unknown;
    target: unknown;
    relies_on: unknown;
    corrections_since_last_append: unknown;
  }>>;
}

function isObject(value: unknown): value is { [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asKind(value: unknown): Kind | null {
  return KINDS.find((kind) => kind === value) ?? null;
}

function asOutcome(value: unknown): Outcome | null {
  return OUTCOMES.find((outcome) => outcome === value) ?? null;
}

function asTarget(value: unknown): { path: string; hash: string } | null {
  if (!isObject(value)) return null;
  const { path, hash } = value;
  if (typeof path !== "string" || path.length === 0) return null;
  if (typeof hash !== "string" || hash.length === 0) return null;
  return { path, hash };
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateJournal(content: string): JournalReport {
  const findings: JournalFinding[] = [];
  const records: JournalRecord[] = [];
  const byId = new Map<string, JournalRecord>();

  const lines = content.split("\n");

  // --- Pass 1: shape. A record that does not parse cannot be reasoned about,
  // and is reported rather than skipped: a journal the validator silently
  // ignores half of is worse than no journal.
  for (let index = 0; index < lines.length; index += 1) {
    const raw = (lines[index] ?? "").trim();
    if (raw.length === 0) continue;
    const line = index + 1;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      findings.push({
        line,
        verdict: "malformed",
        subject: raw.slice(0, 60),
        detail: "not valid JSON — a journal is JSON Lines, one record per line",
      });
      continue;
    }

    if (!isObject(parsed)) {
      findings.push({
        line,
        verdict: "malformed",
        subject: raw.slice(0, 60),
        detail: "record is not a JSON object",
      });
      continue;
    }

    const kind = asKind(parsed["kind"]);
    if (kind === null) {
      findings.push({
        line,
        verdict: "malformed",
        subject: String(parsed["id"] ?? raw.slice(0, 40)),
        detail: `unknown kind ${JSON.stringify(parsed["kind"])} — expected one of: ${KINDS.join(", ")}`,
      });
      continue;
    }

    const id = parsed["id"];
    if (!nonEmptyString(id)) {
      findings.push({
        line,
        verdict: "malformed",
        subject: raw.slice(0, 60),
        detail: `a ${kind} record needs a non-empty "id"`,
      });
      continue;
    }

    const record: JournalRecord = { line, kind, id: id as string, raw: parsed };
    const clash = byId.get(record.id);
    if (clash !== undefined) {
      findings.push({
        line,
        verdict: "duplicate-id",
        subject: record.id,
        detail: `id already used on line ${clash.line} — references would be ambiguous`,
      });
      continue;
    }
    byId.set(record.id, record);
    records.push(record);
  }

  // --- Pass 2: the three invariants, walked in journal order, because two of
  // them are questions about what happened BETWEEN two records.
  const terminals = new Map<string, JournalRecord>();
  const outcomes = { found: 0, empty: 0, noReport: 0 };
  /** Latest hash seen for each artifact path, as of the current line. */
  const hashes = new Map<string, { hash: string; line: number }>();
  /** Verification id -> what it verified, and against which hash. */
  const verified = new Map<string, { path: string; hash: string }>();
  let dispatches = 0;
  let verifications = 0;

  for (const record of records) {
    switch (record.kind) {
      case "dispatch":
        dispatches += 1;
        break;

      case "report": {
        const target = record.raw.dispatch;
        if (!nonEmptyString(target)) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail: 'a report needs "dispatch": the id of the dispatch it terminates',
          });
          break;
        }
        const dispatch = byId.get(target as string);
        if (dispatch === undefined || dispatch.kind !== "dispatch") {
          findings.push({
            line: record.line,
            verdict: "dangling-reference",
            subject: record.id,
            detail: `no dispatch with id '${String(target)}' appears earlier in this journal`,
          });
          break;
        }

        const already = terminals.get(dispatch.id);
        if (already !== undefined) {
          findings.push({
            line: record.line,
            verdict: "duplicate-terminal",
            subject: record.id,
            detail: `dispatch '${dispatch.id}' already terminated on line ${already.line} — a dispatch has one outcome`,
          });
          break;
        }
        terminals.set(dispatch.id, record);

        // Invariant 1. An outcome outside the three states is the collapse
        // itself: `{"ok": true}` and a missing report look identical, and the
        // whole point is that they are not.
        const outcome = asOutcome(record.raw.outcome);
        if (outcome === null) {
          findings.push({
            line: record.line,
            verdict: "collapsed-state",
            subject: record.id,
            detail: `outcome ${JSON.stringify(record.raw.outcome)} is not one of ${OUTCOMES.join(", ")} — "nothing found" and "never reported" are different results and must not share a state`,
          });
          break;
        }

        if (outcome === "found") {
          outcomes.found += 1;
          if (!Array.isArray(record.raw.findings) || record.raw.findings.length === 0) {
            findings.push({
              line: record.line,
              verdict: "collapsed-state",
              subject: record.id,
              detail: 'outcome "found" with no findings — report "empty" instead, and say so explicitly',
            });
          }
          break;
        }

        if (outcome === "empty") outcomes.empty += 1;
        else outcomes.noReport += 1;

        // A silent empty is how the two states re-merge in practice: nobody
        // reads a record that says nothing, so it gets skimmed as a pass.
        if (!nonEmptyString(record.raw.statement)) {
          findings.push({
            line: record.line,
            verdict: "silent-empty",
            subject: record.id,
            detail:
              outcome === "empty"
                ? 'outcome "empty" needs a "statement" — the explicit "None." is the record; its absence is not'
                : 'outcome "no-report" needs a "statement" saying what was dispatched and never came back',
          });
        }
        break;
      }

      case "verification": {
        verifications += 1;
        const target = asTarget(record.raw.target);
        if (target === null) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail:
              'a verification needs "target": {"path": ..., "hash": ...} — a verification that does not name what it verified cannot be invalidated when that thing changes',
          });
          break;
        }
        verified.set(record.id, target);
        hashes.set(target.path, { hash: target.hash, line: record.line });
        break;
      }

      case "reliance": {
        const on = record.raw.relies_on;
        if (!nonEmptyString(on)) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail: 'a reliance needs "relies_on": the id of the verification it rests on',
          });
          break;
        }
        const source = verified.get(on as string);
        if (source === undefined) {
          findings.push({
            line: record.line,
            verdict: "dangling-reference",
            subject: record.id,
            detail: `no verification with id '${String(on)}' appears earlier in this journal`,
          });
          break;
        }

        // Invariant 2. The verification was true; it is being cited as if it
        // still is. This is the destructive-probe incident, mechanically:
        // something was checked, the thing changed, and the check kept being
        // quoted.
        const latest = hashes.get(source.path);
        if (latest !== undefined && latest.hash !== source.hash) {
          findings.push({
            line: record.line,
            verdict: "stale-verification",
            subject: record.id,
            detail: `relies on '${String(on)}', which verified ${source.path} at ${short(source.hash)} — that artifact changed to ${short(latest.hash)} on line ${latest.line}, so the verification no longer covers what this rests on`,
          });
        }
        break;
      }

      case "append": {
        // Invariant 3. Absence is not "nothing to report" — it is nothing
        // reported, and the two are told apart by requiring the field.
        if (!nonEmptyString(record.raw.corrections_since_last_append)) {
          findings.push({
            line: record.line,
            verdict: "omitted-corrections",
            subject: record.id,
            detail:
              '"corrections_since_last_append" is missing — "None." is an answer, an absent field is not',
          });
        }
        const target = asTarget(record.raw.target);
        if (target !== null) hashes.set(target.path, { hash: target.hash, line: record.line });
        break;
      }
    }
  }

  // Invariant 1, the other half: a dispatch with no terminal record at all.
  // This is the one a summary can never surface on its own, because the
  // missing record is missing.
  for (const record of records) {
    if (record.kind !== "dispatch") continue;
    if (terminals.has(record.id)) continue;
    findings.push({
      line: record.line,
      verdict: "no-terminal",
      subject: record.id,
      detail:
        "dispatched and never terminated — an agent that never reported is not an agent that found nothing",
    });
  }

  findings.sort((left, right) => left.line - right.line);

  return {
    findings,
    records: records.length,
    dispatches,
    outcomes,
    verifications,
  };
}

function short(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 12)}…` : hash;
}
