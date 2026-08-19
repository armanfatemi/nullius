/**
 * Presence citations let a checked document — which is PR-controlled content —
 * name the file this tool reads. Without a guard, a citation like
 * `**Evidence:** `/etc/passwd:1` — `root`` turns the checker into a file-probe
 * oracle on the CI runner: the verdict (`ok` vs `fabricated` vs `missing-file`)
 * leaks whether a path exists and whether a guessed string is in it, and that
 * verdict is posted to a public PR comment.
 *
 * Citations may only ever point at repo-relative paths, so the guard is simple
 * and total: no absolute paths, no `..` traversal, no home expansion.
 *
 * See spec/evidence-anchors.md → "Security model".
 */

export type PathVerdict = { safe: true } | { safe: false; reason: string };

export function isSafeRepoPath(path: string): PathVerdict {
  const trimmed = path.trim();

  if (trimmed.length === 0) {
    return { safe: false, reason: "path is empty" };
  }

  if (trimmed.includes("\0")) {
    return { safe: false, reason: "path contains a null byte" };
  }

  if (trimmed.startsWith("/") || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    return { safe: false, reason: "absolute paths are not allowed" };
  }

  if (trimmed.startsWith("~")) {
    return { safe: false, reason: "home-relative paths are not allowed" };
  }

  // Split on both separators so `..\\foo` is caught on any platform.
  const segments = trimmed.split(/[\\/]/);
  if (segments.some((segment) => segment === "..")) {
    return { safe: false, reason: "path traversal ('..') is not allowed" };
  }

  // `.git` is inside the repository but is not source, and under
  // `actions/checkout` it holds the workflow's credentials: with
  // `persist-credentials` on (the default) `.git/config` carries an
  // `AUTHORIZATION: basic <token>` header. A citation that can search it turns
  // each anchor into one bit of a token-extraction oracle, and a document may
  // carry unlimited anchors.
  if (segments.some((segment) => segment === ".git")) {
    return { safe: false, reason: "paths inside '.git' are not allowed" };
  }

  return { safe: true };
}
