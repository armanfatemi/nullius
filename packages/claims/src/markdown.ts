/**
 * Markdown escaping, shared by every renderer that puts untrusted text in a
 * table.
 *
 * It lives in its own module because two renderers now need it and the second
 * copy is the thing to avoid: `escapeCell` is security-relevant — the checked
 * document is PR-controlled input — and two implementations of it would drift
 * exactly where drift is least visible.
 *
 * `witnessReport` re-exports it so its existing callers and tests are
 * unaffected by the move.
 */

const CONTROL = /[\u0000-\u001F\u007F]/g;

/**
 * Escape a string for a markdown table cell.
 *
 * Order matters: the backslash goes first, or every escape added below is
 * itself escaped by the pass that was supposed to protect it. Control
 * characters — including the newline that would end the row and the carriage
 * return that would hide the rest of it — become a visible middle dot rather
 * than vanishing, because a cell that silently loses its second half reads as
 * a shorter string rather than as a redacted one.
 */
export function escapeCell(value: string): string {
  const flattened = value.replace(CONTROL, "·");
  const escaped = flattened
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/`/g, "\\`")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // A leading markdown control character turns the cell into a heading, a list
  // item or a blockquote in renderers that reflow a table cell's contents.
  return /^[#>\-+=!]/.test(escaped) ? `\\${escaped}` : escaped;
}

/**
 * The noun (or verb) for a count, singular or plural. Never `"noun(s)"` — a
 * literal, unresolved parenthesis is a template nobody finished, not a
 * compromise, and both renderers in this package had it in a dozen places at
 * once, which is what made it read as unproofread rather than as one missed
 * spot. Shared for the same reason `escapeCell` is: a second copy is the
 * thing to avoid, not a convenience.
 */
export function plural(n: number, singular: string, irregularPlural?: string): string {
  return n === 1 ? singular : (irregularPlural ?? `${singular}s`);
}

/**
 * A count, with thousands separated by commas — "4,986,490" tokens scans in
 * one glance; "4986490" does not. Not `toLocaleString()`: that reads the
 * runtime's default locale, which is exactly the kind of environment
 * dependency that would make a golden fixture differ machine to machine. A
 * fixed comma is deterministic regardless of where this renders.
 */
export function formatCount(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
