// Role- and company-based access (P3-FR-001). The field-level matrix lives in the
// shared Roles & Permissions document (pending); this implements what the FRD states.

import type { AppData, AppNotification, CompanyId, Enquiry, Lead, User } from './types'

export function visibleCompanies(S: AppData, u: User): CompanyId[] {
  if (u.role === 'admin') return S.companies.map((c) => c.id)
  if (u.role === 'marketing') return [...u.companyIds, ...u.viewOnlyCompanyIds.filter((c) => !u.companyIds.includes(c))]
  return u.companyIds
}

/** Companies where the user has edit/manage rights. */
export function manageableCompanies(S: AppData, u: User): CompanyId[] {
  if (u.role === 'admin') return S.companies.map((c) => c.id)
  if (u.role === 'marketing' || u.role === 'teamlead') return u.companyIds
  return []
}

export function isViewOnlyCompany(u: User, c: CompanyId): boolean {
  return u.role === 'marketing' && !u.companyIds.includes(c) && u.viewOnlyCompanyIds.includes(c)
}

export function canViewLead(S: AppData, u: User, l: Lead): boolean {
  if (u.role === 'agent') return l.ownerId === u.id // AC-P3-001-6
  return visibleCompanies(S, u).includes(l.companyId)
}

export function canViewEnquiry(S: AppData, u: User, e: Enquiry): boolean {
  return (u.role === 'admin' || u.role === 'marketing') && visibleCompanies(S, u).includes(e.companyId)
}

/** Marketing employees qualify and convert social enquiries for their assigned companies. */
export function canManageEnquiry(u: User, e: Enquiry): boolean {
  return u.role === 'marketing' && u.companyIds.includes(e.companyId)
}

export function canEditOutcome(u: User, l: Lead): boolean {
  return u.role === 'agent' && l.ownerId === u.id
}

export function canAssign(S: AppData, u: User, companyId: CompanyId): boolean {
  if (u.role === 'admin') return true
  return u.role === 'teamlead' && S.params.teamLeadCanAssign && u.companyIds.includes(companyId)
}

export function canCreateManualLead(S: AppData, u: User, companyId?: CompanyId): boolean {
  if (u.role === 'admin') return true
  if (u.role === 'marketing' && S.params.marketingCanCreateManualLeads) return companyId ? u.companyIds.includes(companyId) : u.companyIds.length > 0
  return false
}

export const canSetAbsent = (u: User) => u.role === 'admin' // AC-P3-001-4
export const canSetOwnAvailability = (u: User, agentId: string) => u.role === 'agent' && u.id === agentId // AC-P3-001-5
export const canViewInbox = (u: User) => u.role === 'admin' || u.role === 'marketing'
export const canViewReports = (u: User) => u.role === 'admin' || u.role === 'marketing'
export const canViewDistribution = (u: User) => u.role === 'admin' || u.role === 'teamlead'
export const canViewTeam = (u: User) => u.role === 'admin' || u.role === 'teamlead'
export const canAdminister = (u: User) => u.role === 'admin'
export const canViewUnassigned = (S: AppData, u: User) => u.role === 'admin' || (u.role === 'teamlead' && S.params.teamLeadCanAssign)

export function receivesNotification(S: AppData, u: User, n: AppNotification): boolean {
  if (u.role === 'admin') return true
  if (u.role === 'teamlead' && n.type === 'sla') return S.params.teamLeadReceivesSla && !!n.companyId && u.companyIds.includes(n.companyId)
  return false
}

export const ROLE_LABEL: Record<User['role'], string> = {
  admin: 'Admin / CRM Manager',
  marketing: 'Marketing employee',
  teamlead: 'Team Lead',
  agent: 'Sales Agent',
}
