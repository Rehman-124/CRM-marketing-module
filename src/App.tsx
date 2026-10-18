import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AppShell } from './components/layout/AppShell'
import { Toaster } from './components/ui/overlay'
import { useAppData, useMe } from './store/store'
import type { AppData, User } from './domain/types'
import {
  canAdminister, canCreateManualLead, canViewDistribution, canViewInbox, canViewReports, canViewTeam, canViewUnassigned,
} from './domain/permissions'
import { PermissionDenied, NotFound } from './pages/Errors'
import InboxPage from './pages/Inbox'
import LeadsPage from './pages/Leads'
import LeadDetailPage from './pages/LeadDetail'
import NewLeadPage from './pages/NewLead'
import MyLeadsPage from './pages/MyLeads'
import UnassignedPage from './pages/Unassigned'
import DistributionPage from './pages/Distribution'
import TeamPage from './pages/Team'
import ReportsPage from './pages/Reports'
import IntegrationsPage from './pages/Integrations'
import AuditPage from './pages/Audit'
import AccessPage from './pages/Access'
import RequirementsPage from './pages/Requirements'

function Guard({ allow, children }: { allow: (S: AppData, u: User) => boolean; children: ReactNode }) {
  const S = useAppData()
  const me = useMe()
  return allow(S, me) ? <>{children}</> : <PermissionDenied />
}

function Home() {
  const me = useMe()
  const to = { admin: '/distribution', marketing: '/inbox', teamlead: '/distribution', agent: '/my-leads' }[me.role]
  return <Navigate to={to} replace />
}

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/inbox" element={<Guard allow={(_S, u) => canViewInbox(u)}><InboxPage /></Guard>} />
        <Route path="/inbox/:id" element={<Guard allow={(_S, u) => canViewInbox(u)}><InboxPage /></Guard>} />
        <Route path="/leads" element={<Guard allow={(_S, u) => u.role !== 'agent'}><LeadsPage /></Guard>} />
        <Route path="/leads/new" element={<Guard allow={(S, u) => canCreateManualLead(S, u)}><NewLeadPage /></Guard>} />
        <Route path="/leads/:id" element={<LeadDetailPage />} />
        <Route path="/my-leads" element={<Guard allow={(_S, u) => u.role === 'agent'}><MyLeadsPage /></Guard>} />
        <Route path="/unassigned" element={<Guard allow={(S, u) => canViewUnassigned(S, u)}><UnassignedPage /></Guard>} />
        <Route path="/distribution" element={<Guard allow={(_S, u) => canViewDistribution(u)}><DistributionPage /></Guard>} />
        <Route path="/team" element={<Guard allow={(_S, u) => canViewTeam(u)}><TeamPage /></Guard>} />
        <Route path="/reports" element={<Guard allow={(_S, u) => canViewReports(u)}><ReportsPage /></Guard>} />
        <Route path="/integrations" element={<Guard allow={(_S, u) => canAdminister(u)}><IntegrationsPage /></Guard>} />
        <Route path="/audit" element={<Guard allow={(_S, u) => canAdminister(u)}><AuditPage /></Guard>} />
        <Route path="/access" element={<Guard allow={(_S, u) => canAdminister(u)}><AccessPage /></Guard>} />
        <Route path="/requirements" element={<RequirementsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </AppShell>
  )
}
