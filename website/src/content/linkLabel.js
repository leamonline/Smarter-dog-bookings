/**
 * Visible words for a link part. `text` wins. If the words were stored on
 * `book`, `link`, `href` or `wa` instead, those words are used so the anchor
 * is never empty.
 */
export function linkLabelFor(part) {
  if (typeof part?.text === 'string' && part.text.trim()) return part.text;
  for (const key of ['book', 'link', 'href', 'wa']) {
    const value = part?.[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}
