// Time helpers. All business time is Pakistan Standard Time (UTC+5, no DST).
// Shift time is 14:00–22:00 PKT; off-time is 22:00–14:00 PKT (P1-FR-004).

export const MIN = 60_000
export const HOUR = 60 * MIN
export const DAY = 24 * HOUR
const PKT_OFFSET = 5 * HOUR
export const SHIFT_START_HOUR = 14
export const SHIFT_END_HOUR = 22
export const SLA_MS = HOUR

/** A Date whose UTC getters read as PKT wall-clock values. */
function pkt(t: number) {
  return new Date(t + PKT_OFFSET)
}

const pad = (n: number) => String(n).padStart(2, '0')

export function pktDateKey(t: number): string {
  const d = pkt(t)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function monthKey(t: number): string {
  const d = pkt(t)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

export function pktHour(t: number): number {
  return pkt(t).getUTCHours()
}

/** UTC epoch for a PKT wall-clock time. */
export function fromPkt(y: number, m: number, d: number, h = 0, min = 0, s = 0): number {
  return Date.UTC(y, m - 1, d, h, min, s) - PKT_OFFSET
}

export function isShiftTime(t: number): boolean {
  const h = pktHour(t)
  return h >= SHIFT_START_HOUR && h < SHIFT_END_HOUR
}

/** Start of the PKT day containing t. */
export function pktDayStart(t: number): number {
  const d = pkt(t)
  return fromPkt(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/**
 * The shift a moment belongs to. During shift: today's date.
 * During off-time: the upcoming shift (the one at whose start Absent agents are marked).
 */
export function shiftKey(t: number): string {
  const h = pktHour(t)
  if (h >= SHIFT_END_HOUR) return pktDateKey(t + DAY)
  return pktDateKey(t)
}

/** Next 14:00 or 22:00 PKT boundary strictly after t. */
export function nextShiftBoundary(t: number): number {
  const day = pktDayStart(t)
  const candidates = [
    day + SHIFT_START_HOUR * HOUR,
    day + SHIFT_END_HOUR * HOUR,
    day + DAY + SHIFT_START_HOUR * HOUR,
  ]
  return candidates.find((c) => c > t)!
}

export function nextShiftStart(t: number): number {
  const day = pktDayStart(t)
  const today = day + SHIFT_START_HOUR * HOUR
  return today > t ? today : today + DAY
}

export function nextShiftEnd(t: number): number {
  const day = pktDayStart(t)
  const today = day + SHIFT_END_HOUR * HOUR
  return today > t ? today : today + DAY
}

export function nextMonthStart(t: number): number {
  const d = pkt(t)
  return fromPkt(d.getUTCFullYear(), d.getUTCMonth() + 2, 1)
}

export function monthStart(t: number): number {
  const d = pkt(t)
  return fromPkt(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
}

/** Milliseconds of shift time inside [a, b). */
export function shiftOverlap(a: number, b: number): number {
  let total = 0
  let t = a
  while (t < b) {
    const nb = Math.min(nextShiftBoundary(t), b)
    if (isShiftTime(t)) total += nb - t
    t = nb
  }
  return total
}

// ---------- formatting ----------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function fmtTime(t: number): string {
  const d = pkt(t)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

export function fmtTimeSec(t: number): string {
  const d = pkt(t)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

export function fmtDate(t: number): string {
  const d = pkt(t)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function fmtDateShort(t: number): string {
  const d = pkt(t)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

export function fmtDateTime(t: number): string {
  return `${fmtDateShort(t)}, ${fmtTime(t)}`
}

export function fmtDow(t: number): string {
  return DOW[pkt(t).getUTCDay()]
}

export function fmtMonthKey(k: string): string {
  const [y, m] = k.split('-').map(Number)
  return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${y}`
}

export function fmtDuration(ms: number): string {
  const neg = ms < 0
  ms = Math.abs(ms)
  const h = Math.floor(ms / HOUR)
  const m = Math.floor((ms % HOUR) / MIN)
  const s = Math.floor((ms % MIN) / 1000)
  const body = h > 0 ? `${h}h ${pad(m)}m` : `${m}m ${pad(s)}s`
  return neg ? `-${body}` : body
}

export function fmtRelative(t: number, now: number): string {
  const diff = now - t
  if (diff < MIN) return 'just now'
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`
  return fmtDateShort(t)
}

/** ISO week start (Monday) date key for weekly reporting, in PKT. */
export function weekKey(t: number): string {
  const day = pktDayStart(t)
  const dow = (pkt(day).getUTCDay() + 6) % 7
  return pktDateKey(day - dow * DAY)
}

export function dateKeyToStart(k: string): number {
  const [y, m, d] = k.split('-').map(Number)
  return fromPkt(y, m, d)
}
