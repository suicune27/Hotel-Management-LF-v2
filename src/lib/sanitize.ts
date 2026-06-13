/**
 * Strip HTML tags and escape special characters for safe display.
 */
export function sanitizeText(input: string, maxLength = 1000): string {
  if (!input) return '';
  const stripped = input.replace(/<[^>]*>/g, '');
  const escaped = stripped
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
  return escaped.slice(0, maxLength);
}

/**
 * Sanitize and return raw HTML-safe string stripped of tags only (no entity escaping).
 * Use for textarea content that should preserve line breaks.
 */
export function sanitizeHtml(input: string, maxLength = 5000): string {
  if (!input) return '';
  return input.replace(/<[^>]*>/g, '').slice(0, maxLength);
}

/**
 * Validate and sanitize an email address. Returns null if invalid.
 */
export function sanitizeEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase().replace(/<[^>]*>/g, '').slice(0, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

/**
 * Validate and sanitize a phone number. Returns digits only or null.
 */
export function sanitizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '').slice(0, 20);
  return digits.length >= 7 ? digits : null;
}
