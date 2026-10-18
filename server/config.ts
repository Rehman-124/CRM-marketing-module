// Messaging server configuration. Secrets come only from environment variables (see .env.example)
// and are never sent to the browser or written to logs.

import type { ChannelStatus, CompanyKey, MessagingChannel } from '../src/messaging/contract.ts'

export interface MetaAccount {
  companyId: CompanyKey
  /** Facebook Page id */
  pageId: string
  /** Long-lived Page access token (business-owned) */
  pageToken: string
  /** Instagram professional account id linked to the Page (enables Instagram) */
  igUserId?: string
}

export interface Config {
  host: string
  port: number
  appSecret: string | null
  verifyToken: string | null
  graphVersion: string
  graphBase: string
  accounts: MetaAccount[]
}

const COMPANIES: CompanyKey[] = ['flightnest', 'holidaynest', 'trip2go', 'travelope', 'schengentravel', 'trip2goglobal']

export function loadConfig(env: Record<string, string | undefined> = process.env): { config: Config; problems: string[] } {
  const problems: string[] = []
  let accounts: MetaAccount[] = []
  if (env.META_ACCOUNTS) {
    try {
      const raw = JSON.parse(env.META_ACCOUNTS) as unknown
      if (!Array.isArray(raw)) throw new Error('not an array')
      for (const [i, a] of raw.entries()) {
        const acc = a as Partial<MetaAccount>
        if (!acc.companyId || !COMPANIES.includes(acc.companyId)) { problems.push(`META_ACCOUNTS[${i}]: unknown companyId`); continue }
        if (!acc.pageId || !acc.pageToken) { problems.push(`META_ACCOUNTS[${i}] (${acc.companyId}): pageId and pageToken are required`); continue }
        accounts.push({ companyId: acc.companyId, pageId: String(acc.pageId), pageToken: String(acc.pageToken), igUserId: acc.igUserId ? String(acc.igUserId) : undefined })
      }
    } catch {
      problems.push('META_ACCOUNTS is not valid JSON')
      accounts = []
    }
  }
  return {
    config: {
      host: env.MESSAGING_HOST || '127.0.0.1',
      port: Number(env.MESSAGING_PORT || 8787),
      appSecret: env.META_APP_SECRET || null,
      verifyToken: env.META_VERIFY_TOKEN || null,
      graphVersion: env.META_GRAPH_VERSION || 'v21.0',
      graphBase: (env.META_GRAPH_BASE || 'https://graph.facebook.com').replace(/\/$/, ''),
      accounts,
    },
    problems,
  }
}

export function accountFor(cfg: Config, companyId: string): MetaAccount | undefined {
  return cfg.accounts.find((a) => a.companyId === companyId)
}

/** What is configured per company and channel — the CRM shows a channel as live only when this says so. */
export function channelStatuses(cfg: Config): ChannelStatus[] {
  const out: ChannelStatus[] = []
  for (const companyId of COMPANIES) {
    const acc = accountFor(cfg, companyId)
    for (const channel of ['messenger', 'instagram'] as MessagingChannel[]) {
      const missing: string[] = []
      if (!acc) missing.push('Page id and Page access token')
      if (channel === 'instagram' && acc && !acc.igUserId) missing.push('Linked Instagram account id')
      if (!cfg.appSecret) missing.push('App secret (webhook signature check)')
      if (!cfg.verifyToken) missing.push('Webhook verify token')
      out.push({ companyId, channel, live: missing.length === 0, missing })
    }
  }
  return out
}

export function redact(text: string, cfg: Config): string {
  let s = text
  for (const secret of [cfg.appSecret, cfg.verifyToken, ...cfg.accounts.map((a) => a.pageToken)]) if (secret) s = s.split(secret).join('[redacted]')
  return s
}
