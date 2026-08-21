/**
 * `nullius witness validate` — the deterministic half of the retro kit.
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
 * **Schema 0.2** adds two things, both in service of the same three
 * invariants. A `journal` header record says which schema a journal is written
 * to and — the part that matters — who wrote it: `origin: "hooks"` means the
 * harness runtime emitted these records and the agent could not decline to;
 * `origin: "self-reported"` means an agent wrote them about itself, which
 * certifies internal consistency and nothing else. And a `mutation` kind
 * records a file change, which advances the per-path hash map for invariant 2
 * without pretending anything was checked: an edit verifies nothing, so
 * nothing may rest on one.
 *
 * A journal with no header is read as 0.1 — everything that existed before
 * this record did. A header naming a version this build does not know stops
 * validation with one `UNSUPPORTED-VERSION` finding, because the alternative
 * is a cascade of `MALFORMED` findings that buries the single fact worth
 * knowing: the validator is older than the journal.
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
  | "duplicate-id"
  /** The journal declares a schema this build cannot read. Terminal, and alone. */
  | "unsupported-version";

/**
 * Who emitted the records. The whole subject of the tool is the difference
 * between "the harness attests this" and "the agent says so", so the journal
 * carries it and the summary prints it.
 */
export type JournalOrigin = "hooks" | "self-reported";

/** The v0.2 header record: which schema, and whose account. */
export interface JournalHeader {
  version: string;
  /** null when the header omits `origin` or names one this schema does not know. */
  origin: JournalOrigin | null;
  /** The harness session this journal belongs to, when the producer knows it. */
  session: string | null;
  /** startup / resume / clear / compact — a fork in journal identity, made visible. */
  source: string | null;
}

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
  /** Records the validator could read. Rejected lines appear in `findings`. */
  records: number;
  dispatches: number;
  /** Terminal outcomes, counted apart — the point of invariant 1 is that
   *  these three numbers are three numbers. */
  outcomes: { found: number; empty: number; noReport: number };
  verifications: number;
  /** Recorded file changes. They move the hash map; they verify nothing. */
  mutations: number;
  /** The schema the journal declares. Headerless journals declare none and are read as 0.1. */
  version: string;
  /** The header record, or null when the journal carries none. */
  header: JournalHeader | null;
}

const PASSING: ReadonlySet<JournalVerdict> = new Set<JournalVerdict>(["ok"]);

export function isJournalFailure(verdict: JournalVerdict): boolean {
  return !PASSING.has(verdict);
}

/** The three terminal states. Two of them are not the same state. */
const OUTCOMES = ["found", "empty", "no-report"] as const;
type Outcome = (typeof OUTCOMES)[number];

/**
 * Kinds are a closed list PER VERSION, not one growing list. A `mutation` in a
 * headerless journal is a record from a schema that journal never claimed, and
 * saying so beats accepting it: the version header exists precisely so schema
 * drift is diagnosable rather than merely loud.
 */
const KINDS_V01 = ["dispatch", "report", "verification", "reliance", "append"] as const;
const KINDS_V02 = [...KINDS_V01, "mutation"] as const;
type Kind = (typeof KINDS_V02)[number];

/** Schemas this build can read. Anything else is UNSUPPORTED-VERSION. */
const VERSIONS = ["0.1", "0.2"] as const;
const ORIGINS = ["hooks", "self-reported"] as const;

/** The version applied to a journal that carries no header. */
const IMPLIED_VERSION = "0.1";

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

function asKind(value: unknown, vocabulary: readonly Kind[]): Kind | null {
  return vocabulary.find((kind) => kind === value) ?? null;
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

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

interface HeaderScan {
  header: JournalHeader | null;
  /** 1-based line the header occupies, or null when there is no header. */
  line: number | null;
  findings: JournalFinding[];
  /** True when the schema is unreadable and nothing further should be attempted. */
  stop: boolean;
  /** The version to validate under. */
  version: string;
}

/**
 * A fresh scan each time, never a shared constant. The `findings` array is
 * mutable, and one module-level instance would be handed to every headerless
 * journal in the process — so the first finding pushed here would start
 * appearing in unrelated reports, in a validator whose whole job is not
 * confusing one document's problems for another's.
 */
function headerless(): HeaderScan {
  return { header: null, line: null, findings: [], stop: false, version: IMPLIED_VERSION };
}

/**
 * Read the first record, if it is a header. Everything about how the rest of
 * the journal is read follows from this — including whether it is read at all.
 */
function scanHeader(lines: string[]): HeaderScan {
  for (let index = 0; index < lines.length; index += 1) {
    const raw = (lines[index] ?? "").trim();
    if (raw.length === 0) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Unparseable first line: not a header, and pass 1 will report it.
      return headerless();
    }
    if (!isObject(parsed) || parsed["kind"] !== "journal") return headerless();

    const line = index + 1;
    const declared = parsed["version"];
    const version = typeof declared === "string" ? declared : null;
    if (version === null || !VERSIONS.some((known) => known === version)) {
      // One finding, and then silence. Reporting every subsequent record as
      // MALFORMED would be technically true and practically useless: the
      // records are fine, this build is old.
      return {
        header: null,
        line,
        stop: true,
        version: version ?? "(absent)",
        findings: [
          {
            line,
            verdict: "unsupported-version",
            subject: version ?? "(absent)",
            detail:
              version === null
                ? `a journal header needs "version" — without it the schema is unknowable, and guessing at it is how a validator reports confident nonsense (this build reads: ${VERSIONS.join(", ")})`
                : `journal declares schema ${version}; this build reads ${VERSIONS.join(", ")} — nothing further was read, because records written to a schema this build does not know are not records it can judge`,
          },
        ],
      };
    }

    // The version is readable, so the rest of the journal is. A broken
    // `origin` is a defect in the header, not a reason to stop: the schema is
    // known, and the invariants are what the journal is for.
    const findings: JournalFinding[] = [];
    const origin = ORIGINS.find((known) => known === parsed["origin"]) ?? null;
    if (origin === null) {
      findings.push({
        line,
        verdict: "malformed",
        subject: "journal",
        detail: `a journal header needs "origin": one of ${ORIGINS.join(", ")} — a journal that does not say whether the harness or the agent wrote it invites the reading that flatters it`,
      });
    }

    return {
      header: {
        version,
        origin,
        session: optionalString(parsed["session"]),
        source: optionalString(parsed["source"]),
      },
      line,
      findings,
      stop: false,
      version,
    };
  }

  return headerless();
}

export function validateJournal(content: string): JournalReport {
  const records: JournalRecord[] = [];
  const byId = new Map<string, JournalRecord>();

  const lines = content.split("\n");

  // --- Pass 0: which schema is this, and whose account of the run is it?
  const scan = scanHeader(lines);
  if (scan.stop) {
    // Deliberately zero counts: nothing after the header was read, and
    // reporting counts for records nobody looked at is the shape of lie this
    // whole file exists to refuse.
    return {
      findings: scan.findings,
      records: 0,
      dispatches: 0,
      outcomes: { found: 0, empty: 0, noReport: 0 },
      verifications: 0,
      mutations: 0,
      version: scan.version,
      header: null,
    };
  }
  const findings: JournalFinding[] = [...scan.findings];
  const vocabulary: readonly Kind[] = scan.version === IMPLIED_VERSION ? KINDS_V01 : KINDS_V02;

  // --- Pass 1: shape. A record that does not parse cannot be reasoned about,
  // and is reported rather than skipped: a journal the validator silently
  // ignores half of is worse than no journal.
  for (let index = 0; index < lines.length; index += 1) {
    const raw = (lines[index] ?? "").trim();
    if (raw.length === 0) continue;
    const line = index + 1;
    if (line === scan.line) continue; // the header, already read in pass 0

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

    if (parsed["kind"] === "journal") {
      // A header anywhere but line 1 is not a header — it is a second account
      // of the same run, or the same one appended twice. Either way the reader
      // would have to guess which one governs.
      findings.push({
        line,
        verdict: "malformed",
        subject: "journal",
        detail:
          "a journal header must be the first record — a header further down governs nothing, and a reader would have to guess which account applies",
      });
      continue;
    }

    const kind = asKind(parsed["kind"], vocabulary);
    if (kind === null) {
      const laterSchema = KINDS_V02.find((known) => known === parsed["kind"]);
      findings.push({
        line,
        verdict: "malformed",
        subject: String(parsed["id"] ?? raw.slice(0, 40)),
        detail:
          laterSchema === undefined
            ? `unknown kind ${JSON.stringify(parsed["kind"])} — expected one of: ${vocabulary.join(", ")}`
            : `kind ${JSON.stringify(parsed["kind"])} arrived in schema 0.2, and this journal is read as ${scan.version} — declare it with a {"kind":"journal","version":"0.2",…} first record`,
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
  let mutations = 0;

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
          // Naming a mutation is the interesting failure, and worth its own
          // sentence: an edit is evidence that something CHANGED, which is the
          // opposite of evidence that something was checked.
          const named = byId.get(on as string);
          findings.push({
            line: record.line,
            verdict: "dangling-reference",
            subject: record.id,
            detail:
              named?.kind === "mutation"
                ? `relies on '${String(on)}', which is a mutation — a mutation records that an artifact changed, never that anything was checked, so nothing can rest on one`
                : `no verification with id '${String(on)}' appears earlier in this journal`,
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

      case "mutation": {
        // Invariant 2's other half. An edit does not verify anything, so this
        // record never enters `verified` — but it MUST move the hash map, or a
        // verification quoted across an edit stays quotable.
        mutations += 1;
        const target = asTarget(record.raw.target);
        if (target === null) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail:
              'a mutation needs "target": {"path": ..., "hash": ...} — a change that does not say what it changed cannot invalidate the verification it invalidated',
          });
          break;
        }
        hashes.set(target.path, { hash: target.hash, line: record.line });
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
    // Records the validator could READ: the header plus everything that got
    // past pass 1. Lines rejected as malformed or duplicate-id are reported as
    // findings and deliberately not counted here — but they are also lines in
    // the file, so this number is not the file's line count and must not be
    // described as one.
    records: records.length + (scan.line === null ? 0 : 1),
    dispatches,
    outcomes,
    verifications,
    mutations,
    version: scan.version,
    header: scan.header,
  };
}

function short(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 12)}…` : hash;
}
