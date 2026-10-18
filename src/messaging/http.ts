// Live transport: talks to the Trip2Go messaging server (server/), which holds the Meta tokens.
// The browser never sees an access token.

import type { InboundEvent, SendRequest, SendResult, StatusResponse } from './contract'
import { ERROR_TEXT } from './contract'

const BASE = (import.meta.env?.VITE_MESSAGING_API as string | undefined) ?? '/api/messaging'

export async function fetchStatus(timeoutMs = 2500): Promise<StatusResponse | null> {
  try {
    const res = await fetch(`${BASE}/status`, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    const body = (await res.json()) as StatusResponse
    return body?.server === 'ok' ? body : null
  } catch {
    return null
  }
}

/**
 * The CRM user is passed in a header so the server can enforce reply permissions.
 * PLACEHOLDER: the prototype has no login. Production must replace this with a real session/JWT
 * checked by the server — a header can be forged.
 */
export async function sendLive(req: SendRequest, user: { id: string; role: string; companyIds: string[] }): Promise<SendResult> {
  try {
    const res = await fetch(`${BASE}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CRM-User': JSON.stringify({ id: user.id, role: user.role, companyIds: user.companyIds }) },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(20_000),
    })
    const body = await res.json().catch(() => null)
    if (body && typeof body.ok === 'boolean') return body as SendResult
    // A non-JSON 5xx means a proxy or gateway answered because the messaging server itself is down.
    if (res.status >= 500) return { ok: false, error: { code: 'network', message: 'The messaging server is unreachable. The message was not sent.', retryable: true } }
    return { ok: false, error: { code: 'unknown', message: `${ERROR_TEXT.unknown} (HTTP ${res.status})`, retryable: false } }
  } catch {
    return { ok: false, error: { code: 'network', message: ERROR_TEXT.network, retryable: true } }
  }
}

/** Server-sent events stream of normalised Meta webhook events. EventSource reconnects on its own. */
export function connectEvents(onEvent: (e: InboundEvent) => void, onState: (s: 'open' | 'reconnecting') => void): () => void {
  const es = new EventSource(`${BASE}/events`)
  es.onopen = () => onState('open')
  es.onerror = () => onState('reconnecting')
  es.onmessage = (m) => {
    try { onEvent(JSON.parse(m.data) as InboundEvent) } catch { /* ignore malformed event */ }
  }
  return () => es.close()
}
