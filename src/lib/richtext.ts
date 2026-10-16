import DOMPurify from 'dompurify';

/**
 * Shared helpers for letter bodies.
 *
 * Letters historically stored plain text (paragraphs separated by \n). With the
 * rich-text editor, bodies are stored as HTML. These helpers keep every consumer
 * (view, copy/share, PDF, Word, print) working with both formats.
 */

/** Tags the rich editor may produce / that are safe to render and export. */
const ALLOWED_TAGS = [
  'p', 'br', 'span', 'div', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
  'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'hr', 'a',
  'pre', 'code', 'mark',
];

const ALLOWED_ATTR = ['style', 'class', 'href', 'target', 'rel'];

/** True when the content contains HTML tags (new rich format). */
export function looksLikeHtml(value: string): boolean {
  return /<[a-z][^>]*>/i.test(value);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Converts a legacy plain-text body into simple HTML paragraphs. */
export function plainTextToHtml(text: string): string {
  const paragraphs = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
  if (paragraphs.length === 1 && !paragraphs[0].includes('\n')) {
    return `<p>${escapeHtml(text)}</p>`;
  }
  return paragraphs
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** Sanitizes letter HTML before rendering / exporting it. */
export function sanitizeLetterHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}

/** Returns the letter body as plain text (for copy / share / legacy PDF). */
export function htmlToPlainText(content: string): string {
  if (!looksLikeHtml(content)) return content;

  const withBreaks = content
    .replace(/<\/(p|h1|h2|h3|h4|li|blockquote|div|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');

  const holder = document.createElement('div');
  holder.innerHTML = sanitizeLetterHtml(withBreaks);
  const text = holder.textContent ?? '';
  return text.replace(/\n{3,}/g, '\n\n').trim();
}
