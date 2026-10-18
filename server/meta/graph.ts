// Meta Graph API client for sending replies. Tokens stay on the server.
//  dm            POST /{page-id}/messages  { recipient: { id }, messaging_type: 'RESPONSE', message: { text } }
//  private-reply POST /{page-id}/messages  { recipient: { comment_id }, message: { text } }
//  public-reply  POST /{comment-id}/comments (Facebook) or /{comment-id}/replies (Instagram)  { message }
// Instagram messaging uses the same Page endpoint with the Page token (Instagram Messaging via the Messenger Platform).

import type { MessagingError, SendRequest, SendResult } from '../../src/messaging/contract.ts'
import { ERROR_TEXT } from '../../src/messaging/contract.ts'
import type { Config, MetaAccount } from '../config.ts'

type Fetch = typeof fetch

export interface GraphOptions {
  fetch?: Fetch
  /** Delays before retrying network errors / 5xx responses. Rate limits and 4xx are not retried. */
  backoffMs?: number[]
}

export function buildRequest(cfg: Config, acc: MetaAccount, req: SendRequest): { url: string; body: unknown } {
  const v = `${cfg.graphBase}/${cfg.graphVersion}`
  if (req.kind === 'dm') return { url: `${v}/${acc.pageId}/messages`, body: { recipient: { id: req.recipientId }, messaging_type: 'RESPONSE', message: { text: req.text } } }
  if (req.kind === 'private-reply') return { url: `${v}/${acc.pageId}/messages`, body: { recipient: { comment_id: req.commentId }, message: { text: req.text } } }
  const edge = req.channel === 'instagram' ? 'replies' : 'comments'
  return { url: `${v}/${req.commentId}/${edge}`, body: { message: req.text } }
}

/** Minutes until access is regained, from Meta's business use case usage header, as seconds. */
function retryAfterFrom(headers: Headers): number | undefined {
  const raw = headers.get('x-business-use-case-usage') ?? headers.get('x-app-usage')
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    const usages = Object.values(parsed).flat() as { estimated_time_to_regain_access?: number }[]
    const mins = Math.max(0, ...usages.map((u) => Number(u?.estimated_time_to_regain_access ?? 0)))
    return mins > 0 ? mins * 60 : undefined
  } catch {
    return undefined
  }
}

/** Map a Graph API error to a CRM messaging error. */
export function mapGraphError(status: number, body: any, headers: Headers): MessagingError { // eslint-disable-line @typescript-eslint/no-explicit-any
  const err = body?.error ?? {}
  const code = Number(err.code)
  const sub = Number(err.error_subcode)
  const trace = err.fbtrace_id ? ` (Meta trace ${err.fbtrace_id})` : ''
  // For codes we don't map specifically, Meta's own explanation is the most useful thing to show.
  const metaText = typeof err.message === 'string' && err.message ? ` Meta says: “${err.message}”` : ''
  const make = (c: MessagingError['code'], retryable: boolean, extra: Partial<MessagingError> = {}): MessagingError =>
    ({ code: c, message: ERROR_TEXT[c] + (c === 'unknown' || c === 'invalid_request' || c === 'permission_missing' ? metaText : '') + trace, retryable, ...extra })
  if (code === 10 && sub === 2018278) return make('outside_window', false)
  if ([4, 17, 32, 613].includes(code) || (code >= 80000 && code < 80100)) return make('rate_limited', true, { retryAfterSec: retryAfterFrom(headers) ?? 60 })
  if (code === 190 || code === 102) return make('token_invalid', false)
  if (code === 551) return make('recipient_unavailable', false)
  if (code === 10 || code === 3 || (code >= 200 && code < 300)) return make('permission_missing', false)
  if (code === 100) return make('invalid_request', false)
  if (status >= 500) return make('unknown', true)
  return make('unknown', false)
}

export async function sendToMeta(cfg: Config, acc: MetaAccount, req: SendRequest, opts: GraphOptions = {}): Promise<SendResult> {
  const doFetch = opts.fetch ?? fetch
  const backoff = opts.backoffMs ?? [500, 1500]
  const { url, body } = buildRequest(cfg, acc, req)
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${acc.pageToken}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      if (attempt < backoff.length) { await new Promise((r) => setTimeout(r, backoff[attempt])); continue }
      return { ok: false, error: { code: 'network', message: 'Couldn’t reach Meta.', retryable: true } }
    }
    const json = await res.json().catch(() => null)
    if (res.ok) {
      const externalId = json?.message_id ?? json?.id
      if (!externalId) return { ok: false, error: { code: 'unknown', message: 'Meta accepted the request but returned no message id.', retryable: false } }
      return { ok: true, externalId: String(externalId), acceptedAt: Date.now(), recipientId: json?.recipient_id ? String(json.recipient_id) : undefined }
    }
    const mapped = mapGraphError(res.status, json, res.headers)
    if (res.status >= 500 && attempt < backoff.length) { await new Promise((r) => setTimeout(r, backoff[attempt])); continue }
    return { ok: false, error: mapped }
  }
}
