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
