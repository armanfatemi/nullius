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
  scalars: Map<string, Located>;
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

export function parseFrontmatter(content: string): Frontmatter | null {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== FENCE) return null;

  const close = lines.findIndex((line, index) => index > 0 && line.trim() === FENCE);
  if (close === -1) return null;

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
