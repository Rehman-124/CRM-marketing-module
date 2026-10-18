import { Check, Minus, ShieldCheck, Users, Building2, Eye, Pencil, Lock } from 'lucide-react'
import { Avatar, Badge, Callout, Card, CardHeader, PageHeader, PendingTag, th, td, cn } from '@/components/ui'
import { CompanyTag } from '@/components/domain'
import { useAppData, useMe } from '@/store/store'
import { useAction } from '@/store/hooks'
import { ROLE_LABEL } from '@/domain/permissions'
import { companyAgents, setMarketingAccess } from '@/domain/engine'
import type { CompanyId, Role } from '@/domain/types'

const ROLES: Role[] = ['admin', 'marketing', 'teamlead', 'agent']

const ROLE_SUMMARY: Record<Role, string[]> = {
  admin: ['Sees all six companies', 'Configures company and team mappings', 'Sets the Absent status', 'Reviews allocation and receives alerts', 'Manually assigns, unassigns and reassigns Leads', 'Oversees Marketing and Meta/CRM reports'],
  marketing: ['Manages and qualifies enquiries for assigned companies', 'Converts social enquiries to Leads', 'Views campaign funnel outcomes', 'Other companies: view-only where management permits'],
  teamlead: ['Oversees their own team', 'Receives SLA escalation where authorised', 'Helps with manual assignment and reassignment per company policy'],
  agent: ['Sets their own Available / Unavailable', 'Receives assigned Leads', 'Records first contact', 'Updates the funnel status and mandatory loss reason'],
}

type Cell = boolean | 'own' | 'policy' | 'view'
const MATRIX: { action: string; cells: Record<Role, Cell> }[] = [
  { action: 'View companies', cells: { admin: true, marketing: 'own', teamlead: 'own', agent: 'own' } },
  { action: 'View other companies', cells: { admin: true, marketing: 'view', teamlead: false, agent: false } },
  { action: 'Qualify & convert social enquiries', cells: { admin: false, marketing: 'own', teamlead: false, agent: false } },
  { action: 'View Leads', cells: { admin: true, marketing: 'own', teamlead: 'own', agent: 'own' } },
  { action: 'Assign / unassign / reassign Leads', cells: { admin: true, marketing: false, teamlead: 'policy', agent: false } },
  { action: 'Set Absent', cells: { admin: true, marketing: false, teamlead: false, agent: false } },
  { action: 'Set own Available / Unavailable', cells: { admin: false, marketing: false, teamlead: false, agent: true } },
  { action: 'Record first contact, update status & notes', cells: { admin: false, marketing: false, teamlead: false, agent: 'own' } },
  { action: 'Receive SLA alerts', cells: { admin: true, marketing: false, teamlead: 'policy', agent: false } },
  { action: 'Distribution & SLA monitoring', cells: { admin: true, marketing: false, teamlead: 'own', agent: false } },
  { action: 'Marketing & Meta reports', cells: { admin: true, marketing: 'own', teamlead: false, agent: false } },
  { action: 'Capacity, agents, integrations, access', cells: { admin: true, marketing: false, teamlead: false, agent: false } },
]

function CellIcon({ v }: { v: Cell }) {
  if (v === true) return <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200"><Check className="size-3.5" strokeWidth={2.5} /></span>
  if (v === false) return <span className="inline-flex size-6 items-center justify-center text-slate-300"><Minus className="size-4" /></span>
  const label = { own: 'Own scope', policy: 'Per policy', view: 'View only' }[v]
  return <Badge tone={v === 'view' ? 'neutral' : v === 'policy' ? 'amber' : 'brand'}>{label}</Badge>
}

export default function AccessPage() {
  const S = useAppData()
  const me = useMe()
  const act = useAction()
  const marketing = S.users.filter((u) => u.role === 'marketing')

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

  return (
    <div>
      <PageHeader title="Access & roles" description="Access depends on the user’s role and the companies they belong to. Edit and manage rights are company-scoped; management visibility is central." eyebrow={<span>P3-FR-001 · MKT-BR-003</span>} />

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
        <CardHeader icon={Lock} title="What each role can do" description="Summary of the FRD. The detailed field-level matrix lives in the shared Roles & Permissions document." actions={<PendingTag title="The field-level permission matrix is to be written in the shared Roles & Permissions document.">Field-level matrix pending</PendingTag>} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className={th}>Action</th>{ROLES.map((r) => <th key={r} className={cn(th, 'text-center')}>{ROLE_LABEL[r]}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {MATRIX.map((m) => (
                <tr key={m.action}><td className={cn(td, 'font-medium text-slate-700')}>{m.action}</td>{ROLES.map((r) => <td key={r} className={cn(td, 'text-center')}><CellIcon v={m.cells[r]} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-5 py-3 text-[12px] text-slate-500">
          Still to be confirmed: whether a Sales Agent can see teammates’ Leads (currently: own Leads only), whether one person can hold several roles, and how a Team Lead helps with agent availability. <PendingTag />
        </div>
      </Card>

      <Card className="mb-5">
        <CardHeader icon={Users} title="Marketing company assignments" description="Click to toggle. “Manage” gives edit rights; “View” gives read-only access to another company." actions={<PendingTag title="How read-only access to other companies is switched on is to be confirmed. This toggle is a placeholder mechanism.">Grant mechanism to be confirmed</PendingTag>} />
        <div className="overflow-x-auto">
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
        <div className="overflow-x-auto">
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
        <Callout tone="neutral" className="m-5">How a mid-month transfer between teams is treated is to be confirmed, so agent–team mappings are not editable in this prototype. <PendingTag /></Callout>
      </Card>
    </div>
  )
}
