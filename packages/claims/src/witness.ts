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
 * certifies internal consistency and nothing else. From 0.6 the header's
 * `origin` covers **the records that carry no origin of their own**, because
 * the tiers now mix inside one file. And a `mutation` kind
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
 * **Schema 0.4** adds place. The header may name the repository state a run
 * began in (`branch`, `head`, `worktree`) and a `verification` may pin the
 * revision it was checked against (`rev`). None of it is read by a verdict —
 * a verdict that depends on a field no producer emits yet fires on nobody. The
 * bump is owed to the other half: `verification.rev` must be a stamp and a
 * `mutation` may not carry `rev` at all, and both were previously ignored. A
 * record that was valid became invalid, which is what bumps a schema; the
 * fields being optional does not rescue it, because optionality is a property
 * of a field and validity is a property of a record.
 *
 * **Schema 0.6** adds the run-ledger producer's half of the bargain: a
 * `prompt` kind for the operator's turn (trigger 1), a **required** per-record
 * `origin: "self-reported"` on `stage`, `resolution`, `decision` and `check`
 * (trigger 3), a `user` on the header that must name someone when present, and
 * a closed `expects` on `dispatch` that scopes SILENT-REVIEWER to the
 * dispatches which declared a review contract. That last one is a loosening,
 * which is also a change to the set of records a verdict fires on — it rides
 * on a bump the other two owed anyway.
 *
 * See spec/witness-journal.md.
 */

import { STAMP_SHAPE } from "./parseClaims";

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
  /** A blocker no resolution ever answered. v0.3 and later. */
  | "suppressed-finding"
  /** A dispatch that returned with something to say, and filed no finding. v0.3 and later. */
  | "silent-reviewer"
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
  /**
   * The origin of every record **that carries no origin of its own** — from
   * 0.6 the four coordinator kinds carry theirs, so this is no longer a
   * statement about the whole file. null when the header omits `origin` or
   * names one this schema does not know; records left to a null header origin
   * are `unattributed`, never hook-tier.
   */
  origin: JournalOrigin | null;
  /** The harness session this journal belongs to, when the producer knows it. */
  session: string | null;
  /** startup / resume / clear / compact — a fork in journal identity, made visible. */
  source: string | null;
  /**
   * The branch checked out when the run began. null when absent — including
   * on a detached HEAD, where omitting the field is the honest answer and a
   * sentinel like `"(detached)"` would be a fact nobody can check.
   */
  branch: string | null;
  /**
   * The commit the session **started from** — not the tree any later record
   * was written against. A session commits while it runs, so any other reading
   * is stale by construction. spec/witness-journal.md carries the definition.
   */
  head: string | null;
  /** A stable identifier for the worktree, never a filesystem path. */
  worktree: string | null;
  /**
   * v0.6. Who was steering — the tree's operator, from `git config user.name`.
   * Absent when the producer did not record one; a present-but-unusable shape
   * is MALFORMED at 0.6 rather than quietly dropped, so it never appears here
   * as an absence it is not.
   */
  user?: { name: string };
}

/**
 * v0.6. How many of each ledger kind the journal carries. Namespaced because
 * `JournalReport.findings` is already the array of validator findings and is
 * consumed as one in three CLIs — a counter of that name beside it would be a
 * redefinition wearing an addition's clothes.
 */
export interface LedgerCounts {
  stages: number;
  /** `finding` RECORDS. Not `JournalReport.findings`, which are verdicts. */
  findings: number;
  resolutions: number;
  checks: number;
  decisions: number;
  prompts: number;
}

/**
 * v0.6. Which tier each record belongs to, once per-record `origin` exists and
 * the header's value covers only the records that do not carry their own.
 *
 * A partition, not three samples: every record the validator could read lands
 * in exactly one of the three, so a tier cannot go missing between them.
 *
 * The `journal` header is **not** among them, and the sum is therefore
 * `JournalReport.records` minus one on any journal that has a header — which,
 * at 0.6, is every journal, since the version is only known from a header.
 * Saying "the sum is the record count" would be wrong by exactly one, always,
 * and wrong in the flattering direction: it would imply a tier accounted for
 * the header rather than that the header belongs to no tier. The header
 * declares whose the *other* records are; it is the frame, not a record in
 * the picture.
 */
export interface ProvenanceCounts {
  /** No origin of their own, under a header that says `hooks`. */
  hooks: number;
  /** Their own `origin: "self-reported"`, or none under a self-reported header. */
  selfReported: number;
  /**
   * Records that belong to nobody: no origin of their own under a header whose
   * origin is null or absent, plus any record whose own origin this schema
   * cannot read. Counting these as hook-tier would be exactly the flattering
   * default the field exists to remove.
   */
  unattributed: number;
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
  /**
   * v0.6 ledger counts, or **null below 0.6** — the floor is decided here, by
   * the private `versionAtLeast`, and never by a caller. 0.3–0.5 journals may
   * carry ledger kinds; their summaries stay exactly as they are today, so the
   * summary changes shape once, at the floor where the provenance line does.
   */
  ledger: LedgerCounts | null;
  /** v0.6 provenance counts, on the same rule and the same floor. */
  provenance: ProvenanceCounts | null;
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
/**
 * v0.3 — the run ledger. Five kinds for what an agent contributes to a run,
 * derived from a 91-file corpus of hand-written evidence files rather than
 * invented; see openspec/changes/add-run-ledger/corpus-derivation.md.
 */
const KINDS_V03 = [...KINDS_V02, "stage", "finding", "resolution", "check", "decision"] as const;
/**
 * v0.6 — the human's turn. A `prompt` is the one record in the journal the
 * agent did not cause: it is what the operator asked for, joined to the work
 * it caused by the harness's own `prompt_id`. A new kind is trigger 1 of the
 * versioning rule, which is one of the three reasons 0.6 exists.
 */
const KINDS_V06 = [...KINDS_V03, "prompt"] as const;
type Kind = (typeof KINDS_V06)[number];

/**
 * Schemas this build can read, **in ascending order**. Anything else is
 * UNSUPPORTED-VERSION.
 *
 * The order is load-bearing, not presentation: `versionAtLeast` compares by
 * index into this list, so an out-of-order insert silently ungates every
 * version-gated verdict for the versions it displaces — and nothing else in
 * this file would notice. A unit test pins the ordering for that reason.
 *
 * Exported for that test. Deliberately absent from `index.ts`: the public
 * barrel re-exports by explicit name list, and this is an internal constant.
 */
export const VERSIONS = ["0.1", "0.2", "0.3", "0.4", "0.5", "0.6"] as const;

/**
 * Version floors, compared by **index into `VERSIONS`** and never by string.
 * `"0.10" >= "0.3"` is false, so a lexicographic floor would ungate every
 * gated verdict the moment a two-digit minor exists — the same silent-ungating
 * defect an equality gate causes at the next bump, merely deferred to a
 * version nobody is looking at yet.
 *
 * One predicate for every version-gated behaviour in this file, nine call
 * sites: the identity-field rejection, the header `user` rejection, the
 * `verification.rev` rejection, the `mutation.rev` rejection, the
 * `dispatch.expects` rejection, the per-record `origin` requirement, the
 * ledger verdicts, SILENT-REVIEWER's 0.6 scoping, and the `ledger` /
 * `provenance` counter blocks. Nine separate comparisons would be nine
 * chances to write one of them as an equality.
 *
 * It stays private on purpose. `cli.ts` renders the counter blocks on
 * presence — they are `null` below their floor — so the floor is decided once,
 * here, and no caller gets a second copy of the comparison to drift from.
 */
function versionAtLeast(version: string, floor: (typeof VERSIONS)[number]): boolean {
  const declared = VERSIONS.findIndex((known) => known === version);
  return declared >= 0 && declared >= VERSIONS.indexOf(floor);
}

/**
 * Repository identity, all optional and none of them read by a verdict. Listed
 * once so the empty-string rejection below names the offending field rather
 * than reporting three indistinguishable findings.
 */
const IDENTITY_FIELDS = ["branch", "head", "worktree"] as const;

/**
 * Which vocabulary each declared version gets. A map rather than the ternary
 * this replaced: that shape stopped scaling at the third version, and the
 * whole point of a closed-list-per-version is that adding one stays cheap.
 */
const VOCABULARY: ReadonlyMap<string, readonly Kind[]> = new Map([
  ["0.1", KINDS_V01 as readonly Kind[]],
  ["0.2", KINDS_V02 as readonly Kind[]],
  ["0.3", KINDS_V03 as readonly Kind[]],
  // 0.4 adds no kind. It tightens which records are valid — `verification.rev`
  // must be a stamp, `mutation.rev` is refused — so the vocabulary is v0.3's,
  // unchanged, and no new kinds constant exists to drift from it.
  ["0.4", KINDS_V03 as readonly Kind[]],
  // 0.5 adds no kind and tightens nothing. It exists because `nullius oracle`
  // introduces MALFORMED-JUSTIFICATION, a verdict that reads `decision.justifies`
  // and fails the record carrying it — the new-verdict trigger of the versioning
  // rule in `spec/witness-journal.md`. `witness validate` still never reads the
  // field, so every 0.4 journal is a valid 0.5 journal and validation gains no
  // finding; the version moves so a reader knows a clean validate no longer
  // means what it used to.
  ["0.5", KINDS_V03 as readonly Kind[]],
  // 0.6 adds `prompt` and must therefore be LAST. Insertion order into this
  // map is what `KIND_INTRODUCED` below derives its "arrived in schema X"
  // message from — exactly as `VERSIONS` order drives the version floors — so
  // an entry inserted above an earlier version would attribute every kind they
  // share to the wrong schema, and the record from the future would be told to
  // declare a header that does not accept it.
  ["0.6", KINDS_V06 as readonly Kind[]],
]);

/**
 * The schema each kind arrived in, so a record from the future can say which
 * version would accept it instead of naming one hardcoded guess.
 */
const KIND_INTRODUCED: ReadonlyMap<string, string> = (() => {
  // Derived from VOCABULARY rather than re-listed. A hand-written copy drifts
  // the moment a kind is added and nothing notices: the new kind loses its
  // "arrived in schema X" message and degrades to "unknown kind", which is the
  // diagnosis the version header exists to prevent.
  const introduced = new Map<string, string>();
  for (const [version, kinds] of VOCABULARY) {
    for (const kind of kinds) if (!introduced.has(kind)) introduced.set(kind, version);
  }
  return introduced;
})();
const ORIGINS = ["hooks", "self-reported"] as const;

/**
 * The only value a per-record `origin` may take, and deliberately NOT
 * `ORIGINS`. That list is the header's, and it contains `"hooks"` — which on a
 * `resolution` would be a coordinator claiming the harness attested a judgement
 * the coordinator made about its own run. The whole point of the per-record
 * field is that the tiers mix inside one journal, so the tier a record may
 * claim for itself is the weaker one, and only that one.
 */
const RECORD_ORIGIN = "self-reported";

/**
 * Kinds a coordinator writes about its own run. At 0.6 each one carries
 * `origin: "self-reported"` — required, because the header's origin is the
 * origin of every record that does NOT carry its own, and a hook-tier header
 * would otherwise launder these into the tier they are least entitled to.
 * `finding` is absent by design: the recorder extracts findings from the
 * harness payload, so the header's `hooks` is true of them.
 */
const SELF_REPORTED_KINDS: ReadonlySet<Kind> = new Set<Kind>([
  "stage",
  "resolution",
  "decision",
  "check",
]);

/**
 * What a dispatch may say it expects back. A closed vocabulary with one member
 * rather than a free string: SILENT-REVIEWER reads this field at 0.6, so a
 * producer typo would silently shrink the verdict's denominator to nothing and
 * no finding anywhere would say so. Every other closed vocabulary in this file
 * reports rather than skips, and a field a verdict reads has the least claim to
 * an exception.
 */
const EXPECTATIONS = ["findings"] as const;

/** The version applied to a journal that carries no header. */
const IMPLIED_VERSION = "0.1";

/**
 * Exactly three, because the corpus uses exactly three. `looks-good` is the
 * load-bearing one: an explicit nothing-found is how a reviewer proves it was
 * not silent, so a schema that only accepted problems would make
 * SILENT-REVIEWER unanswerable.
 *
 * Exported, and named in `index.ts`. Unlike `VERSIONS` — which is exported for
 * a unit test and kept out of the barrel because a caller comparing versions
 * itself is the second copy of a floor this file decides once — a closed
 * vocabulary has no second-copy hazard: it is the *definition* the validator
 * enforces, and a producer that wants to refuse a bad value before it writes
 * has to be able to ask for it. The alternative is what this repository had
 * for one chunk — the list restated in `packages/kit/src/cli.ts` behind a
 * warning, with a test holding the copy honest in one direction only, because
 * a member the kernel ADDS is invisible to a producer that never sees it.
 */
export const SEVERITIES = ["blocker", "concern", "looks-good"] as const;
type Severity = (typeof SEVERITIES)[number];

/**
 * A finding's fate. Derived from the corpus, where the five most common
 * outcomes were ones a guessed vocabulary had missed.
 *
 * Exported for the producer, for the reason given on `SEVERITIES` above.
 */
export const RESOLUTION_OUTCOMES = [
  "resolved",
  "fixed",
  "dropped",
  "duplicate",
  "deferred",
  "folded-in",
  "accepted",
  "rejected",
  "out-of-scope",
  "deviation-accepted",
] as const;
type ResolutionOutcome = (typeof RESOLUTION_OUTCOMES)[number];

/**
 * These two do not close a finding on its merits — they redirect it into
 * another one. Without naming the survivor they are indistinguishable from
 * `dropped`, which is the disappearance this schema exists to catch.
 */
const MERGE_OUTCOMES: ReadonlySet<ResolutionOutcome> = new Set<ResolutionOutcome>([
  "duplicate",
  "folded-in",
]);

/** A command either passed or it did not. Exported with the two above. */
export const CHECK_OUTCOMES = ["pass", "fail"] as const;

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
    /** v0.4, on `verification` only — the revision the claim was checked at. */
    rev: unknown;
    relies_on: unknown;
    corrections_since_last_append: unknown;
    // v0.3 — the run ledger
    phase: unknown;
    iteration: unknown;
    pr: unknown;
    change: unknown;
    severity: unknown;
    author: unknown;
    text: unknown;
    stage: unknown;
    subject: unknown;
    ref: unknown;
    convergence: unknown;
    finding: unknown;
    merges_into: unknown;
    command: unknown;
    counts: unknown;
    choice: unknown;
    rationale: unknown;
    departed_from: unknown;
    resolves: unknown;
    // v0.6 — the run-ledger producer
    /** On `dispatch`: what the dispatched agent is expected to return. */
    expects: unknown;
    /** On the four coordinator kinds: the tier the record claims for itself. */
    origin: unknown;
    /** On `prompt`: the hashed mode's two halves. `text` is listed above. */
    chars: unknown;
    hash: unknown;
    /** On `prompt`: metadata, read by nothing — listed so the index is whole. */
    truncated: unknown;
    /**
     * Header-only, and read off the parsed header rather than through this
     * type. Listed so this stays a complete index of the keys this file names.
     */
    user: unknown;
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

function asSeverity(value: unknown): Severity | null {
  return SEVERITIES.find((severity) => severity === value) ?? null;
}

function asResolutionOutcome(value: unknown): ResolutionOutcome | null {
  return RESOLUTION_OUTCOMES.find((outcome) => outcome === value) ?? null;
}

/** A positive integer, or null. Iteration 0 is not an iteration. */
function asIteration(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * A non-negative integer. Zero is allowed here and not in `asIteration`: an
 * empty prompt is a length, whereas iteration 0 is not an iteration.
 */
function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** An array of non-empty strings, or null when present and malformed. */
function asStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((item) => nonEmptyString(item))) return null;
  return value as string[];
}

/** An object whose every value is a non-negative integer. */
function isCounts(value: unknown): boolean {
  return (
    isObject(value) &&
    Object.values(value).every(
      (count) => typeof count === "number" && Number.isInteger(count) && count >= 0,
    )
  );
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

    // Repository identity. Read at every declared version — a producer that
    // knows the fields but still stamps 0.2 gets them recorded, and nothing
    // here reads them as evidence about the run. What IS version-gated is the
    // rejection below.
    const identity: { branch: string | null; head: string | null; worktree: string | null } = {
      branch: null,
      head: null,
      worktree: null,
    };
    for (const field of IDENTITY_FIELDS) {
      const value = parsed[field];
      if (value === undefined) continue;
      if (nonEmptyString(value)) {
        identity[field] = value as string;
        continue;
      }
      // 0.4 semantics, and deliberately not applied downward: a 0.3 journal
      // that validated clean does not become invalid because the validator
      // learned a newer schema. `nonEmptyString`, not `optionalString` — the
      // latter maps "" to null and reports nothing, which would leave this
      // finding unreachable while the fixture still exited 1 on its other
      // records.
      if (!versionAtLeast(version, "0.4")) continue;
      findings.push({
        line,
        verdict: "malformed",
        subject: "journal",
        detail: `"${field}" is ${JSON.stringify(value)} — an identity field must be a non-empty string when present; omitting the key is the supported way to say git could not answer, and an empty string instead asserts the producer knows and names nothing`,
      });
    }

    // v0.6. The operator, in the same class as `branch` and `worktree` — and
    // deliberately NOT in IDENTITY_FIELDS above. That list is flat and
    // string-typed, and its loop rejects a blank at 0.4; adding a nested
    // `user` to it would tighten 0.4 and 0.5 retroactively, which is the one
    // thing a schema floor exists to prevent.
    //
    // The name is recorded at every declared version, like the other three.
    // What is gated is the rejection — and it fails CLOSED on an unrecognised
    // shape (`user: "Arman"`, `user: {}`) for the reason `expects` does: a
    // producer writing the wrong shape holds a wrong model of the field, and
    // dropping the value silently is how that model survives.
    let user: { name: string } | null = null;
    const declaredUser = parsed["user"];
    if (declaredUser !== undefined) {
      const name = isObject(declaredUser) ? declaredUser["name"] : undefined;
      if (nonEmptyString(name)) {
        user = { name: name as string };
      } else if (versionAtLeast(version, "0.6")) {
        findings.push({
          line,
          verdict: "malformed",
          subject: "journal",
          detail: `"user" is ${JSON.stringify(declaredUser)} — it must be an object carrying a non-empty "name"; omitting the key is the supported way to say git could not answer, and any other shape asserts an operator it does not name`,
        });
      }
    }

    return {
      header: {
        version,
        origin,
        session: optionalString(parsed["session"]),
        source: optionalString(parsed["source"]),
        ...identity,
        ...(user === null ? {} : { user }),
      },
      line,
      findings,
      stop: false,
      version,
    };
  }

  return headerless();
}

/**
 * Terminal record kinds — the only kinds a dispatch can end on. `"report"` is
 * the only one today, but this is exported so a future terminal kind is added
 * to one list instead of two: `checkRuleCoverage`
 * (packages/claims/src/ruleCoverage.ts) imports and defers to this rather
 * than hardcoding its own copy, so it stays coupled to what this file's
 * switch below actually treats as terminal. Keep this in sync with the
 * `case "report":` below — a comment there points back here.
 */
export const TERMINAL_RECORD_KINDS: readonly string[] = ["report"];

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
      // Null, not zeroed. Nothing below the header was read, and a block of
      // zeros here would say "this journal carries no ledger records" about a
      // file nobody looked at.
      ledger: null,
      provenance: null,
    };
  }
  const findings: JournalFinding[] = [...scan.findings];
  const vocabulary: readonly Kind[] = VOCABULARY.get(scan.version) ?? KINDS_V01;

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
      const laterSchema =
        typeof parsed["kind"] === "string" ? KIND_INTRODUCED.get(parsed["kind"]) : undefined;
      findings.push({
        line,
        verdict: "malformed",
        subject: String(parsed["id"] ?? raw.slice(0, 40)),
        detail:
          laterSchema === undefined
            ? `unknown kind ${JSON.stringify(parsed["kind"])} — expected one of: ${vocabulary.join(", ")}`
            : `kind ${JSON.stringify(parsed["kind"])} arrived in schema ${laterSchema}, and this journal is read as ${scan.version} — declare it with a {"kind":"journal","version":"${laterSchema}",…} first record`,
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
  /** v0.3 findings that parsed, by id — the population SUPPRESSED-FINDING walks. */
  const ledger = new Map<string, { record: JournalRecord; severity: Severity }>();
  /** Finding ids a NON-merge resolution answered on their merits. */
  const answered = new Set<string>();
  /** finding id -> the finding it was merged into. A transferred obligation. */
  const merged = new Map<string, string>();
  /** Dispatch ids whose terminal already drew COLLAPSED-STATE. */
  const collapsed = new Set<string>();
  /** Dispatch ids some finding spoke for. */
  const spokenFor = new Set<string>();

  for (const record of records) {
    // v0.6. Provenance is per record where the tiers mix. Checked before the
    // switch and skipping the rest of the record, which is the break-on-first
    // discipline every case below already keeps: a record whose tier cannot be
    // read is not a record whose content should be believed, and the existing
    // "a resolution that failed to parse does not discharge a blocker" rule
    // says so for the same reason.
    if (versionAtLeast(scan.version, "0.6") && SELF_REPORTED_KINDS.has(record.kind)) {
      if (record.raw.origin !== RECORD_ORIGIN) {
        findings.push({
          line: record.line,
          verdict: "malformed",
          subject: record.id,
          detail:
            record.raw.origin === undefined
              ? `a ${record.kind} needs "origin": "${RECORD_ORIGIN}" — the coordinator wrote it about its own run, and a header saying "hooks" would otherwise attest it as harness-emitted`
              : `"origin" is ${JSON.stringify(record.raw.origin)} on a ${record.kind} — the only value a record may claim for itself is "${RECORD_ORIGIN}"; a record cannot promote itself to the tier that means the agent could not decline to write it`,
        });
        continue;
      }
    }

    switch (record.kind) {
      case "dispatch":
        dispatches += 1;
        // v0.6. A closed vocabulary with one member. Reported rather than
        // skipped: SILENT-REVIEWER reads this field at 0.6, so `expects:
        // "reviews"` slipping through silently would disarm the verdict for
        // every dispatch a producer typo touched, with nothing anywhere
        // saying so.
        if (
          versionAtLeast(scan.version, "0.6") &&
          record.raw.expects !== undefined &&
          !EXPECTATIONS.some((known) => known === record.raw.expects)
        ) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail: `"expects" is ${JSON.stringify(record.raw.expects)} — it must be one of ${EXPECTATIONS.join(", ")} when present; SILENT-REVIEWER reads this field, so an unrecognised value would quietly shrink the set of dispatches it can fire on`,
          });
        }
        break;

      // The only terminal kind today — see the exported TERMINAL_RECORD_KINDS
      // above, which packages/claims/src/ruleCoverage.ts imports instead of
      // hardcoding its own copy. A second terminal kind added here and not
      // there would go unnoticed by that scan.
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
            // SILENT-REVIEWER rests on `found` meaning "I have something to
            // say". That is only true once this check passes, so a collapsed
            // report must not also be accused of silence: the two remedies
            // contradict each other.
            collapsed.add(dispatch.id);
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
        // v0.4. A verification is the only kind making a claim meant to be
        // checked again, so it is the only kind that may pin the tree it was
        // checked against — and a ref name is not a tree. `main` names a
        // different commit next week, which is precisely the staleness a stamp
        // exists to escape, so it is refused rather than stored.
        if (
          versionAtLeast(scan.version, "0.4") &&
          record.raw.rev !== undefined &&
          !(typeof record.raw.rev === "string" && STAMP_SHAPE.test(record.raw.rev))
        ) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail: `"rev" is ${JSON.stringify(record.raw.rev)} — a verification's rev must be lower-case hex of 7 to 40 characters, the shape a stamp is written in; a ref name is mutable and names a different tree next week`,
          });
          // Reported, and then the record still feeds invariant 2 below. The
          // target is well formed, and refusing to record it over a bad extra
          // key would silence a STALE-VERIFICATION rather than the rev — a
          // rejection that costs another verdict its evidence is the wrong
          // trade in a validator whose failure mode is going quiet.
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
        // v0.4. The only well-formed extra key this schema hard-fails, and
        // the criterion is narrow on purpose: NOT "a known key on a record
        // that cannot carry it" — `target` on a dispatch and `severity` on a
        // check are ignored today and stay ignored. It is the false belief the
        // key encodes. `rev` means *this claim can be checked again*; a
        // mutation asserts something changed, which is the opposite of a claim
        // to re-check. A producer emitting it holds a wrong model of what a
        // mutation is, and every record it writes is suspect for that reason.
        if (versionAtLeast(scan.version, "0.4") && record.raw.rev !== undefined) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail:
              'a mutation must not carry "rev" — its target hash is the identity of what changed, and a mutation asserts nothing to re-verify; a producer stamping one has the wrong model of the kind',
          });
          // Falls through to the hash map for the same reason the verification
          // case does: invariant 2 must not lose a mutation over an extra key.
        }
        hashes.set(target.path, { hash: target.hash, line: record.line });
        break;
      }

      case "stage": {
        // The grouping record. `phase` stays an open string on purpose: a
        // closed enum would have rejected about 5% of the corpus it was
        // derived from, which is a tidiness nobody practised.
        if (!nonEmptyString(record.raw.phase)) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail:
              'a stage needs a non-empty "phase" — conventionally pre-review, verify, post-review, address, or refine, but any phase a run actually had is valid',
          });
          break;
        }
        if (record.raw.iteration !== undefined && asIteration(record.raw.iteration) === null) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail: `"iteration" is ${JSON.stringify(record.raw.iteration)} — it must be a positive integer when present`,
          });
          break;
        }
        if (
          record.raw.pr !== undefined &&
          !nonEmptyString(record.raw.pr) &&
          typeof record.raw.pr !== "number"
        ) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail: `"pr" is ${JSON.stringify(record.raw.pr)} — it must be a non-empty string or a number when present`,
          });
          break;
        }
        if (record.raw.change !== undefined && !nonEmptyString(record.raw.change)) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail:
              '"change" is present but blank — a stage either names the change it belongs to or omits the field',
          });
        }
        break;
      }

      case "finding": {
        const severity = asSeverity(record.raw.severity);
        if (severity === null) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail: `severity ${JSON.stringify(record.raw.severity)} is not one of ${SEVERITIES.join(", ")}`,
          });
          break;
        }
        // Free string by design: enumerating agent names would hard-code one
        // project's org chart into a schema meant to outlive it.
        if (!nonEmptyString(record.raw.author)) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail: 'a finding needs a non-empty "author" — the agent or person who raised it',
          });
          break;
        }
        if (!nonEmptyString(record.raw.text)) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail:
              'a finding needs non-empty "text" — structure goes around the prose, never instead of it',
          });
          break;
        }
        const convergence = record.raw.convergence;
        if (convergence !== undefined && (asStringList(convergence) === null || (convergence as unknown[]).length === 0)) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail:
              Array.isArray(convergence) && convergence.length === 0
                ? '"convergence" is empty — corroboration by nobody is not corroboration; omit the field instead'
                : '"convergence" must be an array of non-empty strings naming who independently corroborated this',
          });
          break;
        }

        // Registered BEFORE the optional reference checks, and those checks
        // do not `break`. A typo in an unrelated optional field must not make
        // a blocker vanish from SUPPRESSED-FINDING, nor make the reviewer that
        // filed it look silent — the record is a finding either way, and the
        // dangling reference is reported on its own merits.
        ledger.set(record.id, { record, severity });

        const stageRef = record.raw.stage;
        if (stageRef !== undefined) {
          const stage = byId.get(String(stageRef));
          // Order is load-bearing here, not incidental: `byId` is fully
          // populated in pass 1, so without the line comparison a forward
          // reference resolves and the message below would be a lie.
          if (stage === undefined || stage.kind !== "stage" || stage.line > record.line) {
            findings.push({
              line: record.line,
              verdict: "dangling-reference",
              subject: record.id,
              detail:
                stage !== undefined && stage.kind === "stage"
                  ? `stage '${String(stageRef)}' is declared later, on line ${stage.line} — a finding cannot belong to a stage the run had not reached`
                  : `no stage with id '${String(stageRef)}' appears earlier in this journal`,
            });
          }
        }

        const dispatchRef = record.raw.dispatch;
        if (dispatchRef !== undefined) {
          const dispatch = byId.get(String(dispatchRef));
          if (dispatch === undefined || dispatch.kind !== "dispatch" || dispatch.line > record.line) {
            findings.push({
              line: record.line,
              verdict: "dangling-reference",
              subject: record.id,
              detail:
                dispatch !== undefined && dispatch.kind === "dispatch"
                  ? `dispatch '${String(dispatchRef)}' is made later, on line ${dispatch.line} — a finding cannot answer a dispatch that had not happened`
                  : `no dispatch with id '${String(dispatchRef)}' appears earlier in this journal`,
            });
          } else {
            spokenFor.add(dispatch.id);
          }
        }
        break;
      }

      case "resolution": {
        const outcome = asResolutionOutcome(record.raw.outcome);
        if (outcome === null) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail: `outcome ${JSON.stringify(record.raw.outcome)} is not one of ${RESOLUTION_OUTCOMES.join(", ")}`,
          });
          break;
        }
        if (!nonEmptyString(record.raw.text)) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail: 'a resolution needs non-empty "text" — the reason, not just the verdict',
          });
          break;
        }

        const findingRef = record.raw.finding;
        if (!nonEmptyString(findingRef)) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail: 'a resolution needs "finding": the id of the finding it answers',
          });
          break;
        }
        const target = byId.get(findingRef as string);
        if (target === undefined || target.kind !== "finding" || target.line > record.line) {
          findings.push({
            line: record.line,
            verdict: "dangling-reference",
            subject: record.id,
            detail:
              target === undefined
                ? `no finding with id '${String(findingRef)}' appears in this journal`
                : target.kind !== "finding"
                  ? `'${String(findingRef)}' is a ${target.kind} on line ${target.line}, not a finding — a resolution answers a finding`
                  : `finding '${String(findingRef)}' is raised later, on line ${target.line} — a finding cannot be answered before it is raised`,
          });
          break;
        }

        // A merge that names no survivor is a disappearance wearing a label.
        if (MERGE_OUTCOMES.has(outcome)) {
          const into = record.raw.merges_into;
          if (!nonEmptyString(into)) {
            findings.push({
              line: record.line,
              verdict: "malformed",
              subject: record.id,
              detail: `outcome "${outcome}" needs "merges_into": the finding this one folds into — without it, a merge is indistinguishable from dropping it`,
            });
            break;
          }
          const survivor = byId.get(into as string);
          if (survivor === undefined || survivor.kind !== "finding") {
            findings.push({
              line: record.line,
              verdict: "dangling-reference",
              subject: record.id,
              detail: `merges into '${String(into)}', which is not a finding in this journal`,
            });
            break;
          }
          if (survivor.id === target.id) {
            findings.push({
              line: record.line,
              verdict: "malformed",
              subject: record.id,
              detail: `merges '${target.id}' into itself — a finding cannot be a duplicate of itself, and treating it as one would discharge it while answering nothing`,
            });
            break;
          }
          // A merge transfers the obligation, it does not end it. Recorded as
          // an edge so SUPPRESSED-FINDING can follow the chain to whoever
          // actually answers — folding a blocker into an unpoliced concern is
          // otherwise a silent discharge.
          merged.set(target.id, survivor.id);
          break;
        }

        answered.add(target.id);
        break;
      }

      case "check": {
        // Not a verification: it makes no claim about a file's hash, so it
        // never touches the hash map and nothing can go stale against it.
        if (!nonEmptyString(record.raw.command)) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail: 'a check needs a non-empty "command" — what ran',
          });
          break;
        }
        if (!CHECK_OUTCOMES.some((outcome) => outcome === record.raw.outcome)) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail: `outcome ${JSON.stringify(record.raw.outcome)} is not one of ${CHECK_OUTCOMES.join(", ")}`,
          });
          break;
        }
        if (!nonEmptyString(record.raw.text)) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail: 'a check needs non-empty "text" — what the run showed, in words',
          });
          break;
        }
        if (record.raw.counts !== undefined && !isCounts(record.raw.counts)) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail: '"counts" must be an object of non-negative integers',
          });
        }
        break;
      }

      case "decision": {
        if (!nonEmptyString(record.raw.choice)) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail: 'a decision needs a non-empty "choice" — the approach taken',
          });
          break;
        }
        if (!nonEmptyString(record.raw.rationale)) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail:
              'a decision needs a non-empty "rationale" — a choice without its reason is not a decision anyone can audit',
          });
          break;
        }
        for (const field of ["departed_from", "resolves"] as const) {
          if (record.raw[field] !== undefined && !nonEmptyString(record.raw[field])) {
            findings.push({
              line: record.line,
              verdict: "malformed",
              subject: record.id,
              detail: `"${field}" is present but blank — say what it was, or omit the field`,
            });
            break;
          }
        }
        break;
      }

      case "prompt": {
        // v0.6. The operator's turn, in one of two shapes: the text itself, or
        // — under NULLIUS_WITNESS_PROMPTS=0 — a length and a hash, which prove
        // a prompt happened and say nothing about what it asked. One of the
        // two is required. Neither is a prompt record at all: it would assert
        // that the human spoke while recording nothing they said, which reads
        // in a report as an exchange that occurred and cannot be inspected.
        //
        // `truncated`, `at` and `session` are metadata no verdict reads.
        if (record.raw.chars !== undefined && !isNonNegativeInteger(record.raw.chars)) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail: `"chars" is ${JSON.stringify(record.raw.chars)} — a prompt's length must be a non-negative integer when present`,
          });
          break;
        }
        if (nonEmptyString(record.raw.text)) break;
        if (record.raw.chars === undefined || !nonEmptyString(record.raw.hash)) {
          findings.push({
            line: record.line,
            verdict: "malformed",
            subject: record.id,
            detail:
              'a prompt needs non-empty "text", or both "chars" and a non-empty "hash" — the hashed mode is how a run records that the operator spoke without recording what they said, and half of it records neither',
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

  // --- The ledger verdicts. Gated on the journal declaring 0.3 **or later**:
  // without the gate every v0.2 journal in existence would acquire
  // SILENT-REVIEWER on its next validation, since none of them can carry a
  // finding to discharge it.
  //
  // A floor, never an equality. This was `=== "0.3"`, and the 0.4 bump would
  // have left every 0.4 journal ungated for both verdicts below with nothing
  // failing: CI green, every fixture exiting as its table says, and a family
  // of verdicts gone quiet for the newest schema only. A later version
  // inherits every verdict its predecessor earned.
  if (versionAtLeast(scan.version, "0.3")) {
    // Dissent conservation. Gated to blockers on purpose — measured on the
    // corpus this was derived from, 60.8% of identified findings are never
    // mentioned again, and a verdict that fires on three findings in five is
    // one people learn to scroll past. Blocker is where demanding a close-out
    // is defensible.
    for (const [id, entry] of ledger) {
      if (entry.severity !== "blocker") continue;

      // Follow the merge chain. A merge moves the obligation to the surviving
      // finding rather than discharging it, so a blocker is only answered when
      // the chain ends at something a non-merge resolution actually answered.
      // Without this, folding a blocker into an unpoliced `concern` closes it
      // while answering nothing — and a cycle would close two at once.
      let current = id;
      const seen = new Set<string>([id]);
      let discharged = false;
      let trail = "";
      for (;;) {
        if (answered.has(current)) {
          discharged = true;
          break;
        }
        const next = merged.get(current);
        if (next === undefined) break;
        if (seen.has(next)) {
          trail = ` — the merge chain ${[...seen, next].join(" → ")} closes on itself, so nothing in it is ever answered`;
          break;
        }
        seen.add(next);
        current = next;
      }
      if (discharged) continue;

      if (trail === "" && current !== id) {
        trail = ` — merged into '${current}', which nothing answers`;
      }
      findings.push({
        line: entry.record.line,
        verdict: "suppressed-finding",
        subject: id,
        detail:
          "a blocker no resolution answers — the synthesis that would have dropped it is written by the same agent, so an unanswered blocker is the one thing the account cannot be trusted on" +
          trail,
      });
    }

    // A reviewer the harness saw return, which filed nothing. `found` already
    // means "I have something to say"; a `found` with no finding is content
    // that went nowhere. `empty` and `no-report` are invariant 1's business.
    for (const record of records) {
      if (record.kind !== "dispatch") continue;
      // v0.6 scopes the verdict to dispatches that declared a review contract.
      // The verdict's own rationale presumes the dispatch WAS a reviewer — "an
      // explicit nothing-found is how a reviewer proves it was not silent" —
      // and under a producer that records every dispatch, an Explore agent
      // returning prose with no tags would earn it too. A verdict that fires
      // on three dispatches in five is one people learn to scroll past.
      //
      // Below 0.6 the loop is unchanged: those journals have no `expects` to
      // read, and scoping them would retire the verdict for every journal
      // already written.
      // Read the vocabulary rather than a second copy of its one member: a
      // member added to EXPECTATIONS would otherwise validate at the MALFORMED
      // check and still be silently excluded here, which is the drift the
      // barrel's own comment argues against.
      if (
        versionAtLeast(scan.version, "0.6") &&
        !EXPECTATIONS.some((expectation) => expectation === record.raw.expects)
      ) {
        continue;
      }
      if (spokenFor.has(record.id)) continue;
      if (collapsed.has(record.id)) continue; // already COLLAPSED-STATE, whose remedy contradicts this one
      const terminal = terminals.get(record.id);
      if (terminal === undefined) continue; // already NO-TERMINAL
      if (asOutcome(terminal.raw.outcome) !== "found") continue;
      findings.push({
        line: record.line,
        verdict: "silent-reviewer",
        subject: record.id,
        detail:
          'reported "found" on line ' +
          String(terminal.line) +
          " and filed no finding — file one, or a looks-good finding if there was nothing to raise",
      });
    }
  }

  findings.sort((left, right) => left.line - right.line);

  // --- v0.6 counters. Both blocks are null below the floor and populated at
  // or above it, decided here by the same private predicate every other gate
  // in this file uses. `cli.ts` renders each block on presence and compares no
  // versions, so there is exactly one copy of the floor.
  const atLedgerFloor = versionAtLeast(scan.version, "0.6");
  const counted = (kind: Kind): number => records.filter((record) => record.kind === kind).length;
  const ledgerCounts: LedgerCounts | null = atLedgerFloor
    ? {
        stages: counted("stage"),
        findings: counted("finding"),
        resolutions: counted("resolution"),
        checks: counted("check"),
        decisions: counted("decision"),
        prompts: counted("prompt"),
      }
    : null;

  let hookTier = 0;
  let selfReportedTier = 0;
  let unattributedTier = 0;
  if (atLedgerFloor) {
    // A partition over the records the validator could read. The header is not
    // among them: it is the thing doing the attributing, not a record with a
    // tier of its own.
    for (const record of records) {
      const own = record.raw.origin;
      if (own === RECORD_ORIGIN) selfReportedTier += 1;
      // An own origin this schema cannot read attributes the record to nobody.
      // It is already MALFORMED on the four kinds that may carry one; counting
      // it as hook-tier would let the unreadable value buy the better tier.
      else if (own !== undefined) unattributedTier += 1;
      // And so does an ABSENT one on a kind that is required to carry it. That
      // record is MALFORMED for exactly the same reason as the unreadable case,
      // so it must not fall through to the header's tier and buy `hooks` — the
      // asymmetry would be invisible in `validate`, where the journal fails
      // anyway, and visible in `survey`, which aggregates failing journals.
      else if (SELF_REPORTED_KINDS.has(record.kind)) unattributedTier += 1;
      else if (scan.header?.origin === "hooks") hookTier += 1;
      else if (scan.header?.origin === RECORD_ORIGIN) selfReportedTier += 1;
      else unattributedTier += 1;
    }
  }
  const provenanceCounts: ProvenanceCounts | null = atLedgerFloor
    ? { hooks: hookTier, selfReported: selfReportedTier, unattributed: unattributedTier }
    : null;

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
    ledger: ledgerCounts,
    provenance: provenanceCounts,
  };
}

function short(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 12)}…` : hash;
}

/**
 * One journal's place in a survey: its own report, plus the two facts the
 * roll-up needs that a `JournalReport` does not state directly — did it fail,
 * and did it reach a terminal record at all.
 */
export interface SurveyedJournal {
  /** The path the caller read this journal from. `surveyJournals` never opens it. */
  path: string;
  report: JournalReport;
  /**
   * Findings this journal earned that fail, counted by `isJournalFailure` —
   * the same rule one journal is judged by, applied per journal rather than
   * re-derived. A survey has no verdict of its own.
   */
  failures: number;
  /** The distinct failing verdicts, in the order they first appeared. */
  verdicts: JournalVerdict[];
  /** Terminal records read: `found` + `empty` + `no-report`. */
  terminals: number;
  /**
   * True when the journal declares a schema this build cannot read. Its counts
   * are all zero because nothing below its header was looked at, so it is held
   * apart from the journals that were read and genuinely reached no terminal.
   */
  unreadable: boolean;
}

/** The roll-up `witness survey` prints. */
export interface JournalSurvey {
  journals: SurveyedJournal[];
  /**
   * Journals aggregated. Printed beside the totals, always: a summed outcome
   * count with no denominator reads as one validated run.
   */
  count: number;
  /** Journals carrying at least one failing finding. */
  failed: number;
  records: number;
  dispatches: number;
  /** Three numbers, summed three times — never added together. See invariant 1. */
  outcomes: { found: number; empty: number; noReport: number };
  verifications: number;
  mutations: number;
  /**
   * v0.6 ledger counts summed over the surveyed journals that reached the
   * floor, and **null when none did**. A sum is not an absence: summing over
   * zero qualifying journals yields zeros, and an all-0.5 survey printing
   * "0 stages, 0 findings…" is precisely the summary change the floor exists
   * to prevent — it would report a claim about journals nobody counted.
   */
  ledger: LedgerCounts | null;
  /** v0.6 provenance counts, on the same rule. */
  provenance: ProvenanceCounts | null;
  /** Paths of journals that were read and reached no terminal record at all. */
  silent: string[];
  /** Paths of journals whose schema this build cannot read. Nothing of theirs is in the totals. */
  unreadable: string[];
}

/**
 * Validate each journal on its own and add up the *reports*.
 *
 * The records are never combined into one timeline, and that is the whole
 * reason this function exists rather than a caller concatenating the files and
 * calling `validateJournal` once. A `verification` and a `mutation` are
 * correlated by `target.path`; four worktrees each hold a different file under
 * `src/parser.rs`. Merge those timelines and one worktree's mutation invalidates
 * another's verification — a STALE-VERIFICATION for an event that never
 * happened. A validator that invents failures is worse than one that misses
 * them, because the invented ones teach people to pass `continue-on-error`.
 *
 * The same argument settles ids: where the harness omits `tool_use_id` the
 * recorder falls back to a content hash of the dispatch input, and across
 * sixty-four concurrent journals one repeated task string collides far more
 * often than it does inside one session. Merged, that is a DUPLICATE-ID
 * between two runs that never met.
 *
 * And there is a property worth keeping for its own sake: `validate` returns
 * the same verdict for a journal no matter what else was validated in the same
 * run. Aggregating reports preserves it; merging records destroys it.
 *
 * Pure by construction: it takes content already read by the caller. This
 * module has no `node:fs`, so globbing and reading stay in the CLI where
 * `validate`'s already are.
 */
export function surveyJournals(
  inputs: readonly { path: string; content: string }[],
): JournalSurvey {
  const journals: SurveyedJournal[] = [];
  const outcomes = { found: 0, empty: 0, noReport: 0 };
  let records = 0;
  let dispatches = 0;
  let verifications = 0;
  let mutations = 0;
  let failed = 0;
  const silent: string[] = [];
  const unreadable: string[] = [];
  // Accumulated only for the journals whose own block is non-null, and left
  // null when no journal contributed. `null` and a zeroed block are different
  // claims: the first says nothing reached the floor, the second says
  // everything did and had nothing.
  let ledger: LedgerCounts | null = null;
  let provenance: ProvenanceCounts | null = null;

  for (const input of inputs) {
    // One journal, one validation, one report. Nothing from a previous
    // iteration is in scope here, which is the invariant this loop exists to
    // make structural rather than remembered.
    const report = validateJournal(input.content);

    let failures = 0;
    const verdicts: JournalVerdict[] = [];
    let unsupported = false;
    for (const finding of report.findings) {
      if (finding.verdict === "unsupported-version") unsupported = true;
      if (!isJournalFailure(finding.verdict)) continue;
      failures += 1;
      if (!verdicts.includes(finding.verdict)) verdicts.push(finding.verdict);
    }

    const terminals = report.outcomes.found + report.outcomes.empty + report.outcomes.noReport;
    journals.push({
      path: input.path,
      report,
      failures,
      verdicts,
      terminals,
      unreadable: unsupported,
    });

    if (failures > 0) failed += 1;
    if (unsupported) {
      // Its counts are zero because nothing was read, not because nothing
      // happened. Summing them is honest; calling it "no terminal records"
      // would not be, so it is named on its own line instead.
      unreadable.push(input.path);
    } else if (terminals === 0) {
      silent.push(input.path);
    }

    records += report.records;
    dispatches += report.dispatches;
    verifications += report.verifications;
    mutations += report.mutations;
    outcomes.found += report.outcomes.found;
    outcomes.empty += report.outcomes.empty;
    outcomes.noReport += report.outcomes.noReport;

    if (report.ledger !== null) {
      const into: LedgerCounts = ledger ?? {
        stages: 0,
        findings: 0,
        resolutions: 0,
        checks: 0,
        decisions: 0,
        prompts: 0,
      };
      into.stages += report.ledger.stages;
      into.findings += report.ledger.findings;
      into.resolutions += report.ledger.resolutions;
      into.checks += report.ledger.checks;
      into.decisions += report.ledger.decisions;
      into.prompts += report.ledger.prompts;
      ledger = into;
    }
    if (report.provenance !== null) {
      const into: ProvenanceCounts = provenance ?? { hooks: 0, selfReported: 0, unattributed: 0 };
      into.hooks += report.provenance.hooks;
      into.selfReported += report.provenance.selfReported;
      into.unattributed += report.provenance.unattributed;
      provenance = into;
    }
  }

  return {
    journals,
    count: journals.length,
    failed,
    records,
    dispatches,
    outcomes,
    verifications,
    mutations,
    ledger,
    provenance,
    silent,
    unreadable,
  };
}
