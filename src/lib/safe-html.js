import DOMPurify from '../../vendor/dompurify/purify.es.mjs';

// All browser HTML sinks use the same sanitizer. No permissive default policy.
// Pure Node presentation tests have no DOM; they compare serialized markup.
export function safeHtml(markup) {
  if (typeof document === 'undefined' || document.nodeType !== 9) return String(markup ?? '');
  if (!DOMPurify.isSupported) throw new Error('This browser cannot safely render the workspace.');
  return DOMPurify.sanitize(String(markup ?? ''), { RETURN_TRUSTED_TYPE: true, ADD_ATTR: ['target', 'contenteditable'] });
}
