import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { produce } from 'immer'
import type { AppData, CompanyId, User } from '@/domain/types'
import { buildSeed, DATA_VERSION } from '@/domain/seed'
import { advanceTo } from '@/domain/engine'

const LEGACY_DATA_KEY = 'trip2go-mkt-data'
const SESSION_KEY = 'trip2go-mkt-session'

interface Session {
  currentUserId: string
  companyFilter: CompanyId | 'all'
}

interface StoreState {
  data: AppData
  /** Increases on every user action (not on clock ticks) — lets calm views refresh immediately after an action. */
  actionVersion: number
  session: Session
  run: <T>(fn: (draft: AppData) => T) => T
  setSession: (patch: Partial<Session>) => void
  resetDemo: () => void
}

// ------------------------------------------------------------ persistence (IndexedDB)
// The Marketing + Sales demo history is larger than the ~5 MB localStorage quota, so the data lives in IndexedDB.
// It stays in this browser only. The session (who you are viewing as) stays in localStorage.

const DB_NAME = 'trip2go-crm-demo'
const STORE = 'kv'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
let dbPromise: Promise<IDBDatabase> | null = null
const db = () => (dbPromise ??= openDb())

async function idbGet<T>(key: string): Promise<T | undefined> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}
async function idbPut(key: string, value: unknown): Promise<void> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function loadData(): Promise<AppData> {
  try {
    const saved = await idbGet<AppData>('data')
    if (saved && saved.version === DATA_VERSION) return saved
  } catch { /* IndexedDB unavailable — fall back to seed */ }
  return buildSeed()
}

function loadSession(): Session {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { currentUserId: 'u-admin', companyFilter: 'all' }
}

export const useStore = create<StoreState>((set, get) => ({
  // Filled by initStore() before the app renders.
  data: undefined as unknown as AppData,
  actionVersion: 0,
  session: loadSession(),
  run: (fn) => {
    let out: ReturnType<typeof fn> | undefined
    if (!clockTick) actionPending = true
    const data = produce(get().data, (d) => { out = fn(d as AppData) })
    set(clockTick ? { data } : { data, actionVersion: get().actionVersion + 1 })
    return out as ReturnType<typeof fn>
  },
  setSession: (patch) => {
    const session = { ...get().session, ...patch }
    set({ session })
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)) } catch { /* ignore */ }
  },
  resetDemo: () => {
    set({ data: buildSeed(), actionVersion: get().actionVersion + 1 })
  },
}))

/** Load the saved demo data (or build the seed) before the first render. */
export async function initStore() {
  try { localStorage.removeItem(LEGACY_DATA_KEY) } catch { /* ignore */ }
  const data = await loadData()
  useStore.setState({ data })
  if (!useStore.getState().session || !data.users.some((u) => u.id === useStore.getState().session.currentUserId)) {
    useStore.getState().setSession({ currentUserId: 'u-admin', companyFilter: 'all' })
  }
}

// Throttled persistence so the demo survives a page reload. A user action is saved within 1.5 s; changes made only by
// the ticking clock are saved every 30 s, so the ~6 MB demo history is not rewritten to disk every second.
let saveTimer: ReturnType<typeof setTimeout> | null = null
let saveDueAt = 0
let saving = false
let clockTick = false
let actionPending = false
function saveNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  actionPending = false
  if (saving) { saveTimer = setTimeout(saveNow, 500); return }
  saving = true
  idbPut('data', useStore.getState().data).catch(() => { /* storage blocked */ }).finally(() => { saving = false })
}
useStore.subscribe((s, prev) => {
  if (s.data === prev.data || !s.data) return
  // Throttle, not debounce: the clock changes data every second, so a debounce would never fire.
  const delay = actionPending ? 1500 : 30_000
  const due = Date.now() + delay
  if (saveTimer && due >= saveDueAt) return
  if (saveTimer) clearTimeout(saveTimer)
  saveDueAt = due
  saveTimer = setTimeout(saveNow, delay)
})
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { if (saveTimer) saveNow() })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveTimer) saveNow() })
}

// Simulated clock: advances by `speed` seconds every real second while running.
let ticker: ReturnType<typeof setInterval> | null = null
export function startClock() {
  if (ticker) return
  ticker = setInterval(() => {
    const { data, run } = useStore.getState()
    if (!data?.clock.running) return
    clockTick = true
    try { run((d) => advanceTo(d, d.clock.now + 1000 * d.clock.speed)) } finally { clockTick = false }
  }, 1000)
}

// ------------------------------------------------------------ hooks

export const useAppData = () => useStore((s) => s.data)

/**
 * Data for heavy views (lists, reports, navigation badges). It refreshes immediately after any user action or session
 * change, but follows clock-only ticks at most every `intervalMs`, so a ticking clock does not re-render whole pages
 * every second. Time-critical widgets (SLA timers, the clock) keep using useAppData / useData.
 */
export function useCalmData(intervalMs = 4000): AppData {
  const action = useStore((s) => s.actionVersion)
  const session = useStore((s) => s.session)
  const [snap, setSnap] = useState(() => useStore.getState().data)
  useEffect(() => { setSnap(useStore.getState().data) }, [action, session])
  useEffect(() => {
    const t = setInterval(() => setSnap(useStore.getState().data), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return snap
}
/** Selector must return a primitive or a stable reference. */
export const useData = <T,>(sel: (d: AppData) => T) => useStore((s) => sel(s.data))
export const useRun = () => useStore((s) => s.run)
export const useNow = () => useStore((s) => s.data.clock.now)

export function useMe(): User {
  const id = useStore((s) => s.session.currentUserId)
  const users = useStore((s) => s.data.users)
  return users.find((u) => u.id === id) ?? users[0]
}
