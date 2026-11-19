import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AppShell } from './components/layout/AppShell'
import { Toaster } from './components/ui/overlay'
import { useAppData, useMe, useStore } from './store/store'
import type { AppData, Role, User } from './domain/types'
import {
  canAdminister, canCreateManualLead, canViewAudit, canViewBookings, canViewCases, canViewCompanyInbox, canViewDistribution, canViewInbox, canViewIntegrations,
  canViewReports, canViewSalesReports, canViewTeam, canViewUnassigned,
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
import SalesWorkspacePage from './pages/sales/Workspace'
import OpportunitiesPage from './pages/sales/Opportunities'
import OpportunityDetailPage from './pages/sales/OpportunityDetail'
import ConversationsPage from './pages/sales/Conversations'
import AccountsPage from './pages/sales/Accounts'
import BookingsPage from './pages/sales/Bookings'
import InvoicesPage from './pages/sales/Invoices'
import CasesPage, { CaseDetailPage } from './pages/sales/Cases'
import SalesReportsPage from './pages/sales/SalesReports'
import SalesSettingsPage from './pages/sales/SalesSettings'

function Guard({ allow, children, message }: { allow: (S: AppData, u: User) => boolean; children: ReactNode; message?: string }) {
  // Subscribes to a single yes/no so the clock ticking does not re-render the guarded page.
  const ok = useStore((s) => { const me = s.data.users.find((u) => u.id === s.session.currentUserId) ?? s.data.users[0]; return allow(s.data, me) })
  return ok ? <>{children}</> : <PermissionDenied message={message} />
}

const isMgmt = (u: User) => u.role === 'admin' || u.role === 'manager'

function Home() {
  const S = useAppData()
  const me = useMe()
  const to: Record<Role, string> = {
    admin: '/distribution', manager: '/distribution', marketing: '/inbox', teamlead: S.params.teamLeadMonitoring ? '/distribution' : '/leads',
    agent: '/sales', accounts: '/sales/accounts', processing: '/sales/cases', helpline: '/sales/bookings',
  }
  return <Navigate to={to[me.role]} replace />
}

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Home />} />
        {/* Marketing */}
        <Route path="/inbox" element={<Guard allow={(_S, u) => canViewInbox(u)}><InboxPage /></Guard>} />
        <Route path="/inbox/:id" element={<Guard allow={(_S, u) => canViewInbox(u)}><InboxPage /></Guard>} />
        <Route path="/leads" element={<Guard allow={(_S, u) => ['admin', 'manager', 'marketing', 'teamlead'].includes(u.role)}><LeadsPage /></Guard>} />
        <Route path="/leads/new" element={<Guard allow={(S, u) => canCreateManualLead(S, u)}><NewLeadPage /></Guard>} />
        <Route path="/leads/:id" element={<LeadDetailPage />} />
        <Route path="/my-leads" element={<Guard allow={(_S, u) => u.role === 'agent'}><MyLeadsPage /></Guard>} />
        <Route path="/unassigned" element={<Guard allow={(S, u) => canViewUnassigned(S, u)}><UnassignedPage /></Guard>} />
        <Route path="/distribution" element={<Guard allow={(S, u) => canViewDistribution(S, u)}><DistributionPage /></Guard>} />
        <Route path="/team" element={<Guard allow={(S, u) => canViewTeam(S, u)}><TeamPage /></Guard>} />
        <Route path="/reports" element={<Guard allow={(_S, u) => canViewReports(u)}><ReportsPage /></Guard>} />
        {/* Sales */}
        <Route path="/sales" element={<Guard allow={(_S, u) => u.role === 'agent'} message="The Sales workspace shows a Sales Agent’s own work."><SalesWorkspacePage /></Guard>} />
        <Route path="/sales/opportunities" element={<Guard allow={(_S, u) => u.role === 'agent' || isMgmt(u)}><OpportunitiesPage /></Guard>} />
        <Route path="/sales/opportunities/:id" element={<OpportunityDetailPage />} />
        <Route path="/sales/inbox" element={<Guard allow={(_S, u) => u.role === 'agent' || canViewCompanyInbox(u)}><ConversationsPage /></Guard>} />
        <Route path="/sales/inbox/:id" element={<Guard allow={(_S, u) => u.role === 'agent' || canViewCompanyInbox(u)}><ConversationsPage /></Guard>} />
        <Route path="/sales/accounts" element={<Guard allow={(_S, u) => u.role === 'accounts'} message="Only Accounts confirms or rejects payments and decides refunds (SAL-FR-004)."><AccountsPage /></Guard>} />
        <Route path="/sales/bookings" element={<Guard allow={(_S, u) => canViewBookings(u)}><BookingsPage /></Guard>} />
        <Route path="/sales/invoices" element={<Guard allow={(_S, u) => u.role === 'agent' || isMgmt(u)}><InvoicesPage /></Guard>} />
        <Route path="/sales/cases" element={<Guard allow={(_S, u) => canViewCases(u)}><CasesPage /></Guard>} />
        <Route path="/sales/cases/:id" element={<CaseDetailPage />} />
        <Route path="/sales/reports" element={<Guard allow={(_S, u) => canViewSalesReports(u)} message="Sales performance reports are visible only to Managers and Admins (AC-SAL-007-2)."><SalesReportsPage /></Guard>} />
        <Route path="/sales/settings" element={<Guard allow={(_S, u) => canAdminister(u)}><SalesSettingsPage /></Guard>} />
        {/* Administration */}
        <Route path="/integrations" element={<Guard allow={(_S, u) => canViewIntegrations(u)}><IntegrationsPage /></Guard>} />
        <Route path="/audit" element={<Guard allow={(_S, u) => canViewAudit(u)}><AuditPage /></Guard>} />
        <Route path="/access" element={<Guard allow={(_S, u) => canAdminister(u)}><AccessPage /></Guard>} />
        <Route path="/requirements" element={<RequirementsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </AppShell>
  )
}
