// Role- and company-based access (FRD v1.4 P3-FR-001, SAL-FR-008). The field-level matrix lives in the
// shared Roles & Permissions document (not provided); this implements what v1.4 states and marks the rest.

import { findLead, findOpp } from './lookup'
import type { AppData, AppNotification, CompanyId, Enquiry, Lead, Opportunity, Permission, Role, ServiceCase, User } from './types'

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin / CRM Manager',
  manager: 'Manager',
  marketing: 'Marketing employee',
  teamlead: 'Team Lead',
  agent: 'Sales Agent',
  accounts: 'Accounts',
  processing: 'Processing',
  helpline: 'Helpline',
}

export const PERMISSION_LABEL: Record<Permission, string> = {
  reassignment: 'Reassignment',
  booking_margin_override: 'Booking Margin Override',
}
export const ALL_PERMISSIONS: Permission[] = ['reassignment', 'booking_margin_override']

/** Admin holds every permission by default; everyone else needs an explicit grant (Managers are assigned theirs). */
export function hasPermission(u: User, p: Permission): boolean {
  return u.role === 'admin' || u.permissions.includes(p)
}

export function visibleCompanies(S: AppData, u: User): CompanyId[] {
  if (u.role === 'admin') return S.companies.map((c) => c.id)
  if (u.role === 'marketing') return [...u.companyIds, ...u.viewOnlyCompanyIds.filter((c) => !u.companyIds.includes(c))]
  return u.companyIds
}

/** Companies where the user has edit/manage rights. */
export function manageableCompanies(S: AppData, u: User): CompanyId[] {
  if (u.role === 'admin') return S.companies.map((c) => c.id)
  if (u.role === 'manager' || u.role === 'marketing' || u.role === 'teamlead') return u.companyIds
  return []
}

export function isViewOnlyCompany(u: User, c: CompanyId): boolean {
  return u.role === 'marketing' && !u.companyIds.includes(c) && u.viewOnlyCompanyIds.includes(c)
}

const isMgmt = (u: User) => u.role === 'admin' || u.role === 'manager'

export function canViewLead(S: AppData, u: User, l: Lead): boolean {
  if (u.role === 'agent') return l.ownerId === u.id // AC-P3-001-6
  if (u.role === 'accounts' || u.role === 'processing' || u.role === 'helpline') return false
  return visibleCompanies(S, u).includes(l.companyId)
}

export function canViewEnquiry(S: AppData, u: User, e: Enquiry): boolean {
  return (u.role === 'admin' || u.role === 'marketing') && visibleCompanies(S, u).includes(e.companyId)
}

/** Marketing employees qualify and convert social enquiries for their assigned companies. */
export function canManageEnquiry(u: User, e: Enquiry): boolean {
  return u.role === 'marketing' && u.companyIds.includes(e.companyId)
}

/** Sales Agents update the shared funnel status of their own Leads (P2-FR-001). */
export function canEditOutcome(u: User, l: Lead): boolean {
  return u.role === 'agent' && l.ownerId === u.id
}

/** Assignment, unassignment and reassignment require the Reassignment permission, within the user's company scope (P1-FR-002). */
export function canAssign(S: AppData, u: User, companyId: CompanyId): boolean {
  return hasPermission(u, 'reassignment') && manageableCompanies(S, u).includes(companyId)
}

/** Direct phone call → entered by "the Manager or an authorised user" (P1-FR-001). */
export function canCreateManualLead(S: AppData, u: User, companyId?: CompanyId): boolean {
  if (isMgmt(u)) return companyId ? manageableCompanies(S, u).includes(companyId) : true
  if (u.role === 'marketing' && S.params.marketingCanCreateManualLeads) return companyId ? u.companyIds.includes(companyId) : u.companyIds.length > 0
  return false
}

export const canSetAbsent = (u: User) => isMgmt(u) // AC-P1-002-2, AC-P3-001-4: Manager or Admin
export const canSetOwnAvailability = (u: User, agentId: string) => u.role === 'agent' && u.id === agentId // AC-P3-001-5
export const canViewInbox = (u: User) => u.role === 'admin' || u.role === 'marketing'
/** Marketing funnel & Meta reports (P2-FR-002 actors: Marketing employee; Manager/CRM Manager). */
export const canViewReports = (u: User) => isMgmt(u) || u.role === 'marketing'
export const canViewDistribution = (S: AppData, u: User) => isMgmt(u) || (u.role === 'teamlead' && S.params.teamLeadMonitoring)
export const canViewTeam = (S: AppData, u: User) => isMgmt(u) || (u.role === 'teamlead' && S.params.teamLeadMonitoring)
/** Integrations: the Manager sees connection problems (P3-FR-002). */
export const canViewIntegrations = (u: User) => isMgmt(u)
export const canAdminister = (u: User) => u.role === 'admin'
export const canViewAudit = (u: User) => isMgmt(u)
export const canViewUnassigned = (_S: AppData, u: User) => hasPermission(u, 'reassignment') || isMgmt(u)

export function receivesNotification(S: AppData, u: User, n: AppNotification): boolean {
  if (n.toUserId) return n.toUserId === u.id
  if (n.toRole) return n.toRole === u.role && (!n.companyId || visibleCompanies(S, u).includes(n.companyId))
  // Untargeted Sales notifications are management alerts (margin override needed, invoice escalation, DigiSigner failure)
  if (n.type === 'sales') return u.role === 'admin' || (u.role === 'manager' && (!n.companyId || u.companyIds.includes(n.companyId)))
  if (u.role === 'admin') return true
  if (u.role === 'manager') return !n.companyId || u.companyIds.includes(n.companyId)
  if (u.role === 'teamlead' && n.type === 'sla') return S.params.teamLeadReceivesSla && !!n.companyId && u.companyIds.includes(n.companyId)
  return false
}

// ================================================================ Sales (SAL-FR-001, SAL-FR-008)

export function oppOwnerId(S: AppData, o: Opportunity): string | null {
  return findLead(S, o.leadId)?.ownerId ?? null
}

/** Sales Agents see only their own opportunities; Managers and Admins see those of the companies they oversee. */
export function canViewOpportunity(S: AppData, u: User, o: Opportunity): boolean {
  if (u.role === 'agent') return oppOwnerId(S, o) === u.id
  if (isMgmt(u)) return visibleCompanies(S, u).includes(o.companyId)
  return false
}

/** Only the owning Sales Agent works the opportunity (contact, tasks, qualification, quote, payment requests). */
export function canWorkOpportunity(S: AppData, u: User, o: Opportunity): boolean {
  return u.role === 'agent' && oppOwnerId(S, o) === u.id
}

export const canViewSalesReports = (u: User) => isMgmt(u) // AC-SAL-007-2
export const canDecidePayments = (u: User) => u.role === 'accounts' // AC-SAL-004-2: only Accounts confirms or rejects
export const canDecideRefunds = (u: User) => u.role === 'accounts' // AC-SAL-004-7
export const canRecordExpenses = (u: User) => u.role === 'accounts' // actual margin comes from Accounts data
export const canOverrideMargin = (u: User) => hasPermission(u, 'booking_margin_override') // AC-SAL-004-5
export const canViewCompanyInbox = (u: User) => isMgmt(u) // SAL-FR-001: Managers and Admins view all agent inboxes
export const canWorkAsProcessing = (u: User) => u.role === 'processing'
export const canViewBookings = (u: User) => isMgmt(u) || u.role === 'accounts' || u.role === 'helpline'
export const canViewCases = (u: User) => isMgmt(u) || u.role === 'processing'

export function canRequestRefund(S: AppData, u: User, o: Opportunity): boolean {
  return u.role === 'helpline' || canWorkOpportunity(S, u, o)
}

export function canViewCase(S: AppData, u: User, c: ServiceCase): boolean {
  if (u.role === 'processing') return visibleCompanies(S, u).includes(c.companyId)
  const o = findOpp(S, c.oppId)
  return !!o && canViewOpportunity(S, u, o)
}

/**
 * Sensitive applicant data (passport details, share codes, visa status) is visible only where role, company
 * and case access require it. PLACEHOLDER matrix until the Roles & Permissions document is provided:
 * the owning agent, Processing (case work) and Admin.
 */
export function canSeeSensitive(S: AppData, u: User, o: Opportunity): boolean {
  if (u.role === 'admin') return true
  if (u.role === 'processing') return visibleCompanies(S, u).includes(o.companyId) && !!o.bookingId
  return canWorkOpportunity(S, u, o)
}

/** Frontline users (agents, helpline) never get bulk download. The prototype offers no bulk download at all. */
export const FRONTLINE_ROLES: Role[] = ['agent', 'helpline']
