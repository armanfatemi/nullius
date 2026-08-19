# Binding Moments

**Version 0.1 — draft.** The companion to
[Evidence Anchors](./evidence-anchors.md): anchors catch false **facts**;
binding moments catch false **mechanisms**. This half is **additive and
severable** — adopt anchors alone and lose nothing here; a document with no
`**Binds at:**` markers simply has none checked.

## The failure class

There is a second way a design document lies that citations alone cannot
catch: every fact in it is true, but the causal model of _when and where_ a
compatibility constraint binds is wrong. That error is worse than it looks,
because **the wrong mechanism produces a mitigation that does not work.**

The incident that produced this spec: a design framed a rollout risk as
"partial supergraph composition" — two GraphQL subgraphs momentarily composed
against different schema versions. That state could not exist in the system in
question: composition ran at image build and again as a CI gate, so the
composed schema was frozen into the gateway image. The _real_ window was the
rollout itself — the deployment ran multiple replicas with a default rolling
update, so two images of the **same service** served simultaneously. A
composition-framed mitigation ("deploy all subgraphs together") does nothing
about intra-service replica skew. The correct mitigation was
expand-then-migrate: ship the tolerant reader **before** the writer emits the
new value.

## Step 1 — the build-time pre-filter

Before writing any compatibility risk, ask: **is this caught at build time?**
If the type-checker, code generation, or a schema-composition step fails on
it, CI catches it and nothing ships — **delete the risk paragraph.** This
single question kills most false mechanisms outright.

The checker enforces a soft version of this: a risk whose moment is in the
project's CI-caught list (default: `build-time`) passes with an `ADVISORY`
verdict prompting you to confirm it is documented as a non-risk, not presented
as a runtime risk.

**Evidence:** `packages/claims/src/checkClaims.ts:403` — `const ciCaughtMoments = options.ciCaughtMoments ?? ["build-time"];`

## Step 2 — if it survives, name the mechanism

```markdown
**Risk:** <one line>
**Binds at:** <one moment id from the closed list>
**Skew path:** <producer @ver> → <medium> → <consumer @ver>
**Symptom:** <what observably fails, and where you would see it>
**Mitigation closes it because:** <ties explicitly to the named moment>
```

Only the `**Binds at:**` line is machine-checked (the moment must come from
the closed list); the surrounding fields are for the human reviewer, and the
discipline of filling them in is most of the value.

## The default closed list

Most mechanism errors are picking the wrong one of these six. The defaults
model a replicated-service backend (multiple replicas, rolling deploys,
event log, evolving data at rest). Use the id verbatim — the checker
string-matches it.

| id                   | When two versions meet                                                          |
| -------------------- | ------------------------------------------------------------------------------- |
| `build-time`         | Compile, codegen, schema composition. **Not a runtime risk** — CI catches it.   |
| `rollout-window`     | Rolling-update skew: two replicas of the _same_ service at different versions.  |
| `inter-service-skew` | Services deploy independently; service A at v(n) talks to service B at v(n−1).  |
| `event-consumption`  | A consumer reads a queued/logged event written by a different-version producer. |
| `replay-migration`   | A projection/index rebuild replays history; old records meet new handler code.  |
| `data-at-rest`       | A row written by v(n) is read by v(n−1), or read long after the shape changed.  |

## Why a closed list works

A closed vocabulary needs no separate enforcement machinery, because **each
moment decomposes into Evidence Anchors**. `rollout-window` is only real if
the deployment runs multiple replicas with a rolling update — which is a
`path:line` citation. `event-consumption` is only real if a consumer actually
subscribes to that event — also citable. **Name the moment, then cite the
fact that makes the moment real:**

```markdown
**Risk:** An old replica cannot serialize a row carrying the new `TIMED_OUT` status.
**Binds at:** `rollout-window`
**Skew path:** settings @v(n) → task row in the database → settings @v(n−1)
**Symptom:** serialization error on the non-nullable `status` field; the admin
task page errors for any page containing an affected row.
**Mitigation closes it because:** the reader tolerance ships in release n−1, so
no replica that can observe a `TIMED_OUT` row lacks the value. Deploying the
services together would NOT close it — the skew is between two replicas of one
service.
**Evidence:** `k8s/base/settings/deployment.yaml:12` — `  replicas: 2`
**Evidence:** `grep -rn 'strategy:' k8s/base/settings/deployment.yaml` → 0 results
```

## Customizing the vocabulary

The six defaults fit replicated services. A different platform has different
moments — a mobile team's are more like:

```json
{
  "moments": [
    "compile-time",
    "app-store-review-lag",
    "client-version-skew",
    "cached-response",
    "local-storage-at-rest"
  ],
  "ciCaughtMoments": ["compile-time"]
}
```

Set them in `nullius.config.json`. Keep the list **closed and short** — the
mechanism only works if an invented moment fails the check
(`UNKNOWN-MOMENT`) instead of sliding through as plausible prose. If your
list grows past ~8 entries, you are probably naming symptoms, not binding
moments.

## Scope

This applies to claims of **technical breakage or incompatibility**. Product
and UX risk ("users may be confused") have no binding moment and must not be
forced into this template.
