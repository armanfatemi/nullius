import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

/*
 * The Action's `NULLIUS_CLAIMS_BIN` override, tested by RUNNING the Action's
 * shell rather than by reading it.
 *
 * A regex over `action.yml` can say the override is mentioned. It cannot say
 * which binary the step executes, and that is the entire claim: this
 * repository's pull-request comments have three times reported what a working
 * tree does while a released checker produced them. So the step's `run:` block
 * is extracted and executed against a recording stub on PATH, and the
 * assertion is over the argv that actually ran.
 *
 * Extraction rather than a copy beside the file, for the reason `.github/
 * workflows/ci.yml` already extracts the annotation escaper: a copy is what
 * goes stale, and `action.yml` is the one real users execute.
 *
 * Read as text — no package.json in this repository carries a YAML parser, and
 * `checkReport.test.ts` asserts against this same file the same way.
 */

const ACTION = readFileSync(
  fileURLToPath(new URL("../../../action/action.yml", import.meta.url)),
  "utf8",
);

/** The pinned fallback, spelled exactly as the Action spells it. */
const FALLBACK = 'npx -y @nullius-inverba/claims@${CLAIMS_VERSION}';

/**
 * Pull one step's `run: |` body out of the composite action, dedented.
 *
 * Steps sit at four spaces, their keys at six, block bodies at eight; the body
 * ends at the first non-blank line indented less than that.
 */
function stepScript(name: string): string {
  const lines = ACTION.split("\n");
  const start = lines.findIndex((l) => l === `    - name: ${name}`);
  expect(start, `no step named ${name}`).toBeGreaterThanOrEqual(0);
  // Bounded by the NEXT step header: a `uses:` step has no run block of its
  // own, and an unbounded search would hand back the following step's.
  const next = lines.findIndex((l, i) => i > start && l.startsWith("    - name: "));
  const end = next === -1 ? lines.length : next;
  const runAt = lines.findIndex((l, i) => i > start && i < end && l === "      run: |");
  expect(runAt, `step ${name} has no run block`).toBeGreaterThan(start);
  const body: string[] = [];
  for (let i = runAt + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      body.push("");
      continue;
    }
    if (!line.startsWith("        ")) break;
    body.push(line.slice(8));
  }
  return body.join("\n");
}

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Run {
  /** One line per invocation: the argv of a stub, space-joined. */
  readonly invocations: string[];
  readonly outputs: string;
  readonly status: number;
  readonly stderr: string;
}

/**
 * Run the `Run checker` step with every checker entry point replaced by a stub
 * that records its argv. `npx` is stubbed too, so "the pinned install did not
 * run" is an observation rather than an inference.
 */
function runCheckerStep(env: Record<string, string>): Run {
  const dir = mkdtempSync(join(tmpdir(), "nullius-action-"));
  temps.push(dir);
  const log = join(dir, "invocations.log");
  const bin = join(dir, "bin");
  execFileSync("mkdir", ["-p", bin]);

  // Records argv and prints something, so the step's `$(...)` capture behaves.
  for (const name of ["npx", "local-checker"]) {
    const path = join(bin, name);
    writeFileSync(
      path,
      `#!/bin/sh\nprintf '%s %s\\n' "${name}" "$*" >> ${JSON.stringify(log)}\necho "stub ${name} output"\nexit 0\n`,
    );
    chmodSync(path, 0o755);
  }
  writeFileSync(log, "");

  const script = join(dir, "step.sh");
  writeFileSync(script, stepScript("Run checker"));
  const outputs = join(dir, "github_output");
  const summary = join(dir, "github_summary");
  writeFileSync(outputs, "");
  writeFileSync(summary, "");

  const result = spawnSync("bash", [script], {
    cwd: dir,
    encoding: "utf8",
    env: {
      PATH: `${bin}:${process.env["PATH"] ?? ""}`,
      HOME: dir,
      GITHUB_OUTPUT: outputs,
      GITHUB_STEP_SUMMARY: summary,
      GITHUB_EVENT_NAME: "push",
      CLAIMS_VERSION: "0.12.0",
      GLOBS: "spec/**/*.md",
      CONFIG: "",
      REQUIRE_MARKERS: "false",
      PR_BODY_MODE: "false",
      ...env,
    },
  });

  return {
    invocations: readFileSync(log, "utf8").split("\n").filter((l) => l.length > 0),
    outputs: readFileSync(outputs, "utf8"),
    status: result.status ?? -1,
    stderr: result.stderr,
  };
}

describe("the Action's local-checker override", () => {
  it("runs the pinned release, unchanged, when the override is unset", () => {
    /*
     * The byte-identity assertion. Before this override existed the step ran
     * `npx -y "@nullius-inverba/claims@${CLAIMS_VERSION}" check $GLOBS`, and
     * the override is worth nothing if it costs every other caller a
     * difference. The argv is compared whole rather than by `toContain`,
     * because a stray extra argument is exactly the regression this guards.
     */
    const run = runCheckerStep({});
    expect(run.status).toBe(0);
    expect(run.invocations).toEqual(["npx -y @nullius-inverba/claims@0.12.0 check spec/**/*.md"]);
  });

  it("runs the named checker and does NOT install the pinned release", () => {
    const run = runCheckerStep({ NULLIUS_CLAIMS_BIN: "local-checker" });
    expect(run.status).toBe(0);
    expect(run.invocations).toEqual(["local-checker check spec/**/*.md"]);
    // Stated separately from the equality above: this is the claim, and a
    // future edit that loosened the equality should still fail here.
    expect(run.invocations.join("\n")).not.toContain("npx");
  });

  it("lets the override carry its own arguments", () => {
    // `node dist/cli.js` and `pnpm exec nullius` are the two shapes a
    // repository developing the checker actually has; both are more than one
    // word, so the override is word-split on use.
    const run = runCheckerStep({ NULLIUS_CLAIMS_BIN: "local-checker --from working-tree" });
    expect(run.invocations).toEqual(["local-checker --from working-tree check spec/**/*.md"]);
  });

  it("labels the comment only when the override is in use", () => {
    const plain = runCheckerStep({});
    expect(plain.outputs).not.toContain("label<<");

    const overridden = runCheckerStep({ NULLIUS_CLAIMS_BIN: "local-checker" });
    expect(overridden.outputs).toContain("label<<");
    // Names the checker that ran, rather than merely admitting one was used —
    // a reviewer has to be able to tell which build produced the numbers.
    expect(overridden.outputs).toContain("Rendered by `local-checker`");
    expect(overridden.outputs).toContain("NULLIUS_CLAIMS_BIN");
    expect(overridden.outputs).toContain("not** the released");
  });

  it("routes every checker invocation through the override, not just the first", () => {
    /*
     * Three steps invoke the checker at six sites, and the failure this
     * catches is partial adoption: the docs check honours the override while
     * the run report — the comment that was wrong all three times — quietly
     * keeps installing the pin.
     *
     * Executing the other two steps would need an event file, `jq`, and a
     * checker that emits a versioned document, so they are asserted
     * structurally: no literal install survives anywhere in the file.
     */
    expect(ACTION).not.toContain('npx -y "@nullius-inverba/claims@');
    // Not anchored to the line start: two of the six are inside a `$(...)`
    // capture.
    const invocations = ACTION.match(/\$runner (check|witness) /g) ?? [];
    expect(invocations.length).toBe(6);

    // Every step that invokes the checker defines the fallback for itself; a
    // step that read `$runner` without defining it would inherit an empty
    // string and silently run `check` as a bare command.
    const defs = ACTION.match(/runner="\$\{NULLIUS_CLAIMS_BIN:-[^"]*"/g) ?? [];
    expect(defs.length).toBe(3);
    for (const def of defs) expect(def).toContain(FALLBACK);
  });
});

describe("the override is a workflow setting, and stays one", () => {
  it("is not an input, so no `${{ }}` can reach it", () => {
    /*
     * An input would be interpolated by the workflow expression evaluator, and
     * an interpolated value is one edit away from `github.event.*`. Which
     * binary CI executes is not a thing a pull request gets to choose, so the
     * override is only ever read from the ambient environment.
     */
    const inputsBlock = ACTION.slice(ACTION.indexOf("inputs:"), ACTION.indexOf("runs:"));
    expect(inputsBlock).not.toContain("NULLIUS_CLAIMS_BIN");
    expect(inputsBlock.toLowerCase()).not.toContain("claims-bin");
  });

  it("is only ever read, never assigned", () => {
    // An assignment would mean some other value — an input, a file, the event
    // payload — decides it.
    expect(ACTION).not.toMatch(/NULLIUS_CLAIMS_BIN=/);
    for (const line of ACTION.split("\n")) {
      if (!line.includes("NULLIUS_CLAIMS_BIN")) continue;
      if (line.trimStart().startsWith("#")) continue;
      if (line.includes("echo ")) continue; // the label text, which quotes the name
      expect(line).toMatch(/\$\{NULLIUS_CLAIMS_BIN:-/);
    }
  });

  it("cannot be smuggled in through GITHUB_ENV", () => {
    /*
     * `$GITHUB_ENV` is the one channel by which an earlier step could set a
     * variable a later step reads. The Action writes to `$GITHUB_OUTPUT` and
     * `$GITHUB_STEP_SUMMARY` and never to `$GITHUB_ENV`, so PR-controlled data
     * the earlier steps DO read — the description, the head ref — has no route
     * into the environment the checker is chosen from.
     */
    expect(ACTION).not.toContain("GITHUB_ENV");
  });

  it("keeps the marker first, so the label cannot break the upsert", () => {
    // Both comments are found by `startswith(marker)`. A label placed above
    // the marker would post a second comment on every open pull request.
    const headers = ACTION.match(/header=\$\(printf '%s\\n%s' "\$marker" "\$LABEL"\)/g) ?? [];
    expect(headers.length).toBe(2);
    expect(ACTION).not.toMatch(/printf '%s\\n%s' "\$LABEL"/);
  });
});

/*
 * The `Grounding card` step, executed.
 *
 * This suite began as an override test and grew this section because writing
 * the override's own verification found the reason the card had never
 * appeared: the step runs under `set -u` and read `$PR_BODY_MODE`, which its
 * `env:` block did not declare. Bash aborts on an unbound variable whether or
 * not `-e` is set, so the step died before rendering and the Action posted its
 * unstructured fallback — a comment that looks like a deliberate choice rather
 * than a crash.
 *
 * Nothing in the Action could have reported that. The step's failure is
 * indistinguishable, from outside, from a checker too old to know
 * `--format card`, which the step has a written explanation for.
 */

/** Emits a card-shaped report, so the step gets past its version gate. */
const CHECKER_STUB = `#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = "card" ]; then
    echo "## nullius claims check — stub card"
    exit \${STUB_CARD_EXIT:-0}
  fi
done
echo '{"version":1,"kind":"check-report","documents":[]}'
exit \${STUB_CARD_EXIT:-0}
`;

/** A checker too old to know the format: writes nothing, fails. */
const SILENT_STUB = `#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = "card" ]; then echo "unknown option --format card" >&2; exit 2; fi
done
echo '{"version":1,"kind":"check-report","documents":[]}'
exit 0
`;

function runCardStep(
  env: Record<string, string> = {},
  stub: string = CHECKER_STUB,
): { status: number; outputs: string; summary: string; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), "nullius-card-"));
  temps.push(dir);
  const bin = join(dir, "bin");
  execFileSync("mkdir", ["-p", bin]);
  const stubPath = join(bin, "local-checker");
  writeFileSync(stubPath, stub);
  chmodSync(stubPath, 0o755);

  const event = join(dir, "event.json");
  writeFileSync(event, JSON.stringify({ pull_request: { body: "a description" } }));
  const outputs = join(dir, "github_output");
  const summary = join(dir, "github_summary");
  writeFileSync(outputs, "");
  writeFileSync(summary, "");
  const script = join(dir, "card.sh");
  writeFileSync(script, stepScript("Grounding card"));

  const result = spawnSync("bash", [script], {
    cwd: dir,
    encoding: "utf8",
    env: {
      PATH: `${bin}:${process.env["PATH"] ?? ""}`,
      HOME: dir,
      GITHUB_OUTPUT: outputs,
      GITHUB_STEP_SUMMARY: summary,
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_EVENT_PATH: event,
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "armanfatemi/nullius",
      GITHUB_SHA: "deadbee",
      CLAIMS_VERSION: "0.12.0",
      GLOBS: "spec/**/*.md",
      CONFIG: "",
      // Non-empty deliberately, so `args` is a non-empty array.
      // `"${args[@]}"` over an EMPTY array under `set -u` is an error in bash
      // before 4.4 and legal from 4.4 on; macOS ships 3.2 and the Linux runner
      // ships 5.x. Exercising that path here would test the local shell rather
      // than the Action, and would report a failure CI cannot have.
      REQUIRE_MARKERS: "true",
      STRICT: "false",
      PR_BODY_MODE: "true",
      NULLIUS_CLAIMS_BIN: "local-checker",
      ...env,
    },
  });

  return {
    status: result.status ?? -1,
    outputs: readFileSync(outputs, "utf8"),
    summary: readFileSync(summary, "utf8"),
    stderr: result.stderr,
  };
}

describe("the Grounding card step", () => {
  it("renders a card instead of aborting on an unbound variable", () => {
    const run = runCardStep();
    expect(run.stderr).not.toContain("unbound variable");
    expect(run.status).toBe(0);
    expect(run.outputs).toContain("rendered=true");
  });

  it("posts the card when the check FAILS, which is when it is needed", () => {
    /*
     * `check` exits non-zero to report findings. The step used to read that as
     * "the card did not render" and post the unstructured fallback instead —
     * so the card was present on every clean run and absent from every run
     * that had something to say, which is indistinguishable from a card
     * feature that does not work.
     */
    const run = runCardStep({ STUB_CARD_EXIT: "1" });
    expect(run.status).toBe(0);
    expect(run.outputs).toContain("rendered=true");
    expect(run.summary).not.toContain("No card");
  });

  it("still declines when the checker is too old to know the format", () => {
    // The case the branch was written for: nothing written, so there is
    // nothing to post, and the step says which it was rather than falling
    // silent.
    const run = runCardStep({}, SILENT_STUB);
    expect(run.status).toBe(0);
    expect(run.outputs).toContain("rendered=false");
    expect(run.summary).toContain("No card");
  });

  it("keeps workflow expressions out of `run:` blocks entirely", () => {
    /*
     * The runner evaluates `${{ }}` ANYWHERE in the manifest, `run:` block
     * scalars included, and an empty one is a parse error that rejects the
     * whole file — `An expression was expected`. It cost a red CI run to
     * learn, in a shell COMMENT that was only describing the syntax.
     *
     * Nothing here can catch it: the other tests in this file extract the
     * `run:` body and execute it as bash, where the text is inert. Only the
     * runner parses the manifest, so the guard has to be a rule about the
     * file rather than an observation of its behaviour.
     *
     * The rule matches what the file already does — every interpolation
     * happens in an `env:` block and reaches the shell as a variable, which
     * is also the boundary that keeps PR-controlled content out of the
     * scripts.
     */
    const lines = ACTION.split("\n");
    const offenders: string[] = [];
    for (const [i, line] of lines.entries()) {
      const named = /^    - name: (.+)$/.exec(line);
      if (named === null) continue;
      let script: string;
      try {
        script = stepScript(named[1] ?? "");
      } catch {
        continue;
      }
      if (script.includes("${{")) offenders.push(`${named[1]} (near line ${i + 1})`);
    }
    expect(offenders).toEqual([]);
  });

  it("declares every variable it reads under `set -u`", () => {
    /*
     * The general form of the defect above, asserted for every step, because
     * the next one will be a different variable name. A step's `env:` block is
     * the only thing standing between a `$VAR` and a step that dies before
     * doing its work — and dies looking like a decision.
     */
    const PROVIDED = new Set([
      // Supplied by the runner to every step.
      "GITHUB_OUTPUT", "GITHUB_STEP_SUMMARY", "GITHUB_EVENT_NAME", "GITHUB_EVENT_PATH",
      "GITHUB_SERVER_URL", "GITHUB_REPOSITORY", "GITHUB_SHA", "GITHUB_WORKSPACE",
    ]);
    const lines = ACTION.split("\n");
    const undeclared: string[] = [];

    for (const [i, line] of lines.entries()) {
      const named = /^    - name: (.+)$/.exec(line);
      if (named === null) continue;
      const name = named[1] ?? "";
      // The step's declared env keys, read from the block between its header
      // and its `run:`.
      const declared = new Set(PROVIDED);
      for (let j = i + 1; j < lines.length; j += 1) {
        const l = lines[j] ?? "";
        if (l === "      run: |") break;
        if (l.startsWith("    - name: ")) break;
        const key = /^        ([A-Z_][A-Z0-9_]*):/.exec(l);
        if (key?.[1] !== undefined) declared.add(key[1]);
      }
      let script: string;
      try {
        script = stepScript(name);
      } catch {
        continue; // a `uses:` step has no shell
      }
      // Anything the script assigns for itself is fine.
      for (const m of script.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)=/gm)) {
        if (m[1] !== undefined) declared.add(m[1]);
      }
      for (const m of script.matchAll(/\bfor\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\b/g)) {
        if (m[1] !== undefined) declared.add(m[1]);
      }
      // `jq --arg m "$marker"` binds `$m` inside the jq program, which is a
      // different language in a single-quoted string. Not a shell read.
      for (const m of script.matchAll(/--arg\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
        if (m[1] !== undefined) declared.add(m[1]);
      }
      // Every read. `${VAR:-default}` and `${VAR:+…}` are safe by construction,
      // so only the bare forms count.
      const reads = [
        ...script.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)\b/g),
        ...script.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g),
      ];
      for (const m of reads) {
        const v = m[1];
        if (v === undefined || declared.has(v)) continue;
        undeclared.push(`${name}: $${v}`);
      }
    }

    expect([...new Set(undeclared)]).toEqual([]);
  });
});
