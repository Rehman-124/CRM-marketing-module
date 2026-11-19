// Fast id lookups for read paths (screens). Records are only ever appended, never removed, so a map is valid while
// its size matches the array length. Inside an immer draft we always search linearly, so callers get draft objects
// they may mutate — never frozen originals from a cache.

import { isDraft } from 'immer'
import type { AppData, Lead, Opportunity } from './types'

const leadById = new WeakMap<Lead[], Map<string, Lead>>()
const oppByLead = new WeakMap<Opportunity[], Map<string, Opportunity>>()
const oppById = new WeakMap<Opportunity[], Map<string, Opportunity>>()

function cached<T extends { id: string }>(cache: WeakMap<T[], Map<string, T>>, arr: T[], key: (x: T) => string): Map<string, T> | null {
  if (isDraft(arr)) return null
  let m = cache.get(arr)
  if (!m || m.size !== arr.length) {
    m = new Map(arr.map((x) => [key(x), x]))
    cache.set(arr, m)
  }
  return m as Map<string, T>
}

export function findLead(S: AppData, id: string | null | undefined): Lead | undefined {
  if (!id) return undefined
  const m = cached(leadById, S.leads, (l) => l.id)
  return m ? m.get(id) : S.leads.find((l) => l.id === id)
}

export function findOppByLead(S: AppData, leadId: string): Opportunity | undefined {
  const m = cached(oppByLead, S.opportunities, (o) => o.leadId)
  return m ? m.get(leadId) : S.opportunities.find((o) => o.leadId === leadId)
}

export function findOpp(S: AppData, id: string | null | undefined): Opportunity | undefined {
  if (!id) return undefined
  const m = cached(oppById, S.opportunities, (o) => o.id)
  return m ? m.get(id) : S.opportunities.find((o) => o.id === id)
}
