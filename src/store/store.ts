import { create } from 'zustand'
import { produce } from 'immer'
import type { AppData, CompanyId, User } from '@/domain/types'
import { buildSeed, DATA_VERSION } from '@/domain/seed'
import { advanceTo } from '@/domain/engine'

const DATA_KEY = 'trip2go-mkt-data'
const SESSION_KEY = 'trip2go-mkt-session'

interface Session {
  currentUserId: string
  companyFilter: CompanyId | 'all'
}

interface StoreState {
  data: AppData
  session: Session
  run: <T>(fn: (draft: AppData) => T) => T
  setSession: (patch: Partial<Session>) => void
  resetDemo: () => void
}

function loadData(): AppData {
  try {
    const raw = localStorage.getItem(DATA_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppData
      if (parsed.version === DATA_VERSION) return parsed
    }
  } catch { /* storage unavailable — fall back to seed */ }
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
  data: loadData(),
  session: loadSession(),
  run: (fn) => {
    let out: ReturnType<typeof fn> | undefined
    set({ data: produce(get().data, (d) => { out = fn(d as AppData) }) })
    return out as ReturnType<typeof fn>
  },
  setSession: (patch) => {
    const session = { ...get().session, ...patch }
    set({ session })
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)) } catch { /* ignore */ }
  },
  resetDemo: () => {
    set({ data: buildSeed() })
  },
}))

// Debounced persistence so the demo survives a page reload.
let saveTimer: ReturnType<typeof setTimeout> | null = null
function saveNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  try { localStorage.setItem(DATA_KEY, JSON.stringify(useStore.getState().data)) } catch { /* quota or private mode */ }
}
useStore.subscribe((s, prev) => {
  if (s.data === prev.data) return
  // Throttle, not debounce: the clock changes data every second, so a debounce would never fire.
  if (!saveTimer) saveTimer = setTimeout(saveNow, 1500)
})
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { if (saveTimer) saveNow() })

// Simulated clock: advances by `speed` seconds every real second while running.
let ticker: ReturnType<typeof setInterval> | null = null
export function startClock() {
  if (ticker) return
  ticker = setInterval(() => {
    const { data, run } = useStore.getState()
    if (!data.clock.running) return
    run((d) => advanceTo(d, d.clock.now + 1000 * d.clock.speed))
  }, 1000)
}

// ------------------------------------------------------------ hooks

export const useAppData = () => useStore((s) => s.data)
/** Selector must return a primitive or a stable reference. */
export const useData = <T,>(sel: (d: AppData) => T) => useStore((s) => sel(s.data))
export const useRun = () => useStore((s) => s.run)
export const useNow = () => useStore((s) => s.data.clock.now)

export function useMe(): User {
  const id = useStore((s) => s.session.currentUserId)
  const users = useStore((s) => s.data.users)
  return users.find((u) => u.id === id) ?? users[0]
}
