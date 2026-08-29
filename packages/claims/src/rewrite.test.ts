import { describe, expect, it, vi } from "vitest";

import type { ClaimResult, Verdict } from "./checkClaims";
import { parseClaims, type PresenceClaim } from "./parseClaims";
import { planRewrites, type RewriteIntent } from "./rewrite";

function presence(
  overrides: Partial<PresenceClaim> & { line: number; source: { doc: string; line: number } },
): PresenceClaim {
  return { kind: "presence", path: "src/app.ts", text: "const x = 1;", ...overrides };
}

function result(
  claim: PresenceClaim,
  verdict: Verdict,
  foundLine?: number,
): ClaimResult {
  return foundLine === undefined
    ? { claim, verdict, detail: "" }
    : { claim, verdict, detail: "", foundLine };
}

const FIX_ONLY: RewriteIntent = { fix: true, stamp: null };
const NO_INTENT: RewriteIntent = { fix: false, stamp: null };

describe("planRewrites", () => {
  describe("fix", () => {
    it("repoints a drift and a wrong-line to their found lines", () => {
      const content = [
        "Some prose.",
        "**Evidence:** `src/app.ts:12` — `const x = 1;`",
        "",
        "- **Evidence:** `src/b.ts:3` — `let y;`",
      ].join("\n");
      const drift = presence({ line: 12, source: { doc: "d.md", line: 2 } });
      const wrong = presence({
        path: "src/b.ts",
        line: 3,
        text: "let y;",
        source: { doc: "d.md", line: 4 },
      });

      const plan = planRewrites(
        content,
        [result(drift, "drift", 14), result(wrong, "wrong-line", 300)],
        FIX_ONLY,
      );

      expect(plan.content).toBe(
        [
          "Some prose.",
          "**Evidence:** `src/app.ts:14` — `const x = 1;`",
          "",
          "- **Evidence:** `src/b.ts:300` — `let y;`",
        ].join("\n"),
      );
      expect(plan.skipped).toEqual([]);
      expect(plan.applied).toEqual([
        {
          source: { doc: "d.md", line: 2 },
          kind: "fix",
          before: "**Evidence:** `src/app.ts:12` — `const x = 1;`",
          after: "**Evidence:** `src/app.ts:14` — `const x = 1;`",
          claim: { ...drift, line: 14 },
        },
        {
          source: { doc: "d.md", line: 4 },
          kind: "fix",
          before: "- **Evidence:** `src/b.ts:3` — `let y;`",
          after: "- **Evidence:** `src/b.ts:300` — `let y;`",
          claim: { ...wrong, line: 300 },
        },
      ]);
    });

    it("leaves a stamped drift (the fail-open case) byte-identical", () => {
      const content = "**Evidence:** `src/app.ts:12@a1b2c3d` — `const x = 1;`";
      const claim = presence({ line: 12, rev: "a1b2c3d", source: { doc: "d.md", line: 1 } });

      const plan = planRewrites(content, [result(claim, "drift", 14)], FIX_ONLY);

      expect(plan.content).toBe(content);
      expect(plan.applied).toEqual([]);
      expect(plan.skipped).toEqual([]);
    });

    it.each<Verdict>(["fabricated", "unpinned", "ok", "weak-anchor", "stale", "unverifiable-rev"])(
      "never touches a %s result",
      (verdict) => {
        const content = "**Evidence:** `src/app.ts:12` — `const x = 1;`";
        const claim = presence({ line: 12, source: { doc: "d.md", line: 1 } });

        const plan = planRewrites(content, [result(claim, verdict, 14)], FIX_ONLY);

        expect(plan.content).toBe(content);
        expect(plan.applied).toEqual([]);
        expect(plan.skipped).toEqual([]);
      },
    );

    it("does nothing without a fix intent", () => {
      const content = "**Evidence:** `src/app.ts:12` — `const x = 1;`";
      const claim = presence({ line: 12, source: { doc: "d.md", line: 1 } });

      const plan = planRewrites(content, [result(claim, "drift", 14)], NO_INTENT);

      expect(plan).toEqual({ content, applied: [], skipped: [] });
    });

    it("skips a drift with no foundLine", () => {
      const content = "**Evidence:** `src/app.ts:12` — `const x = 1;`";
      const claim = presence({ line: 12, source: { doc: "d.md", line: 1 } });

      const plan = planRewrites(content, [result(claim, "drift")], FIX_ONLY);

      expect(plan.content).toBe(content);
      expect(plan.applied).toEqual([]);
    });

    it("reports marker-changed when the source line no longer carries the citation", () => {
      // The document was edited after the check: a line was inserted above
      // the marker, so `source.line` now points at prose.
      const content = [
        "Inserted afterwards.",
        "**Evidence:** `src/app.ts:12` — `const x = 1;`",
      ].join("\n");
      const claim = presence({ line: 12, source: { doc: "d.md", line: 1 } });

      const plan = planRewrites(content, [result(claim, "drift", 14)], FIX_ONLY);

      expect(plan.content).toBe(content);
      expect(plan.applied).toEqual([]);
      expect(plan.skipped).toEqual([
        { source: { doc: "d.md", line: 1 }, kind: "fix", reason: "marker-changed" },
      ]);
    });

    it("reports marker-changed when the line is a marker for a different citation", () => {
      const content = "**Evidence:** `src/other.ts:12` — `const x = 1;`";
      const claim = presence({ line: 12, source: { doc: "d.md", line: 1 } });

      const plan = planRewrites(content, [result(claim, "wrong-line", 14)], FIX_ONLY);

      expect(plan.content).toBe(content);
      expect(plan.skipped).toEqual([
        { source: { doc: "d.md", line: 1 }, kind: "fix", reason: "marker-changed" },
      ]);
    });

    it("reports marker-changed when source.line is past the end of the document", () => {
      const content = "just one line";
      const claim = presence({ line: 12, source: { doc: "d.md", line: 5 } });

      const plan = planRewrites(content, [result(claim, "drift", 14)], FIX_ONLY);

      expect(plan.content).toBe(content);
      expect(plan.skipped).toEqual([
        { source: { doc: "d.md", line: 5 }, kind: "fix", reason: "marker-changed" },
      ]);
    });

    it("keeps an em-dash separator through a rewrite", () => {
      const content = "**Evidence:** `src/app.ts:12` — `const x = 1;`";
      const claim = presence({ line: 12, source: { doc: "d.md", line: 1 } });

      const plan = planRewrites(content, [result(claim, "drift", 13)], FIX_ONLY);

      expect(plan.content).toBe("**Evidence:** `src/app.ts:13` — `const x = 1;`");
      expect(plan.content).toContain(" — ");
    });

    it("repoints a block-form marker without touching its fence", () => {
      const content = [
        "**Evidence:** `src/app.ts:12`",
        "```ts",
        "const x = 1;",
        "const y = 2;",
        "```",
      ].join("\n");
      const claim = presence({
        line: 12,
        extraLines: ["const y = 2;"],
        source: { doc: "d.md", line: 1 },
      });

      const plan = planRewrites(content, [result(claim, "drift", 15)], FIX_ONLY);

      expect(plan.content).toBe(content.replace(":12`", ":15`"));
    });
  });

  describe("stamp", () => {
    it("stamps an ok anchor when verification at the rev passes", () => {
      const content = "**Evidence:** `src/app.ts:12` — `const x = 1;`";
      const claim = presence({ line: 12, source: { doc: "d.md", line: 1 } });
      const verify = vi.fn(() => "ok");

      const plan = planRewrites(content, [result(claim, "ok")], {
        fix: false,
        stamp: { rev: "abc1234", verify },
      });

      expect(verify).toHaveBeenCalledWith(claim);
      expect(plan.content).toBe("**Evidence:** `src/app.ts:12@abc1234` — `const x = 1;`");
      expect(plan.applied).toEqual([
        {
          source: { doc: "d.md", line: 1 },
          kind: "stamp",
          before: content,
          after: plan.content,
          claim: { ...claim, rev: "abc1234" },
        },
      ]);
      expect(plan.skipped).toEqual([]);
    });

    it("stamps a weak-anchor too", () => {
      const content = "**Evidence:** `src/app.ts:12` — `x`";
      const claim = presence({ line: 12, text: "x", source: { doc: "d.md", line: 1 } });

      const plan = planRewrites(content, [result(claim, "weak-anchor")], {
        fix: false,
        stamp: { rev: "abc1234", verify: () => "weak-anchor" },
      });

      expect(plan.content).toBe("**Evidence:** `src/app.ts:12@abc1234` — `x`");
    });

    it("skips with the verifier's reason when the anchor is not at the rev", () => {
      const content = "**Evidence:** `src/app.ts:12` — `const x = 1;`";
      const claim = presence({ line: 12, source: { doc: "d.md", line: 1 } });

      const plan = planRewrites(content, [result(claim, "ok")], {
        fix: false,
        stamp: { rev: "abc1234", verify: () => "not-at-rev" },
      });

      expect(plan.content).toBe(content);
      expect(plan.applied).toEqual([]);
      expect(plan.skipped).toEqual([
        { source: { doc: "d.md", line: 1 }, kind: "stamp", reason: "not-at-rev" },
      ]);
    });

    it("skips rev-unreadable the same way", () => {
      const content = "**Evidence:** `src/app.ts:12` — `const x = 1;`";
      const claim = presence({ line: 12, source: { doc: "d.md", line: 1 } });

      const plan = planRewrites(content, [result(claim, "ok")], {
        fix: false,
        stamp: { rev: "abc1234", verify: () => "rev-unreadable" },
      });

      expect(plan.content).toBe(content);
      expect(plan.skipped[0]?.reason).toBe("rev-unreadable");
    });

    it.each<Verdict>(["drift", "wrong-line", "fabricated", "unpinned", "stale"])(
      "does not stamp a %s result",
      (verdict) => {
        const content = "**Evidence:** `src/app.ts:12` — `const x = 1;`";
        const claim = presence({ line: 12, source: { doc: "d.md", line: 1 } });
        const verify = vi.fn(() => "ok");

        const plan = planRewrites(content, [result(claim, verdict, 14)], {
          fix: false,
          stamp: { rev: "abc1234", verify },
        });

        expect(verify).not.toHaveBeenCalled();
        expect(plan.content).toBe(content);
        expect(plan.applied).toEqual([]);
      },
    );

    it("never re-stamps an anchor that already carries a rev", () => {
      const content = "**Evidence:** `src/app.ts:12@a1b2c3d` — `const x = 1;`";
      const claim = presence({ line: 12, rev: "a1b2c3d", source: { doc: "d.md", line: 1 } });
      const verify = vi.fn(() => "ok");

      const plan = planRewrites(content, [result(claim, "ok")], {
        fix: false,
        stamp: { rev: "abc1234", verify },
      });

      expect(verify).not.toHaveBeenCalled();
      expect(plan.content).toBe(content);
    });

    it("reports marker-changed instead of stamping a line that moved", () => {
      const content = [
        "**Evidence:** `src/app.ts:12` — `const x = 1;`",
        "prose",
      ].join("\n");
      const claim = presence({ line: 12, source: { doc: "d.md", line: 2 } });
      const verify = vi.fn(() => "ok");

      const plan = planRewrites(content, [result(claim, "ok")], {
        fix: false,
        stamp: { rev: "abc1234", verify },
      });

      expect(verify).not.toHaveBeenCalled();
      expect(plan.content).toBe(content);
      expect(plan.skipped).toEqual([
        { source: { doc: "d.md", line: 2 }, kind: "stamp", reason: "marker-changed" },
      ]);
    });
  });

  describe("fix and stamp together", () => {
    it("repoints, then verifies and stamps the repointed claim", () => {
      const content = "**Evidence:** `src/app.ts:12` — `const x = 1;`";
      const claim = presence({ line: 12, source: { doc: "d.md", line: 1 } });
      const verify = vi.fn(() => "ok");

      const plan = planRewrites(content, [result(claim, "drift", 14)], {
        fix: true,
        stamp: { rev: "abc1234", verify },
      });

      expect(verify).toHaveBeenCalledTimes(1);
      expect(verify).toHaveBeenCalledWith({ ...claim, line: 14 });
      expect(plan.content).toBe("**Evidence:** `src/app.ts:14@abc1234` — `const x = 1;`");
      expect(plan.applied.map((entry) => entry.kind)).toEqual(["fix", "stamp"]);
      expect(plan.applied[1]).toMatchObject({
        before: "**Evidence:** `src/app.ts:14` — `const x = 1;`",
        after: "**Evidence:** `src/app.ts:14@abc1234` — `const x = 1;`",
        claim: { ...claim, line: 14, rev: "abc1234" },
      });
    });

    it("keeps the repoint when the stamp verification fails", () => {
      const content = "**Evidence:** `src/app.ts:12` — `const x = 1;`";
      const claim = presence({ line: 12, source: { doc: "d.md", line: 1 } });

      const plan = planRewrites(content, [result(claim, "wrong-line", 40)], {
        fix: true,
        stamp: { rev: "abc1234", verify: () => "not-at-rev" },
      });

      expect(plan.content).toBe("**Evidence:** `src/app.ts:40` — `const x = 1;`");
      expect(plan.skipped).toEqual([
        { source: { doc: "d.md", line: 1 }, kind: "stamp", reason: "not-at-rev" },
      ]);
    });
  });

  describe("document shape", () => {
    it("preserves a trailing newline", () => {
      const content = "**Evidence:** `src/app.ts:12` — `const x = 1;`\n";
      const claim = presence({ line: 12, source: { doc: "d.md", line: 1 } });

      const plan = planRewrites(content, [result(claim, "drift", 13)], FIX_ONLY);

      expect(plan.content).toBe("**Evidence:** `src/app.ts:13` — `const x = 1;`\n");
    });

    it("does not add a trailing newline that was not there", () => {
      const content = "**Evidence:** `src/app.ts:12` — `const x = 1;`";
      const claim = presence({ line: 12, source: { doc: "d.md", line: 1 } });

      const plan = planRewrites(content, [result(claim, "drift", 13)], FIX_ONLY);

      expect(plan.content.endsWith("\n")).toBe(false);
    });

    it("keeps CRLF line endings on the rewritten line", () => {
      const content = "**Evidence:** `src/app.ts:12` — `const x = 1;`\r\nnext\r\n";
      const claim = presence({ line: 12, source: { doc: "d.md", line: 1 } });

      const plan = planRewrites(content, [result(claim, "drift", 13)], FIX_ONLY);

      expect(plan.content).toBe("**Evidence:** `src/app.ts:13` — `const x = 1;`\r\nnext\r\n");
    });

    it("ignores non-presence results", () => {
      const content = "**Evidence:** `grep -rn 'x' src/` → 0 results";
      const plan = planRewrites(
        content,
        [
          {
            claim: {
              kind: "absence",
              command: "grep -rn 'x' src/",
              expectedCount: 0,
              source: { doc: "d.md", line: 1 },
            },
            verdict: "ok",
            detail: "",
          },
        ],
        { fix: true, stamp: { rev: "abc1234", verify: () => "ok" } },
      );

      expect(plan).toEqual({ content, applied: [], skipped: [] });
    });
  });
});

/* ------------------------------------------------------------------------ *
 * Property test: whatever the planner does, it only ever changes the
 * `:LINE` / `@rev` characters of marker lines it reports under `applied`.
 * ------------------------------------------------------------------------ */

/** mulberry32 — a tiny seeded PRNG; the seed is fixed so the run is deterministic. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Gen {
  int: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
  bool: () => boolean;
  chars: (alphabet: string, min: number, max: number) => string;
}

function makeGen(random: () => number): Gen {
  const int = (min: number, max: number): number => min + Math.floor(random() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => {
    const item = items[int(0, items.length - 1)];
    if (item === undefined) throw new Error("empty pick");
    return item;
  };
  return {
    int,
    pick,
    bool: () => random() < 0.5,
    chars: (alphabet, min, max) => {
      let out = "";
      const length = int(min, max);
      for (let index = 0; index < length; index += 1) out += pick([...alphabet]);
      return out;
    },
  };
}

type Shape = "single" | "double" | "block";

interface Marker {
  /** 0-based index of the marker line in the document. */
  index: number;
  shape: Shape;
  line: string;
  claim: PresenceClaim;
  /** The rev as written in the marker (may be upper-case), or undefined. */
  writtenRev: string | undefined;
}

const PREFIXES = ["", "", "- ", "* ", "+ ", "1. ", "12) ", "  - ", "\t* "] as const;
const SEPARATORS = ["—", "–", "-", "--", "—–"] as const;
const SPACES = ["", " ", "  ", "\t"] as const;
const HEX = "0123456789abcdef";

function genMarker(gen: Gen, doc: string, index: number): { lines: string[]; marker: Marker } {
  const shape = gen.pick<Shape>(["single", "double", "block"]);
  const prefix = gen.pick(PREFIXES);
  const path = gen.chars("abcdefghijklmnopqrstuvwxyz", 1, 3) + "/" + gen.chars("abcdefghijklmnopqrstuvwxyz._-", 1, 8) + ".ts";
  const line = gen.int(1, 9999);
  let writtenRev: string | undefined;
  if (gen.bool()) {
    writtenRev = gen.chars(HEX, 7, 40);
    if (gen.bool()) writtenRev = writtenRev.toUpperCase();
  }
  const token = `${path}:${line}${writtenRev === undefined ? "" : `@${writtenRev}`}`;
  const trailing = gen.pick(SPACES);
  const head = `${prefix}**Evidence:** ${gen.pick(SPACES)}\`${token}\``;

  const claimBase = {
    kind: "presence" as const,
    path,
    line,
    ...(writtenRev === undefined ? {} : { rev: writtenRev.toLowerCase() }),
    source: { doc, line: index + 1 },
  };

  if (shape === "block") {
    const text = gen.chars("abcdefghijklmnopqrstuvwxyz `=;", 1, 20).trim() || "x";
    const extra = gen.bool() ? [gen.chars("abcdefghijklmnopqrstuvwxyz `;", 1, 12).trim() || "y"] : [];
    const markerLine = `${head}${trailing}`;
    const lines = [markerLine, "```", text, ...extra, "```"];
    return {
      lines,
      marker: {
        index,
        shape,
        line: markerLine,
        claim: { ...claimBase, text, ...(extra.length > 0 ? { extraLines: extra } : {}) },
        writtenRev,
      },
    };
  }

  const separator = `${gen.pick(SPACES)}${gen.pick(SEPARATORS)}${gen.pick(SPACES)}`;
  let text: string;
  let quoted: string;
  if (shape === "single") {
    text = gen.chars("abcdefghijklmnopqrstuvwxyz =;(){}", 1, 20).trim() || "x";
    quoted = `\`${text}\``;
  } else {
    // A double-backtick span must contain a backtick, and must not start or
    // end with one (that would merge with the delimiters).
    const left = gen.chars("abcdefghijklmnopqrstuvwxyz =;", 1, 8).trim() || "a";
    const right = gen.chars("abcdefghijklmnopqrstuvwxyz =;", 1, 8).trim() || "b";
    text = `${left}\`${right}`;
    quoted = `\`\`${text}\`\``;
  }
  const markerLine = `${head}${separator}${quoted}${trailing}`;
  return {
    lines: [markerLine],
    marker: { index, shape, line: markerLine, claim: { ...claimBase, text }, writtenRev },
  };
}

function genProse(gen: Gen): string {
  return gen.chars("abcdefghijklmnopqrstuvwxyz ", 0, 30);
}

const PROPERTY_VERDICTS: readonly Verdict[] = [
  "ok",
  "weak-anchor",
  "drift",
  "wrong-line",
  "fabricated",
  "unpinned",
  "stale",
  "unverifiable-rev",
];

/** The three pieces of the first backtick span: `path`, `:LINE`, `@rev`. */
function splitSpan(line: string): { open: number; path: string; rest: string; close: number } {
  const open = line.indexOf("`") + 1;
  const close = line.indexOf("`", open);
  const span = line.slice(open, close);
  const match = /^(.+?):(\d+(?:@[0-9a-fA-F]{7,40})?)$/.exec(span);
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error(`no citation span in ${JSON.stringify(line)}`);
  }
  return { open, path: match[1], rest: match[2], close };
}

describe("planRewrites property", () => {
  it("changes nothing but the :LINE/@rev spans of applied marker lines (200 seeded trials)", () => {
    const gen = makeGen(mulberry32(0x6e756c6c));
    const seen = { fix: 0, stamp: 0 };

    for (let trial = 0; trial < 200; trial += 1) {
      const doc = `doc${trial}.md`;
      const lines: string[] = [];
      const markers: Marker[] = [];
      const markerCount = gen.int(1, 5);
      for (let n = 0; n < markerCount; n += 1) {
        for (let p = gen.int(0, 2); p > 0; p -= 1) lines.push(genProse(gen));
        const generated = genMarker(gen, doc, lines.length);
        lines.push(...generated.lines);
        markers.push(generated.marker);
      }
      for (let p = gen.int(0, 2); p > 0; p -= 1) lines.push(genProse(gen));
      const content = lines.join("\n") + (gen.bool() ? "\n" : "");

      // The generator must produce what the real parser reads, or the
      // property is about a grammar of its own.
      const parsed = parseClaims(doc, content);
      expect(parsed, `trial ${trial}`).toEqual(markers.map((marker) => marker.claim));

      const results: ClaimResult[] = markers.map((marker) => {
        const verdict = gen.pick(PROPERTY_VERDICTS);
        const foundLine =
          (verdict === "drift" || verdict === "wrong-line") && gen.int(0, 3) > 0
            ? gen.int(1, 9999)
            : undefined;
        return result(marker.claim, verdict, foundLine);
      });

      const stampRev = gen.bool() ? gen.chars(HEX, 7, 7) : gen.chars(HEX, 40, 40);
      const verifyOutcomes = ["ok", "weak-anchor", "not-at-rev", "rev-unreadable"] as const;
      const intent: RewriteIntent = {
        fix: gen.bool(),
        stamp: gen.bool() ? { rev: stampRev, verify: () => gen.pick(verifyOutcomes) } : null,
      };

      const plan = planRewrites(content, results, intent);
      const label = `trial ${trial}\n${content}`;

      const outLines = plan.content.split("\n");
      const inLines = content.split("\n");
      expect(outLines.length, label).toBe(inLines.length);

      const touched = new Set(plan.applied.map((entry) => entry.source.line - 1));
      const markerByIndex = new Map(markers.map((marker) => [marker.index, marker]));

      for (let index = 0; index < inLines.length; index += 1) {
        const before = inLines[index] ?? "";
        const after = outLines[index] ?? "";
        if (!touched.has(index)) {
          expect(after, `${label}\nline ${index + 1}`).toBe(before);
          continue;
        }
        const marker = markerByIndex.get(index);
        expect(marker, `${label}\napplied to a non-marker line ${index + 1}`).toBeDefined();
        if (marker === undefined) continue;
        // A stamped marker is never a candidate for either pass.
        expect(marker.writtenRev, label).toBeUndefined();

        const b = splitSpan(before);
        const a = splitSpan(after);
        expect(after.slice(0, b.open), label).toBe(before.slice(0, b.open));
        expect(a.path, label).toBe(b.path);
        expect(after.slice(a.close), label).toBe(before.slice(b.close));
      }

      for (const entry of plan.applied) {
        seen[entry.kind] += 1;
        if (entry.kind === "fix") expect(intent.fix, label).toBe(true);
        if (entry.kind === "stamp") expect(intent.stamp, label).not.toBeNull();
      }
      // The generator never edits the document between check and rewrite, so
      // a marker-changed here would be the planner misreading its own input.
      expect(plan.skipped.map((entry) => entry.reason), label).not.toContain("marker-changed");
    }

    // Guard against a vacuous run: both passes must actually have fired.
    expect(seen.fix).toBeGreaterThan(20);
    expect(seen.stamp).toBeGreaterThan(20);
  });
});
