import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus, Inbox } from 'lucide-react'
import { Badge, Button, Callout, Card, EmptyState, PageHeader, th, td, cn } from '@/components/ui'
import { CompanyTag, SourceBadge } from '@/components/domain'
import { AssignDialog } from '@/components/leads/LeadWidgets'
import { useAppData } from '@/store/store'
import { useScope } from '@/store/hooks'
import { companyAgents } from '@/domain/engine'
import { fmtDateTime, fmtRelative } from '@/lib/time'
import type { Lead } from '@/domain/types'

const REASON: Record<string, string> = {
  'unassigned-no-eligible': 'No eligible agent at assignment',
  'released-absent': 'Released from an Absent agent — no eligible agent',
  'manual-unassign': 'Unassigned by a manager',
}

export default function UnassignedPage() {
  const S = useAppData()
  const { companies, me } = useScope()
  const navigate = useNavigate()
  const [target, setTarget] = useState<Lead | null>(null)
  const scopedCompanies = me.role === 'teamlead' ? companies.filter((c) => me.companyIds.includes(c)) : companies
  const rows = S.leads.filter((l) => !l.ownerId && scopedCompanies.includes(l.companyId)).sort((a, b) => a.createdAt - b.createdAt)

  return (
    <div>
      <PageHeader
        title="Unassigned leads"
        description="Leads the engine could not assign, Leads released from Absent agents with nobody eligible, and Leads unassigned by a manager. They stay here until a manager acts — oldest first."
        eyebrow={<span>P1-FR-002 · P3-FR-002 · MKT-BR-006</span>}
      />
      {rows.some((l) => l.companyId === 'trip2goglobal') && (
        <Callout tone="neutral" className="mb-4">Trip2GoGlobal is inactive and has no sales agents yet, so its Leads stay Unassigned.</Callout>
      )}
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={Inbox} title="No Unassigned leads" description="Every Lead in your scope has an owner." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="border-b border-slate-100 bg-slate-50/60"><tr><th className={th}>Lead</th><th className={th}>Company</th><th className={th}>Source</th><th className={th}>Why unassigned</th><th className={th}>Waiting</th><th className={cn(th, "relative")}><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((l) => {
                  const lastKind = l.ownershipHistory.at(-1)?.kind ?? 'unassigned-no-eligible'
                  const noAgents = companyAgents(S, l.companyId).length === 0
                  return (
                    <tr key={l.id} className="hover:bg-slate-50/60">
                      <td className={cn(td, 'cursor-pointer')} onClick={() => navigate(`/leads/${l.id}`)}>
                        <p className="font-medium text-slate-900">{l.fields.fullName}</p>
                        <p className="font-mono text-[11.5px] text-slate-400">{l.ref}</p>
                      </td>
                      <td className={td}><CompanyTag id={l.companyId} /></td>
                      <td className={td}><SourceBadge source={l.source} /></td>
                      <td className={td}>{noAgents ? <Badge tone="neutral">Company has no agents</Badge> : <span className="text-[12.5px] text-slate-600">{REASON[lastKind] ?? 'Unassigned'}</span>}</td>
                      <td className={td}><span className="text-[12.5px] text-slate-500" title={fmtDateTime(l.createdAt)}>{fmtRelative(l.createdAt, S.clock.now)}</span></td>
                      <td className={cn(td, 'text-right')}><Button size="sm" variant="primary" icon={UserPlus} disabled={noAgents} onClick={() => setTarget(l)}>Assign</Button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {target && <AssignDialog lead={S.leads.find((l) => l.id === target.id)!} open onClose={() => setTarget(null)} />}
    </div>
  )
}
