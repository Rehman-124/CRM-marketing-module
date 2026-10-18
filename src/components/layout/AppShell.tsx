import { useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Inbox, Users2, UserPlus, ListChecks, UserX, Gauge, CalendarClock, BarChart3, PlugZap, ScrollText, ShieldCheck,
  ClipboardCheck, Bell, Menu, ChevronsUpDown, Check, Building2, FlaskConical, Moon, Sun, X, AlertTriangle, CircleCheck, Plane,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Avatar, Badge, Button, cn, SimTag } from '../ui'
import { Popover } from '../ui/overlay'
import { useAppData, useMe, useStore, useRun } from '@/store/store'
import { useAction, useScope } from '@/store/hooks'
import {
  canAdminister, canCreateManualLead, canViewDistribution, canViewInbox, canViewReports, canViewTeam, canViewUnassigned,
  receivesNotification, ROLE_LABEL, visibleCompanies, isViewOnlyCompany,
} from '@/domain/permissions'
import { companyName, isAbsent, setAvailability } from '@/domain/engine'
import { fmtDow, fmtDateShort, fmtTimeSec, isShiftTime, fmtRelative } from '@/lib/time'
import { COMPANY_COLORS } from '@/domain/constants'
import { DemoConsole } from './DemoConsole'
import type { AppData, User } from '@/domain/types'

interface NavItem { to: string; label: string; icon: LucideIcon; show: (S: AppData, u: User) => boolean; badge?: (S: AppData, u: User) => { n: number; tone: 'red' | 'brand' | 'amber' } | null }

function scopedLeads(S: AppData, u: User) {
  const vis = visibleCompanies(S, u)
  return S.leads.filter((l) => vis.includes(l.companyId) && (u.role !== 'teamlead' || u.companyIds.includes(l.companyId)))
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Marketing',
    items: [
      {
        to: '/inbox', label: 'Marketing Inbox', icon: Inbox, show: (_S, u) => canViewInbox(u),
        badge: (S, u) => { const vis = visibleCompanies(S, u); const n = S.enquiries.filter((e) => e.status === 'open' && !e.read && vis.includes(e.companyId)).length; return n ? { n, tone: 'brand' } : null },
      },
      { to: '/leads', label: 'Leads', icon: Users2, show: (_S, u) => u.role !== 'agent' },
      { to: '/leads/new', label: 'New manual lead', icon: UserPlus, show: (S, u) => canCreateManualLead(S, u) },
    ],
  },
  {
    section: 'Sales',
    items: [
      {
        to: '/my-leads', label: 'My leads', icon: ListChecks, show: (_S, u) => u.role === 'agent',
        badge: (S, u) => { const n = S.leads.filter((l) => l.ownerId === u.id && !l.firstContactAt && l.status !== 'lost' && l.status !== 'booked').length; return n ? { n, tone: 'amber' } : null },
      },
    ],
  },
  {
    section: 'Management',
    items: [
      {
        to: '/unassigned', label: 'Unassigned leads', icon: UserX, show: (S, u) => canViewUnassigned(S, u),
        badge: (S, u) => { const n = scopedLeads(S, u).filter((l) => !l.ownerId).length; return n ? { n, tone: 'amber' } : null },
      },
      {
        to: '/distribution', label: 'Distribution & SLA', icon: Gauge, show: (_S, u) => canViewDistribution(u),
        badge: (S, u) => { const n = scopedLeads(S, u).filter((l) => l.slaAlertAt && !l.firstContactAt && l.ownerId).length; return n ? { n, tone: 'red' } : null },
      },
      { to: '/team', label: 'Team & shift', icon: CalendarClock, show: (_S, u) => canViewTeam(u) },
    ],
  },
  {
    section: 'Insights',
    items: [{ to: '/reports', label: 'Reports', icon: BarChart3, show: (_S, u) => canViewReports(u) }],
  },
  {
    section: 'Administration',
    items: [
      {
        to: '/integrations', label: 'Integrations', icon: PlugZap, show: (_S, u) => canAdminister(u),
        badge: (S) => { const n = S.connections.filter((c) => c.state === 'error').length; return n ? { n, tone: 'red' } : null },
      },
      { to: '/audit', label: 'Audit log', icon: ScrollText, show: (_S, u) => canAdminister(u) },
      { to: '/access', label: 'Access & roles', icon: ShieldCheck, show: (_S, u) => canAdminister(u) },
    ],
  },
  {
    section: 'Prototype',
    items: [{ to: '/requirements', label: 'Requirements & decisions', icon: ClipboardCheck, show: () => true }],
  },
]

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const S = useAppData()
  const me = useMe()
  return (
    <div className="flex h-full flex-col bg-ink-950 text-side-text">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-900/40">
          <Plane className="size-4 -rotate-45 text-white" strokeWidth={2.2} />
        </div>
        <div className="leading-tight">
          <p className="text-[14px] font-semibold tracking-tight text-white">Trip2Go CRM</p>
          <p className="text-[11px] font-medium text-side-muted">Marketing module</p>
        </div>
      </div>
      <nav className="scroll-thin flex-1 space-y-5 overflow-y-auto px-3 py-3">
        {NAV.map((sec) => {
          const items = sec.items.filter((i) => i.show(S, me))
          if (!items.length) return null
          return (
            <div key={sec.section}>
              <p className="mb-1.5 px-2.5 text-[10.5px] font-semibold tracking-[0.08em] text-side-muted uppercase">{sec.section}</p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const b = item.badge?.(S, me)
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.to === '/leads'}
                        onClick={onNavigate}
                        className={({ isActive }) => cn(
                          'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors',
                          isActive ? 'bg-white/10 text-white' : 'text-side-text hover:bg-white/5 hover:text-white',
                        )}
                      >
                        {({ isActive }) => (
                          <>
                            <item.icon className={cn('size-[17px] shrink-0', isActive ? 'text-brand-300' : 'text-side-muted group-hover:text-side-text')} strokeWidth={1.9} />
                            <span className="flex-1 truncate">{item.label}</span>
                            {b && (
                              <span className={cn('min-w-5 rounded-full px-1.5 text-center text-[10.5px] leading-[18px] font-semibold tabular-nums',
                                b.tone === 'red' ? 'bg-rose-500 text-white' : b.tone === 'amber' ? 'bg-amber-400/90 text-amber-950' : 'bg-brand-500 text-white')}>{b.n}</span>
                            )}
                          </>
                        )}
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>
      <div className="border-t border-white/5 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <Avatar name={me.name} size="md" />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[13px] font-medium text-white">{me.name}</p>
            <p className="truncate text-[11.5px] text-side-text">{ROLE_LABEL[me.role]}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function CompanySwitcher() {
  const S = useAppData()
  const { me, visible, filter } = useScope()
  const setSession = useStore((s) => s.setSession)
  if (visible.length <= 1) {
    return visible[0] ? (
      <div className="hidden h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-medium text-slate-700 ring-1 ring-slate-200 md:flex">
        <span className="size-2 rounded-[3px]" style={{ background: COMPANY_COLORS[visible[0]] }} />
        {companyName(S, visible[0])}
      </div>
    ) : null
  }
  const label = filter === 'all' ? (me.role === 'admin' ? 'All six companies' : 'All my companies') : companyName(S, filter)
  return (
    <Popover
      align="left"
      width="w-64"
      trigger={({ toggle }) => (
        <button onClick={toggle} className="flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-[13px] font-medium text-slate-700 shadow-xs ring-1 ring-slate-200 transition hover:bg-slate-50">
          {filter === 'all' ? <Building2 className="size-4 text-slate-400" /> : <span className="size-2 rounded-[3px]" style={{ background: COMPANY_COLORS[filter] }} />}
          <span className="hidden max-w-36 truncate sm:inline">{label}</span>
          <ChevronsUpDown className="size-3.5 text-slate-400" />
        </button>
      )}
    >
      {(close) => (
        <div className="p-1.5">
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">Company</p>
          {(['all', ...visible] as const).map((c) => {
            const active = filter === c
            const company = c === 'all' ? null : S.companies.find((x) => x.id === c)!
            return (
              <button key={c} onClick={() => { setSession({ companyFilter: c }); close() }} className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-slate-50', active && 'bg-slate-50')}>
                {company ? <span className="size-2 rounded-[3px]" style={{ background: COMPANY_COLORS[company.id] }} /> : <Building2 className="size-3.5 text-slate-400" />}
                <span className="flex-1 font-medium text-slate-700">{company ? company.name : me.role === 'admin' ? 'All six companies' : 'All my companies'}</span>
                {company && !company.active && <Badge tone="neutral">Inactive</Badge>}
                {company && isViewOnlyCompany(me, company.id) && <Badge tone="neutral">View only</Badge>}
                {active && <Check className="size-4 text-brand-600" />}
              </button>
            )
          })}
        </div>
      )}
    </Popover>
  )
}

function ClockBadge({ onOpen }: { onOpen: () => void }) {
  const now = useStore((s) => s.data.clock.now)
  const running = useStore((s) => s.data.clock.running)
  const speed = useStore((s) => s.data.clock.speed)
  const shift = isShiftTime(now)
  return (
    <button onClick={onOpen} title="Simulated clock — open the demo console" className="flex h-9 items-center gap-2.5 rounded-lg bg-white px-2.5 text-[12.5px] shadow-xs ring-1 ring-slate-200 transition hover:bg-slate-50">
      <span className={cn('flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold', shift ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700')}>
        {shift ? <Sun className="size-3" /> : <Moon className="size-3" />}
        <span className="hidden sm:inline">{shift ? 'Shift' : 'Off-time'}</span>
      </span>
      <span className="hidden font-medium text-slate-500 md:inline">{fmtDow(now)} {fmtDateShort(now)}</span>
      <span className="font-semibold text-slate-800 tabular-nums">{fmtTimeSec(now)}</span>
      <span className="hidden text-[11px] font-medium text-slate-400 xl:inline">PKT{running ? (speed > 1 ? ` · ${speed}×` : '') : ' · paused'}</span>
    </button>
  )
}

function AvailabilityToggle() {
  const me = useMe()
  const now = useStore((s) => s.data.clock.now)
  const act = useAction()
  if (me.role !== 'agent') return null
  const absent = isAbsent(me, now)
  if (absent) return <Badge tone="red" dot className="h-7 px-2">Marked Absent by Manager</Badge>
  const avail = me.availability === 'available'
  return (
    <div className="flex h-9 items-center rounded-lg bg-slate-100 p-0.5 ring-1 ring-slate-200/70 ring-inset" role="radiogroup" aria-label="My availability">
      {(['available', 'unavailable'] as const).map((v) => (
        <button
          key={v}
          role="radio"
          aria-checked={me.availability === v}
          onClick={() => act((d) => setAvailability(d, me.id, v, me.id), v === 'available' ? 'You are Available' : 'You are Unavailable', v === 'available' ? 'You can receive live Leads. Your SLA timers resume.' : 'You will not receive new Leads. Your SLA timers are paused.')}
          className={cn('flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition', me.availability === v ? 'bg-white shadow-xs ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800',
            me.availability === v && (v === 'available' ? 'text-emerald-700' : 'text-amber-700'))}
        >
          <span className={cn('size-2 rounded-full', v === 'available' ? 'bg-emerald-500' : 'bg-amber-500', me.availability !== v && 'opacity-40')} />
          <span className="hidden sm:inline">{v === 'available' ? 'Available' : 'Unavailable'}</span>
        </button>
      ))}
      {!avail && <span className="sr-only">Unavailable</span>}
    </div>
  )
}

function Notifications() {
  const S = useAppData()
  const me = useMe()
  const run = useRun()
  const navigate = useNavigate()
  const items = S.notifications.filter((n) => receivesNotification(S, me, n)).slice(-40).reverse()
  const unread = items.filter((n) => !n.read).length
  if (me.role !== 'admin' && me.role !== 'teamlead') return null
  const icon = { sla: AlertTriangle, 'no-eligible': UserX, integration: PlugZap, 'shift-start': CalendarClock }
  const color = { sla: 'text-rose-500 bg-rose-50', 'no-eligible': 'text-amber-600 bg-amber-50', integration: 'text-rose-500 bg-rose-50', 'shift-start': 'text-brand-600 bg-brand-50' }
  return (
    <Popover
      width="w-[380px]"
      trigger={({ toggle }) => (
        <button onClick={toggle} aria-label={unread ? `${unread} unread notifications` : 'Notifications'} className="relative flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
          <Bell className="size-[18px]" strokeWidth={1.8} />
          {unread > 0 && <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] leading-4 font-bold text-white ring-2 ring-white">{unread}</span>}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-[13.5px] font-semibold text-slate-900">Alerts</p>
              <p className="text-[11.5px] text-slate-500">In-app delivery · email delivery is a pending decision</p>
            </div>
            <Button size="xs" variant="ghost" onClick={() => run((d) => { for (const n of d.notifications) if (receivesNotification(d, me, n)) n.read = true })}>Mark all read</Button>
          </div>
          <div className="scroll-thin max-h-[420px] overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-10 text-center text-[13px] text-slate-500">No alerts</p>}
            {items.map((n) => {
              const Icon = icon[n.type]
              return (
                <button
                  key={n.id}
                  onClick={() => { run((d) => { const x = d.notifications.find((y) => y.id === n.id); if (x) x.read = true }); close(); if (n.leadId) navigate(`/leads/${n.leadId}`); else if (n.type === 'integration') navigate('/integrations'); else if (n.type === 'shift-start') navigate('/team') }}
                  className={cn('flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50', !n.read && 'bg-brand-50/40')}
                >
                  <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg', color[n.type])}><Icon className="size-3.5" strokeWidth={2.2} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={cn('truncate text-[13px] font-semibold', n.cleared ? 'text-slate-500' : 'text-slate-900')}>{n.title}</span>
                      {n.cleared && <Badge tone="green" icon={CircleCheck}>Cleared</Badge>}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[12px] text-slate-500">{n.body}</span>
                    <span className="mt-1 block text-[11px] text-slate-400">{fmtRelative(n.at, S.clock.now)}{n.companyId ? ` · ${companyName(S, n.companyId)}` : ''}</span>
                  </span>
                  {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </Popover>
  )
}

function UserSwitcher() {
  const S = useAppData()
  const me = useMe()
  const setSession = useStore((s) => s.setSession)
  const navigate = useNavigate()
  const groups: User['role'][] = ['admin', 'marketing', 'teamlead', 'agent']
  return (
    <Popover
      width="w-80"
      trigger={({ toggle }) => (
        <button onClick={toggle} className="flex h-9 items-center gap-2 rounded-lg py-1 pr-2 pl-1 transition hover:bg-slate-100" title="Demo: switch user / role">
          <Avatar name={me.name} size="sm" />
          <span className="hidden text-left leading-tight xl:block">
            <span className="block text-[12.5px] font-semibold text-slate-800">{me.name}</span>
            <span className="block text-[11px] text-slate-500">{ROLE_LABEL[me.role]}</span>
          </span>
          <ChevronsUpDown className="size-3.5 text-slate-400" />
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="text-[12.5px] font-semibold text-slate-800">View the CRM as…</p>
            <SimTag>Demo switch</SimTag>
          </div>
          <div className="scroll-thin max-h-[440px] overflow-y-auto p-1.5">
            {groups.map((g) => (
              <div key={g} className="mb-1">
                <p className="px-2.5 pt-2 pb-1 text-[10.5px] font-semibold tracking-wide text-slate-400 uppercase">{ROLE_LABEL[g]}</p>
                {S.users.filter((u) => u.role === g).map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { setSession({ currentUserId: u.id, companyFilter: 'all' }); close(); navigate('/') }}
                    className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-50', u.id === me.id && 'bg-brand-50/60')}
                  >
                    <Avatar name={u.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-slate-800">{u.name}</span>
                      <span className="block truncate text-[11px] text-slate-500">{u.role === 'admin' ? 'All companies' : u.companyIds.map((c) => companyName(S, c)).join(', ')}</span>
                    </span>
                    {u.id === me.id && <Check className="size-4 text-brand-600" />}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </Popover>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNav, setMobileNav] = useState(false)
  const [consoleOpen, setConsoleOpen] = useState(false)
  const location = useLocation()
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] lg:block"><Sidebar /></aside>
      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="anim-fade absolute inset-0 bg-slate-900/50" onClick={() => setMobileNav(false)} />
          <div className="anim-slide absolute inset-y-0 left-0 w-[264px] shadow-2xl">
            <Sidebar onNavigate={() => setMobileNav(false)} />
            <button onClick={() => setMobileNav(false)} className="absolute top-4 -right-11 rounded-lg bg-white/10 p-2 text-white" aria-label="Close menu"><X className="size-4" /></button>
          </div>
        </div>
      )}
      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
          <div className="flex h-16 items-center gap-1.5 px-3 sm:gap-3 sm:px-6">
            <button className="-ml-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu className="size-5" /></button>
            <CompanySwitcher />
            <div className="flex-1" />
            <ClockBadge onOpen={() => setConsoleOpen(true)} />
            <AvailabilityToggle />
            <Button variant="secondary" size="md" icon={FlaskConical} onClick={() => setConsoleOpen(true)} className="hidden xl:inline-flex">Demo console</Button>
            <Notifications />
            <div className="hidden h-6 w-px bg-slate-200 sm:block" />
            <UserSwitcher />
          </div>
        </header>
        <main key={location.pathname} className="anim-fade mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
      <DemoConsole open={consoleOpen} onClose={() => setConsoleOpen(false)} />
    </div>
  )
}
