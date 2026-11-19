// Time helpers. All business time is Pakistan Standard Time (UTC+5, no DST).
// Shift time is 14:00–22:00 PKT; off-time is 22:00–14:00 PKT (P1-FR-003).

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

// ---------- UK-local time (SAL-FR-001: contact tasks are created in UK-local time) ----------

const UK_PARTS = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

const UK_CACHE = new Map<number, { y: number; m: number; d: number; h: number; min: number }>()
/** Intl formatting is slow, so results are cached per minute (UK offsets change only on whole hours). */
export function ukParts(t: number) {
  const key = Math.floor(t / 60_000)
  const hit = UK_CACHE.get(key)
  if (hit) return hit
  const p = Object.fromEntries(UK_PARTS.formatToParts(key * 60_000).map((x) => [x.type, x.value]))
  const v = { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), min: Number(p.minute) }
  if (UK_CACHE.size > 20_000) UK_CACHE.clear()
  UK_CACHE.set(key, v)
  return v
}

/** Epoch for a UK wall-clock time (handles GMT/BST). */
export function fromUK(y: number, m: number, d: number, h = 0, min = 0): number {
  let guess = Date.UTC(y, m - 1, d, h, min)
  for (let i = 0; i < 2; i++) {
    const p = ukParts(guess)
    const shown = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min)
    guess -= shown - Date.UTC(y, m - 1, d, h, min)
  }
  return guess
}

export function ukDateKey(t: number): string {
  const p = ukParts(t)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`
}

/** End of the UK calendar day containing t (a window task is overdue after its day ends). */
export function ukDayEnd(t: number): number {
  const p = ukParts(t)
  return fromUK(p.y, p.m, p.d + 1, 0, 0)
}

export function fmtUK(t: number): string {
  const p = ukParts(t)
  return `${p.d} ${MONTHS[p.m - 1]}, ${pad(p.h)}:${pad(p.min)} UK`
}

export function fmtUKDate(t: number): string {
  const p = ukParts(t)
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y}`
}

/** Value for <input type="datetime-local"> in UK time. */
export function toUKInput(t: number): string {
  const p = ukParts(t)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`
}

export function fromUKInput(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v)
  if (!m) return null
  return fromUK(+m[1], +m[2], +m[3], +m[4], +m[5])
}

export function fromUKDateInput(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (!m) return null
  return fromUK(+m[1], +m[2], +m[3], 12, 0)
}

export const fmtMoney = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
