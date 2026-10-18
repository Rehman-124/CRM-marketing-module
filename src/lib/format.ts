export const NA = 'N/A'

export function money(n: number | null | undefined, digits = 2): string {
  if (n == null || !isFinite(n)) return NA
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function num(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return NA
  return Math.round(n).toLocaleString('en-GB')
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || !isFinite(n)) return NA
  return (n * 100).toFixed(digits) + '%'
}

export function dec(n: number | null | undefined, digits = 2): string {
  if (n == null || !isFinite(n)) return NA
  return n.toFixed(digits)
}
