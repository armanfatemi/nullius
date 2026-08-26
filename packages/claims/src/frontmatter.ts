/**
 * A deliberately small frontmatter reader: scalars, inline flow lists, and
 * block lists. No nesting, no anchors, no multi-line scalars.
 *
 * Hand-rolled rather than pulling in a YAML parser, for the same reason the
 * CLI parser is: a dependency here is supply-chain surface on a tool whose
 * whole claim is that its verification path is small enough to read. The
 * subset covers what harness artifacts actually declare, and anything richer
 * is simply not read — which is visible, rather than silently half-parsed.
 */

export interface Located {
  value: string;
  /** 1-based line in the source file. */
  line: number;
}

export interface Frontmatter {
  /**
   * Fields declared as scalar values. These maps reflect the syntax layer: a
   * field which may legitimately be written either as a scalar or a list should
   * be read through `declaredList`, which unifies the two representations into
   * a schema-layer answer.
   */
  scalars: Map<string, Located>;
  /**
   * Fields declared as lists. These maps reflect the syntax layer: a field which
   * may legitimately be written either as a scalar or a list should be read
   * through `declaredList`, which unifies the two representations into a
   * schema-layer answer.
   */
  lists: Map<string, Located[]>;
  /** 1-based line where the body begins, after the closing fence. */
  bodyLine: number;
}

const FENCE = "---";

/** Strip one matching pair of surrounding quotes, and nothing else. */
function unquote(raw: string): string {
  const value = raw.trim();
  const first = value.at(0);
  const last = value.at(-1);
  if (value.length >= 2 && (first === '"' || first === "'") && first === last) {
    return value.slice(1, -1);
  }
  return value;
}

function flowItems(raw: string, line: number): Located[] {
  const inner = raw.trim().slice(1, -1);
  if (inner.trim().length === 0) return [];
  return inner
    .split(",")
    .map((item) => unquote(item))
    .filter((value) => value.length > 0)
    .map((value) => ({ value, line }));
}

/**
 * Where a frontmatter fence opens and closes, or doesn't. Shared by
 * `parseFrontmatter` and `hasUnclosedFrontmatter` so the two questions —
 * "what's in the block" and "did the block ever close" — read the same
 * fence once, the same way.
 */
interface FenceSpan {
  /** Index into `lines` of the closing `---`, or -1 if it never appears. */
  close: number;
}

/** Does `lines` open a frontmatter fence on line 1? Returns where it closes, if it does. */
function matchFence(lines: string[]): FenceSpan | null {
  if (lines[0]?.trim() !== FENCE) return null;
  const close = lines.findIndex((line, index) => index > 0 && line.trim() === FENCE);
  return { close };
}

export function parseFrontmatter(content: string): Frontmatter | null {
  const lines = content.split("\n");
  const fence = matchFence(lines);
  if (fence === null || fence.close === -1) return null;
  const close = fence.close;

  const scalars = new Map<string, Located>();
  const lists = new Map<string, Located[]>();
  let currentKey: string | null = null;

  for (let index = 1; index < close; index += 1) {
    const raw = lines[index] ?? "";
    const line = index + 1;
    const trimmed = raw.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;

    // A block-list item belongs to the key that opened above it.
    if (trimmed.startsWith("- ") || trimmed === "-") {
      if (currentKey === null) continue;
      const value = unquote(trimmed.slice(1));
      if (value.length === 0) continue;
      lists.get(currentKey)?.push({ value, line });
      continue;
    }

    const colon = trimmed.indexOf(":");
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    const rest = trimmed.slice(colon + 1).trim();
    if (key.length === 0) continue;

    if (rest.length === 0) {
      // A bare `key:` opens a block list. An empty list is a real answer.
      currentKey = key;
      lists.set(key, []);
      continue;
    }

    currentKey = null;
    if (rest.startsWith("[") && rest.endsWith("]")) {
      lists.set(key, flowItems(rest, line));
      continue;
    }
    scalars.set(key, { value: unquote(rest), line });
  }

  return { scalars, lists, bodyLine: close + 2 };
}

/**
 * Did `content` open a frontmatter fence that never closed?
 *
 * `parseFrontmatter` returns `null` for this case and for "no fence at all"
 * alike — every existing caller treats a `null` as one meaning, "proceed as
 * if there is no frontmatter," and that contract does not change here. This
 * is an additive answer to the one narrower question `nullius wiring` needs
 * — a document that opened a declaration block and left it unreadable is not
 * the same fact as a document that never declared one — without asking every
 * other caller to handle a second outcome it has no use for.
 */
export function hasUnclosedFrontmatter(content: string): boolean {
  const fence = matchFence(content.split("\n"));
  return fence !== null && fence.close === -1;
}

/**
 * A declared field read as a list, whichever way the author wrote it.
 *
 * `dispatches: rule-auditor` and `dispatches:\n  - rule-auditor` mean the same
 * thing to whoever typed them, but the parser files the first under `scalars`
 * and the second under `lists` — correctly, because that is what the syntax
 * says. Choosing which of the two maps to consult is a schema question, not a
 * parsing one, and a consumer that reaches for `lists` alone silently reads a
 * declared field as absent. That is the failure this package exists to catch,
 * so the answer lives here once rather than in each caller.
 */
export function declaredList(front: Frontmatter | null, key: string): Located[] {
  if (front === null) return [];
  const list = front.lists.get(key);
  if (list !== undefined) return list;
  const scalar = front.scalars.get(key);
  return scalar === undefined ? [] : [scalar];
}
