/**
 * Money formatting for the scanner app.
 *
 * Server returns money as MINOR-unit integer strings (kobo for NGN, cents
 * for USD) — strings, not numbers, to avoid float precision loss past
 * 2^53. We parse to a number only at the very end for display; values in
 * a retail catalogue never exceed safe-integer range, but we still treat
 * the wire value as opaque until the formatting step.
 */

const CURRENCY_SYMBOL: Record<string, string> = {
  NGN: '₦', // ₦
  USD: '$',
};

const CURRENCY_LOCALE: Record<string, string> = {
  NGN: 'en-NG',
  USD: 'en-US',
};

/**
 * Format a minor-unit string (e.g. "1234500") as a display price
 * (e.g. "₦12,345.00"). Returns "—" for nullish or unparseable input.
 */
export function formatMinor(
  minor: string | number | null | undefined,
  currency: 'NGN' | 'USD' = 'NGN',
): string {
  if (minor === null || minor === undefined) return '—';
  const n = typeof minor === 'string' ? Number(minor) : minor;
  if (!Number.isFinite(n)) return '—';
  const major = n / 100;
  const symbol = CURRENCY_SYMBOL[currency] ?? '';
  const locale = CURRENCY_LOCALE[currency] ?? 'en-US';
  return `${symbol}${major.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Render a variant's options map as "Black · M" etc. Empty → "". */
export function formatOptions(
  options: Record<string, string> | null | undefined,
): string {
  if (!options) return '';
  const values = Object.values(options).filter(Boolean);
  return values.join(' · ');
}
