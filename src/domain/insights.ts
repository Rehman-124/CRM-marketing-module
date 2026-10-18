// Simulated Meta campaign/ad insights. The proof of concept reported that campaign- and
// ad-level insights can be retrieved (TO-BE v0.2 §14); production setup is pending, so the
// prototype generates rows in the same shape. Results = Meta Instant Form leads for the ad that day.

import type { AppData, InsightRow } from './types'
import { pktDateKey, pktDayStart, DAY, fromPkt } from '../lib/time'

export const INSIGHTS_START = fromPkt(2026, 9, 1)

export function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function refreshInsights(S: AppData): boolean {
  if (!S.metaAvailable) return false
  const now = S.clock.now
  const today = pktDayStart(now)
  const resultCount = new Map<string, number>()
  for (const l of S.leads) {
    if (l.source !== 'meta_form' || !l.adId) continue
    const k = `${l.adId}|${pktDateKey(l.createdAt)}`
    resultCount.set(k, (resultCount.get(k) ?? 0) + 1)
  }
  const rows: InsightRow[] = []
  for (const ad of S.ads) {
    const base = 18 + (hash(ad.id) % 38)
    for (let d = INSIGHTS_START; d <= today; d += DAY) {
      const date = pktDateKey(d)
      const r = mulberry32(hash(ad.id + date))
      const fraction = d === today ? Math.max(0.05, (now - today) / DAY) : 1
      const spend = Math.round(base * (0.7 + 0.6 * r()) * fraction * 100) / 100
      const impressions = Math.round(spend * (90 + 70 * r()))
      const reach = Math.round(impressions / (1.2 + 0.6 * r()))
      const clicks = Math.round(impressions * (0.008 + 0.014 * r()))
      rows.push({ adId: ad.id, date, spend, impressions, reach, clicks, results: resultCount.get(`${ad.id}|${date}`) ?? 0 })
    }
  }
  S.insights = rows
  S.metaLastRefreshedAt = now
  return true
}
