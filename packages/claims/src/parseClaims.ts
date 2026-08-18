/**
 * Parses the structured grounding markers defined by the Evidence Anchors spec
 * (spec/evidence-anchors.md) out of a markdown document.
 *
 * Four marker shapes are recognised:
 *   **Evidence:** `path/to/file.ext:12` — `text on that line`     (presence)
 *   **Evidence:** `path/to/file.ext:12`                           (presence,
 *   ```                                                            block form)
 *   text on that line
 *   ```
 *   **Evidence:** `grep -rn 'x' services/` → 0 results            (absence)
 *   **Binds at:** `rollout-window`                                (mechanism)
 *
 * The block form exists because the inline form breaks down exactly where
 * citations matter most: a long line, or one containing backticks, cannot be
 * quoted in a code span. Rejecting that as `malformed` trains authors away from
 * the marker, which costs more than the stricter shape buys.
 *
 * An `**Evidence:**` line matching none of these shapes is reported as
 * `malformed` rather than silently skipped — a sloppy citation is exactly the
 * thing this tool exists to surface.
 *
 * Lines inside fenced code blocks (``` or ~~~) are ignored: a document that
 * QUOTES a citation as an example — a spec, a review log, a how-to — is not
 * asserting it. The opening fence's delimiter AND length are remembered, per
 * CommonMark, so neither a ``` inside a ~~~ block nor a ``` inside a ````
 * block closes it; getting that wrong silently flips the whole rest of the
 * document into or out of "asserting" mode.
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
  /** The first cited line of source. */
  text: string;
  /**
   * Further cited lines, for the block form. They must appear consecutively
   * after `text`, so a multi-line quote asserts more than a single one.
   * Absent or empty for the inline form.
   */
  extraLines?: string[];
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

// **Evidence:** `path:LINE`   — the quote follows in a fenced block.
const PRESENCE_BLOCK_HEAD = /^\s*\*\*Evidence:\*\*\s*`(.+):(\d+)`\s*$/;

// **Evidence:** `grep ...` → N results
const ABSENCE =
  /^\s*\*\*Evidence:\*\*\s*`(.+)`\s*(?:→|->)\s*(\d+)\s+results?\s*$/;

// **Binds at:** `moment-id`  (backticks optional)
const MOMENT = /^\s*\*\*Binds at:\*\*\s*`?([a-z][a-z-]*)`?\s*$/;

// A fence opener/closer: three or more backticks or tildes at line start.
const FENCE = /^\s*(`{3,}|~{3,})/;

interface Fence {
  delimiter: "`" | "~";
  /** Run length. CommonMark: a closer must be at least as long as its opener. */
  length: number;
}

/** The fence a line opens or closes, or null when it is not a fence line. */
function fenceAt(line: string): Fence | null {
  const match = FENCE.exec(line);
  const run = match?.[1];
  if (run === undefined) return null;
  return { delimiter: run.startsWith("`") ? "`" : "~", length: run.length };
}

/** Whether `line` closes an open fence — same delimiter, and at least as long. */
function closes(open: Fence, line: string): boolean {
  const fence = fenceAt(line);
  return (
    fence !== null &&
    fence.delimiter === open.delimiter &&
    fence.length >= open.length
  );
}

/**
 * Reads the fenced block that supplies a block-form citation's quote, starting
 * the scan at `from`. Blank lines between the marker and the fence are allowed;
 * anything else means there is no block.
 */
function readEvidenceBlock(
  lines: string[],
  from: number,
): { quoted: string[]; nextIndex: number } | null {
  let index = from;
  while (index < lines.length && (lines[index] ?? "").trim() === "") index += 1;

  const opener = lines[index];
  if (opener === undefined) return null;
  const fence = fenceAt(opener);
  if (fence === null) return null;

  const quoted: string[] = [];
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor] ?? "";
    if (closes(fence, line)) {
      // Blank lines are kept INSIDE the quote (a blank line in the middle of a
      // quoted function is part of what is being cited, and dropping it made
      // the remaining lines non-consecutive, which reported FABRICATED against
      // a correctly copied quote). Blank lines at the edges are trimmed —
      // those are block padding, not source.
      while (quoted.length > 0 && (quoted[0] ?? "").trim() === "") quoted.shift();
      while (quoted.length > 0 && (quoted[quoted.length - 1] ?? "").trim() === "") {
        quoted.pop();
      }
      // An empty block cites nothing, so it is not a citation.
      if (quoted.length === 0) return null;
      return { quoted, nextIndex: cursor + 1 };
    }
    quoted.push(line);
  }

  // Unterminated fence — treat as no block rather than swallowing the document.
  return null;
}

export function parseClaims(doc: string, content: string): Claim[] {
  const claims: Claim[] = [];
  const lines = content.split("\n");
  /** The fence we are currently inside, or null. */
  let openFence: Fence | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (raw === undefined) continue;

    if (openFence !== null) {
      // Only a matching, long-enough delimiter closes the fence; a shorter run
      // or the other delimiter is content. Getting this wrong flips the rest of
      // the document into or out of "asserting" mode.
      if (closes(openFence, raw)) openFence = null;
      continue;
    }
    const fence = fenceAt(raw);
    if (fence !== null) {
      openFence = fence;
      continue;
    }

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

    const blockHead = PRESENCE_BLOCK_HEAD.exec(raw);
    if (blockHead?.[1] !== undefined && blockHead[2] !== undefined) {
      const block = readEvidenceBlock(lines, index + 1);
      if (block !== null) {
        const [first, ...rest] = block.quoted;
        if (first !== undefined) {
          claims.push({
            kind: "presence",
            path: blockHead[1],
            line: Number.parseInt(blockHead[2], 10),
            text: first,
            // Present only for the block form, so an inline citation parses to
            // exactly the shape it always did.
            ...(rest.length > 0 ? { extraLines: rest } : {}),
            source,
          });
          // The block belongs to this claim; do not re-scan it as prose.
          index = block.nextIndex - 1;
          continue;
        }
      }
    }

    claims.push({ kind: "malformed", raw: raw.trim(), source });
  }

  return claims;
}
