// A lightweight sanitizer, not a full library like DOMPurify. Good enough
// for "don't let a forwarded email execute script in your browser," not
// meant to be bulletproof against a determined attacker. If this page ever
// handles anything more sensitive than personal email forwarding, swap
// this for a real sanitizer (isomorphic-dompurify works well with SSR).
export function sanitizeEmailHtml(html) {
  if (!html) return "";
  let out = html;

  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");
  out = out.replace(/<object[\s\S]*?<\/object>/gi, "");
  out = out.replace(/<embed[^>]*>/gi, "");
  out = out.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  out = out.replace(/(href|src)\s*=\s*["']javascript:[^"']*["']/gi, '$1="#"');

  return out;
}
