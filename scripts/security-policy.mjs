import { createHash } from 'node:crypto';
export function securityHeaders(htmlFiles, supabaseUrl = '') {
  const hashes = new Set();
  for (const html of htmlFiles) for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1]) && match[2].trim()) hashes.add(`'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`);
  }
  const connect = supabaseUrl ? ` ${new URL(supabaseUrl).origin}` : '';
  const csp = `default-src 'self'; script-src 'self' ${[...hashes].join(' ')}; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self'; connect-src 'self'${connect}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; frame-src 'none'; upgrade-insecure-requests`;
  return `/*\n  Content-Security-Policy: ${csp}\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()\n  Strict-Transport-Security: max-age=31536000\n/*.js\n  Cache-Control: no-cache\n/*.css\n  Cache-Control: no-cache\n/\n  Cache-Control: no-cache\n/*.html\n  Cache-Control: no-cache\n/admin/*\n  Cache-Control: no-store\n  X-Robots-Tag: noindex, nofollow\n`;
}
