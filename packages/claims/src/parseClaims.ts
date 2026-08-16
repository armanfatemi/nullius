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
}

export type Claim = PresenceClaim | AbsenceClaim | MomentClaim | MalformedClaim;

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

export function parseClaims(doc: string, content: string): Claim[] {
  const claims: Claim[] = [];
  const lines = content.split("\n");
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (raw === undefined) continue;

    if (FENCE.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const source: SourceLocation = { doc, line: index + 1 };

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

  return claims;
}
