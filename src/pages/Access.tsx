import { Check, Minus, ShieldCheck, Users, Building2, Eye, Pencil, Lock, KeyRound, FileLock2 } from 'lucide-react'
import { Avatar, Badge, Callout, Card, CardHeader, PageHeader, PendingTag, Switch, th, td, cn } from '@/components/ui'
import { CompanyTag } from '@/components/domain'
import { useCalmData, useMe } from '@/store/store'
import { useAction } from '@/store/hooks'
import { ALL_PERMISSIONS, hasPermission, PERMISSION_LABEL, ROLE_LABEL } from '@/domain/permissions'
import { companyAgents, setMarketingAccess, setPermissions } from '@/domain/engine'
import type { CompanyId, Permission, Role } from '@/domain/types'

const ROLES: Role[] = ['admin', 'manager', 'marketing', 'teamlead', 'agent', 'accounts', 'processing', 'helpline']

/** What v1.4 states for each role (P3-FR-001, SAL-FR-001 … SAL-FR-008). */
const ROLE_SUMMARY: Record<Role, string[]> = {
  admin: ['Sees all six companies', 'Configures company and team mappings', 'Sets Absent; reviews allocation; receives alerts', 'Holds every permission by default (Reassignment, Booking Margin Override)', 'Oversees Marketing, Meta/CRM and Sales reports'],
  manager: ['Sees all companies through the company switcher', 'Sets Absent; receives SLA and Sales alerts', 'Is assigned Reassignment and Booking Margin Override', 'Views all agent inboxes in scope', 'Opens Sales performance reports'],
  marketing: ['Manages and qualifies enquiries for assigned companies', 'Converts social enquiries to Leads', 'Views campaign funnel outcomes', 'No private Sales performance, margin, refund or commission data', 'Other companies: view-only where management permits'],
  teamlead: ['Oversees their own team (where authorised)', 'Receives SLA escalation where authorised', 'No Reassignment or override permission by default'],
  agent: ['Sets own Available / Unavailable', 'Sees only own Leads, opportunities and conversations', 'Records contact, tasks, qualification, quote, payment requests', 'Updates the shared funnel status and loss reason'],
  accounts: ['Only role that confirms or rejects payments', 'Decides refunds', 'Records actual expenses (actual margin)'],
  processing: ['Fulfilment Owner of the Service/Visa Case', 'Records visa options and books the appointment', 'Owns cost items of the checklist; records Granted / Refused'],
  helpline: ['Submits Refund Requests linked to the Booking and case', 'Views bookings (placeholder scope)'],
}

type Cell = boolean | 'own' | 'policy' | 'view' | 'perm' | 'placeholder'
const MATRIX: { action: string; cells: Partial<Record<Role, Cell>> }[] = [
  { action: 'View companies', cells: { admin: true, manager: true, marketing: 'own', teamlead: 'own', agent: 'own', accounts: 'placeholder', processing: 'placeholder', helpline: 'placeholder' } },
  { action: 'View other companies', cells: { admin: true, manager: true, marketing: 'view' } },
  { action: 'Qualify & convert social enquiries', cells: { marketing: 'own' } },
  { action: 'View Leads', cells: { admin: true, manager: true, marketing: 'own', teamlead: 'own', agent: 'own' } },
  { action: 'Assign / unassign / reassign (Reassignment permission)', cells: { admin: true, manager: 'perm', teamlead: 'perm' } },
  { action: 'Set Absent', cells: { admin: true, manager: true } },
  { action: 'Set own Available / Unavailable', cells: { agent: true } },
  { action: 'Work opportunities (contact, quote, payment request)', cells: { agent: 'own' } },
  { action: 'View agent inboxes / conversations', cells: { admin: true, manager: true, agent: 'own' } },
  { action: 'Confirm or reject payments', cells: { accounts: true } },
  { action: 'Override the £60 margin (Booking Margin Override)', cells: { admin: true, manager: 'perm', teamlead: 'perm' } },
  { action: 'Request a refund', cells: { agent: 'own', helpline: true } },
  { action: 'Decide refunds, record actual expenses', cells: { accounts: true } },
  { action: 'Service case: options, appointment, cost items, outcome', cells: { processing: true } },
  { action: 'Receive SLA alerts', cells: { admin: true, manager: true, teamlead: 'policy' } },
  { action: 'Distribution & SLA monitoring', cells: { admin: true, manager: true, teamlead: 'policy' } },
  { action: 'Marketing funnel & Meta reports', cells: { admin: true, manager: true, marketing: 'own' } },
  { action: 'Sales performance reports (margin, refunds)', cells: { admin: true, manager: true } },
  { action: 'Agents, integrations, Sales configuration, permissions', cells: { admin: true } },
]

function CellIcon({ v }: { v: Cell | undefined }) {
  if (v === true) return <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200"><Check className="size-3.5" strokeWidth={2.5} /></span>
  if (!v) return <span className="inline-flex size-6 items-center justify-center text-slate-300"><Minus className="size-4" /></span>
  const label = { own: 'Own scope', policy: 'Where authorised', view: 'View only', perm: 'If granted', placeholder: 'Placeholder' }[v]
  return <Badge tone={v === 'view' ? 'neutral' : v === 'policy' || v === 'placeholder' ? 'amber' : v === 'perm' ? 'violet' : 'brand'}>{label}</Badge>
}

/** SAL-FR-008 placeholder: who may see sensitive applicant data. The real matrix is in the Roles & Permissions document. */
const SENSITIVE_ROWS: [string, string][] = [
  ['Admin', 'All opportunities'],
  ['Owning Sales Agent', 'Own opportunities only'],
  ['Processing', 'Booked opportunities with a service case, in scope'],
  ['Manager, Marketing, Team Lead, Accounts, Helpline', 'Hidden (masked)'],
]

export default function AccessPage() {
  const S = useCalmData()
  const me = useMe()
  const act = useAction()
  const marketing = S.users.filter((u) => u.role === 'marketing')
  const grantable = S.users.filter((u) => u.role === 'manager' || u.role === 'teamlead')

  const toggle = (userId: string, c: CompanyId, kind: 'manage' | 'view') => {
    const u = S.users.find((x) => x.id === userId)!
    let manage = [...u.companyIds], view = [...u.viewOnlyCompanyIds]
    if (kind === 'manage') {
      manage = manage.includes(c) ? manage.filter((x) => x !== c) : [...manage, c]
      view = view.filter((x) => x !== c)
    } else {
      view = view.includes(c) ? view.filter((x) => x !== c) : [...view, c]
    }
    act((d) => setMarketingAccess(d, userId, manage, view, me.id), 'Access updated')
  }
  const togglePerm = (userId: string, p: Permission, on: boolean) => {
    const u = S.users.find((x) => x.id === userId)!
    const next = on ? [...u.permissions, p] : u.permissions.filter((x) => x !== p)
    act((d) => setPermissions(d, userId, next, me.id), on ? `${PERMISSION_LABEL[p]} granted` : `${PERMISSION_LABEL[p]} removed`, `${u.name}. Recorded in the audit log.`)
  }

  return (
    <div>
      <PageHeader title="Access, roles & permissions" description="Access depends on the user’s role and company. Reassignment and Booking Margin Override are separate permissions: Managers are assigned them, Admin holds every permission by default, Team Leads do not receive them automatically." eyebrow={<span>P3-FR-001 · SAL-FR-008</span>} />

      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ROLES.map((r) => (
          <Card key={r} className="p-4">
            <div className="flex items-center gap-2"><ShieldCheck className="size-4 text-brand-600" /><p className="text-[13.5px] font-semibold text-slate-900">{ROLE_LABEL[r]}</p></div>
            <ul className="mt-3 space-y-1.5">
              {ROLE_SUMMARY[r].map((s) => <li key={s} className="flex gap-2 text-[12.5px] text-slate-600"><Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />{s}</li>)}
            </ul>
          </Card>
        ))}
      </div>

      <Card className="mb-5">
        <CardHeader icon={KeyRound} title="Permission settings" description="Grant or remove the separate permissions. Every change is audit-logged. Admin holds both by default and cannot lose them." />
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="w-full min-w-[640px]">
            <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className={th}>User</th><th className={th}>Role</th>{ALL_PERMISSIONS.map((p) => <th key={p} className={cn(th, 'text-center')}>{PERMISSION_LABEL[p]}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="bg-slate-50/40">
                <td className={td}><span className="flex items-center gap-2.5"><Avatar name={S.users.find((u) => u.role === 'admin')!.name} size="sm" /><span className="font-medium text-slate-800">{S.users.find((u) => u.role === 'admin')!.name}</span></span></td>
                <td className={td}>{ROLE_LABEL.admin}</td>
                {ALL_PERMISSIONS.map((p) => <td key={p} className={cn(td, 'text-center')}><Badge tone="green" icon={Lock}>By default</Badge></td>)}
              </tr>
              {grantable.map((u) => (
                <tr key={u.id}>
                  <td className={td}><span className="flex items-center gap-2.5"><Avatar name={u.name} size="sm" /><span className="font-medium text-slate-800">{u.name}</span></span></td>
                  <td className={cn(td, 'text-[12.5px]')}>{ROLE_LABEL[u.role]}{u.role === 'teamlead' && <span className="text-slate-400"> · {u.companyIds.map((c) => S.companies.find((x) => x.id === c)?.name).join(', ')}</span>}</td>
                  {ALL_PERMISSIONS.map((p) => (
                    <td key={p} className={cn(td, 'text-center')}>
                      <span className="inline-flex items-center gap-2">
                        <Switch size="sm" checked={hasPermission(u, p)} onChange={(v) => togglePerm(u.id, p, v)} label={`${PERMISSION_LABEL[p]} for ${u.name}`} />
                        <span className="w-14 text-left text-[12px] text-slate-500">{hasPermission(u, p) ? 'Granted' : 'Not granted'}</span>
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-5 py-3 text-[12px] text-slate-500">
          Whether a reassignment or override needs a mandatory reason is to be confirmed — the switches are on the Requirements &amp; decisions page. <PendingTag />
        </div>
      </Card>

      <Card className="mb-5">
        <CardHeader icon={Lock} title="What each role can do" description="Summary of FRD v1.4. The detailed field-level matrix lives in the shared Roles & Permissions document, which was not provided." actions={<PendingTag title="The field-level permission matrix is in the Roles & Permissions document (not provided). Back-office company scope is a placeholder.">Field-level matrix pending</PendingTag>} />
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="w-full min-w-[1100px]">
            <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className={th}>Action</th>{ROLES.map((r) => <th key={r} className={cn(th, 'text-center')}>{ROLE_LABEL[r].replace(' / CRM Manager', '')}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {MATRIX.map((m) => (
                <tr key={m.action}><td className={cn(td, 'font-medium text-slate-700')}>{m.action}</td>{ROLES.map((r) => <td key={r} className={cn(td, 'text-center')}><CellIcon v={m.cells[r]} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-5 py-3 text-[12px] text-slate-500">
          Still to be confirmed: whether one person can hold several roles, how read-only access to other companies is switched on, what a Team Lead sees, and the company scope of Accounts, Processing and Helpline (all companies in this prototype). <PendingTag />
        </div>
      </Card>

      <Card className="mb-5">
        <CardHeader icon={FileLock2} title="Sensitive applicant data" description="Passport details, share codes and visa status are visible only where role, company and case access require it. Every view is audit-logged; files open only through a short-lived link after a permission check." actions={<PendingTag title="SAL-FR-008: the exact access matrix is in the Roles & Permissions document. This is a placeholder.">Placeholder matrix</PendingTag>} />
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="w-full min-w-[520px]">
            <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className={th}>Who</th><th className={th}>Can see sensitive data on</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {SENSITIVE_ROWS.map(([who, what]) => <tr key={who}><td className={cn(td, 'font-medium')}>{who}</td><td className={td}>{what}</td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-5 py-3 text-[12px] text-slate-500">No bulk download exists anywhere in the prototype, so frontline users (agents, helpline) cannot bulk-download sensitive files.</div>
      </Card>

      <Card className="mb-5">
        <CardHeader icon={Users} title="Marketing company assignments" description="Click to toggle. “Manage” gives edit rights; “View” gives read-only access to another company." actions={<PendingTag title="How read-only access to other companies is switched on is to be confirmed. This toggle is a placeholder mechanism.">Grant mechanism to be confirmed</PendingTag>} />
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="w-full min-w-[1180px]">
            <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className={th}>User</th>{S.companies.map((c) => <th key={c.id} className={cn(th, 'text-center')}>{c.name}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {marketing.map((u) => (
                <tr key={u.id}>
                  <td className={cn(td, 'whitespace-nowrap')}><span className="flex items-center gap-2.5"><Avatar name={u.name} size="sm" /><span><span className="block font-medium text-slate-800">{u.name}</span><span className="text-[11.5px] text-slate-500">{u.title}</span></span></span></td>
                  {S.companies.map((c) => {
                    const manage = u.companyIds.includes(c.id)
                    const view = u.viewOnlyCompanyIds.includes(c.id)
                    return (
                      <td key={c.id} className={cn(td, 'text-center')}>
                        <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
                          <button onClick={() => toggle(u.id, c.id, 'manage')} title="Manage (edit rights)" className={cn('inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium', manage ? 'bg-brand-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800')}><Pencil className="size-3" />Manage</button>
                          <button onClick={() => toggle(u.id, c.id, 'view')} disabled={manage} title="View only" className={cn('inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium disabled:opacity-40', view ? 'bg-white text-slate-800 shadow-xs ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800')}><Eye className="size-3" />View</button>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader icon={Building2} title="Companies & teams" description="Each company operates separately with its own agents, campaigns and customers. Leads are routed only within their own company." />
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="w-full min-w-[700px]">
            <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className={th}>Company</th><th className={th}>Status</th><th className={th}>Team Lead</th><th className={cn(th, 'text-right')}>Sales agents</th><th className={th}>Marketing</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {S.companies.map((c) => {
                const tl = S.users.find((u) => u.role === 'teamlead' && u.companyIds.includes(c.id))
                return (
                  <tr key={c.id}>
                    <td className={td}><CompanyTag id={c.id} /></td>
                    <td className={td}>{c.active ? <Badge tone="green" dot>Active</Badge> : <Badge tone="neutral" dot>Inactive</Badge>}</td>
                    <td className={td}>{tl?.name ?? <span className="text-slate-400">—</span>}</td>
                    <td className={cn(td, 'text-right tabular-nums')}>{companyAgents(S, c.id).length || <span className="text-slate-400">No agents yet</span>}</td>
                    <td className={cn(td, 'text-[12.5px]')}>{marketing.filter((u) => u.companyIds.includes(c.id)).map((u) => u.name).join(', ') || <span className="text-slate-400">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Callout tone="neutral" className="m-5">Moving an agent between teams is not described in v1.4, so agent–team mappings are not editable in this prototype. <PendingTag /></Callout>
      </Card>
    </div>
  )
}
