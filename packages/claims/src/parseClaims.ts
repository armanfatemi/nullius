/**
 * Parses the structured grounding markers defined by the Evidence Anchors spec
 * (spec/evidence-anchors.md) out of a markdown document.
 *
 * Three markers are recognised:
 *   **Evidence:** `path/to/file.ext:12` — `text on that line`     (presence)
 *   **Evidence:** `grep -rn 'x' services/` → 0 results            (absence)
 *   **Binds at:** `rollout-window`                                (mechanism)
 *
 * An `**Evidence:**` line matching neither citation shape is reported as
 * `malformed` rather than silently skipped — a sloppy citation is exactly the
 * thing this tool exists to surface.
 *
 * Lines inside fenced code blocks (``` or ~~~) are ignored: a document that
 * QUOTES a citation as an example — a spec, a review log, a how-to — is not
 * asserting it.
 */

export interface SourceLocation {
  /** Repo-relative path of the document the claim was found in. */
  doc: string;
  /** 1-based line number within that document. */
  line: number;
}

export interface PresenceClaim {
  kind: "presence";
  path: string;
  line: number;
  text: string;
  source: SourceLocation;
}

export interface AbsenceClaim {
  kind: "absence";
  command: string;
  expectedCount: number;
  source: SourceLocation;
}

export interface MomentClaim {
  kind: "moment";
  moment: string;
  source: SourceLocation;
}

export interface MalformedClaim {
  kind: "malformed";
  raw: string;
  source: SourceLocation;
  /** Overrides the generic "not a valid citation" detail (e.g. for ledger lines). */
  expected?: string;
}

export interface LedgerExpected {
  name: string;
  source: SourceLocation;
}

export interface LedgerDelivery {
  name: string;
  /** Trimmed outcome text; the empty string when the entry states none. */
  outcome: string;
  findingsPath?: string;
  source: SourceLocation;
}

/**
 * One activated attestation-ledger block (spec/attestation-ledger.md): every
 * name declared under `**Expected:**` must have a matching entry under
 * `**Delivered:**`. Parsed as a single aggregate claim; `checkClaims` expands
 * it into one result per declared dispatch.
 */
export interface LedgerClaim {
  kind: "ledger";
  cycle: string;
  expected: LedgerExpected[];
  delivered: LedgerDelivery[];
  source: SourceLocation;
}

/**
 * Synthetic per-dispatch claim carried by ledger results — never produced by
 * the parser, only by `checkClaims` expanding a `LedgerClaim`.
 */
export interface DispatchClaim {
  kind: "dispatch";
  name: string;
  source: SourceLocation;
}

/**
 * Synthetic document-level claim carried by the canary merge guard's
 * `canary-present` result — never produced by the parser.
 */
export interface CanaryClaim {
  kind: "canary";
  source: SourceLocation;
}

export type Claim =
  | PresenceClaim
  | AbsenceClaim
  | MomentClaim
  | MalformedClaim
  | LedgerClaim
  | DispatchClaim
  | CanaryClaim;

const EVIDENCE_PREFIX = /^\s*\*\*Evidence:\*\*/;

// **Evidence:** `path:LINE` — `quoted source text`
//
// Two spellings of the text span, because a single-backtick code span cannot
// contain a backtick in Markdown. Cited source that itself contains a backtick
// (a TS template literal, say) must use a double-backtick span, so we try that
// form FIRST — the single-backtick pattern would also match a double-delimited
// line and capture the inner delimiters as part of the text.
const PRESENCE_DOUBLE =
  /^\s*\*\*Evidence:\*\*\s*`(.+):(\d+)`\s*[—–-]+\s*``(.+)``\s*$/;
const PRESENCE_SINGLE =
  /^\s*\*\*Evidence:\*\*\s*`(.+):(\d+)`\s*[—–-]+\s*`(.+)`\s*$/;

// **Evidence:** `grep ...` → N results
const ABSENCE =
  /^\s*\*\*Evidence:\*\*\s*`(.+)`\s*(?:→|->)\s*(\d+)\s+results?\s*$/;

// **Binds at:** `moment-id`  (backticks optional)
const MOMENT = /^\s*\*\*Binds at:\*\*\s*`?([a-z][a-z-]*)`?\s*$/;

// A fence opener/closer: three or more backticks or tildes at line start.
const FENCE = /^\s*(```|~~~)/;

// Attestation-ledger block markers (spec/attestation-ledger.md). Only the
// `**Ledger:**` opener activates ledger parsing — `**Expected:**` and
// `**Delivered:**` outside an activated block are inert prose.
const LEDGER_OPENER = /^\s*\*\*Ledger:\*\*\s*(.*)$/;
const LEDGER_EXPECTED = /^\s*\*\*Expected:\*\*\s*(.*)$/;
const LEDGER_DELIVERED = /^\s*\*\*Delivered:\*\*\s*(.*)$/;
const LEDGER_ENTRY = /^\s*-\s+`([^`]+)`\s*[—–-]+\s*(.*)$/;
const LEDGER_FINDINGS_PATH = /(?:→|->)\s*`([^`]+)`\s*$/;
const LIST_ITEM = /^\s*-\s+/;

const LEDGER_ENTRY_SHAPE =
  "invalid ledger line — expected - `name` — <outcome>, where the outcome is findings (optionally → `path`) or the literal None";

/** Parses `**Expected:**` names: comma-separated inline-code spans, nothing else. */
function parseExpectedNames(rest: string): string[] | null {
  const trimmed = rest.trim();
  if (trimmed.length === 0) return null;
  const names: string[] = [];
  for (const token of trimmed.split(",")) {
    const name = /^\s*`([^`]+)`\s*$/.exec(token);
    if (name?.[1] === undefined) return null;
    names.push(name[1]);
  }
  return names;
}

type LedgerState =
  | { at: "expected"; claim: LedgerClaim }
  | { at: "delivered"; claim: LedgerClaim }
  | { at: "entries"; claim: LedgerClaim };

export function parseClaims(doc: string, content: string): Claim[] {
  const claims: Claim[] = [];
  const lines = content.split("\n");
  let inFence = false;
  let ledger: LedgerState | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (raw === undefined) continue;

    if (FENCE.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const source: SourceLocation = { doc, line: index + 1 };

    if (ledger !== null) {
      if (ledger.at === "entries") {
        const entry = LEDGER_ENTRY.exec(raw);
        if (entry?.[1] !== undefined && entry[2] !== undefined) {
          let outcome = entry[2].trim();
          let findingsPath: string | undefined;
          const findings = LEDGER_FINDINGS_PATH.exec(outcome);
          if (findings?.[1] !== undefined) {
            findingsPath = findings[1];
            outcome = outcome.slice(0, findings.index).trim();
          }
          ledger.claim.delivered.push({
            name: entry[1],
            outcome,
            ...(findingsPath === undefined ? {} : { findingsPath }),
            source,
          });
          continue;
        }
        if (LIST_ITEM.test(raw)) {
          claims.push({
            kind: "malformed",
            raw: raw.trim(),
            source,
            expected: LEDGER_ENTRY_SHAPE,
          });
          continue;
        }
        // First non-item line ends the block; fall through and re-parse it.
        claims.push(ledger.claim);
        ledger = null;
      } else if (raw.trim().length === 0) {
        continue; // Blank lines are allowed between the ledger sections.
      } else if (ledger.at === "expected") {
        const expected = LEDGER_EXPECTED.exec(raw);
        const names =
          expected?.[1] === undefined ? null : parseExpectedNames(expected[1]);
        if (names === null) {
          claims.push({
            kind: "malformed",
            raw: raw.trim(),
            source,
            expected:
              "invalid ledger line — expected **Expected:** `name`, `name`, … (inline-code names, comma-separated)",
          });
          ledger = null;
          continue;
        }
        ledger.claim.expected = names.map((name) => ({ name, source }));
        ledger = { at: "delivered", claim: ledger.claim };
        continue;
      } else {
        const delivered = LEDGER_DELIVERED.exec(raw);
        if (delivered === null || delivered[1]?.trim() !== "") {
          claims.push({
            kind: "malformed",
            raw: raw.trim(),
            source,
            expected:
              "invalid ledger line — expected **Delivered:** followed by - `name` — <outcome> entries",
          });
          ledger = null;
          continue;
        }
        ledger = { at: "entries", claim: ledger.claim };
        continue;
      }
    }

    const opener = LEDGER_OPENER.exec(raw);
    if (opener !== null) {
      const cycle = (opener[1] ?? "").trim();
      if (cycle.length === 0) {
        claims.push({
          kind: "malformed",
          raw: raw.trim(),
          source,
          expected:
            "invalid ledger line — **Ledger:** must name the review cycle",
        });
        continue;
      }
      ledger = {
        at: "expected",
        claim: { kind: "ledger", cycle, expected: [], delivered: [], source },
      };
      continue;
    }

    const moment = MOMENT.exec(raw);
    if (moment?.[1] !== undefined) {
      claims.push({ kind: "moment", moment: moment[1], source });
      continue;
    }

    if (!EVIDENCE_PREFIX.test(raw)) continue;

    // Absence is tried first: a presence citation always has a `:LINE` inside
    // the first backtick pair, so the two shapes cannot both match.
    const absence = ABSENCE.exec(raw);
    if (absence?.[1] !== undefined && absence[2] !== undefined) {
      claims.push({
        kind: "absence",
        command: absence[1],
        expectedCount: Number.parseInt(absence[2], 10),
        source,
      });
      continue;
    }

    const presence = PRESENCE_DOUBLE.exec(raw) ?? PRESENCE_SINGLE.exec(raw);
    if (
      presence?.[1] !== undefined &&
      presence[2] !== undefined &&
      presence[3] !== undefined
    ) {
      claims.push({
        kind: "presence",
        path: presence[1],
        line: Number.parseInt(presence[2], 10),
        text: presence[3],
        source,
      });
      continue;
    }

    claims.push({ kind: "malformed", raw: raw.trim(), source });
  }

  if (ledger !== null) {
    if (ledger.at === "entries") {
      claims.push(ledger.claim);
    } else {
      claims.push({
        kind: "malformed",
        raw: "**Ledger:**",
        source: ledger.claim.source,
        expected:
          "invalid ledger block — opened but missing its **Expected:** and **Delivered:** sections",
      });
    }
  }

  return claims;
}
