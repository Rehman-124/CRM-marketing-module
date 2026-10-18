// Demo data. History is produced by running the real engine forward in simulated time,
// so fairness counts, ownership history, SLA alerts, audit log, reports and insights all agree.

import { COMPANIES, DEFAULT_PARAMS, EMPTY_FIELDS } from './constants'
import * as E from './engine'
import { refreshInsights, mulberry32 } from './insights'
import type { Ad, AppData, Campaign, CompanyId, Connection, CustomerFields, EnquiryChannel, Lead, User } from './types'
import { DAY, HOUR, MIN, fromPkt, isShiftTime, nextShiftStart, pktDayStart } from '../lib/time'

export const DATA_VERSION = 3
export const SEED_START = fromPkt(2026, 9, 1)
export const SEED_NOW = fromPkt(2026, 10, 17, 15, 10)

const AGENTS: Record<CompanyId, string[]> = {
  flightnest: ['Ali Hassan', 'Hira Naveed', 'Omar Farooq', 'Sadia Butt'],
  holidaynest: ['Kamran Javed', 'Nida Aslam', 'Saad Mirza'],
  trip2go: ['Fatima Zahid', 'Hassan Raza', 'Iqra Shah'],
  travelope: ['Danish Akhtar', 'Mehwish Anwar', 'Talha Khan'],
  schengentravel: ['Rabia Saleem', 'Waqas Ali'],
  trip2goglobal: [],
}

const TEAM_LEADS: [CompanyId, string][] = [
  ['flightnest', 'Bilal Ahmed'],
  ['holidaynest', 'Mariam Siddiqui'],
  ['trip2go', 'Usman Tariq'],
  ['travelope', 'Zara Hussain'],
  ['schengentravel', 'Faisal Iqbal'],
]

const CAMPAIGNS: Record<CompanyId, [string, string[]][]> = {
  flightnest: [['Lahore Return Flights — Autumn', ['Video · 15s fares', 'Carousel · Fare grid']], ['Umrah Flights 2027 Early Bird', ['Static · Early-bird offer', 'Video · Testimonial']]],
  holidaynest: [['Dubai Winter Sun Packages', ['Carousel · Hotels', 'Reel · 30s']], ['Turkey All-Inclusive', ['Static · Price card', 'Video · Resort tour']]],
  trip2go: [['Maldives Honeymoon Deals', ['Carousel · Resorts', 'Video · Sunset']], ['Family Summer 2027 Pre-launch', ['Static · Kids go free']]],
  travelope: [['Baku & Georgia Tours', ['Carousel · Itinerary', 'Video · Old City']], ['Thailand Island Hopping', ['Static · 10-night offer']]],
  schengentravel: [['Schengen Visa Assistance UK', ['Lead form · Visa checklist', 'Video · Explainer']], ['Europe Christmas Markets', ['Carousel · Cities']]],
  trip2goglobal: [],
}

const TRIPS: Record<CompanyId, string[]> = {
  flightnest: ['Return flight London–Lahore, 2 adults', 'Manchester–Islamabad, family of 4', 'Umrah flights, 3 adults, February', 'One-way Birmingham–Karachi'],
  holidaynest: ['Dubai 5 nights, 2 adults', 'Turkey all-inclusive, family of 5', 'Dubai New Year, 4 adults', 'Antalya 7 nights, couple'],
  trip2go: ['Maldives honeymoon, 7 nights', 'Family summer holiday, 2+2', 'Maldives water villa, 5 nights'],
  travelope: ['Baku & Tbilisi tour, 2 adults', 'Thailand 10 nights, group of 3', 'Georgia winter trip, family'],
  schengentravel: ['Schengen visa for France, 2 applicants', 'Christmas markets visa + hotel', 'Spain visa appointment, 1 applicant'],
  trip2goglobal: ['General travel enquiry'],
}

const FIRST = ['Ahmed', 'Sarah', 'Imran', 'Aisha', 'James', 'Fatima', 'Yusuf', 'Emily', 'Zainab', 'Daniel', 'Maryam', 'Adam', 'Sophie', 'Hamid', 'Amina', 'Tom', 'Khadija', 'Rehan', 'Laura', 'Asad', 'Saima', 'Michael', 'Noor', 'Tariq', 'Hannah', 'Bilal', 'Rubina', 'Chris', 'Samina', 'Arif']
const LAST = ['Khan', 'Patel', 'Hussain', 'Smith', 'Ali', 'Begum', 'Ahmed', 'Jones', 'Shah', 'Iqbal', 'Taylor', 'Malik', 'Rashid', 'Brown', 'Chaudhry', 'Akhtar', 'Williams', 'Mahmood', 'Evans', 'Qureshi']
const CITIES = ['London', 'Birmingham', 'Manchester', 'Bradford', 'Leeds', 'Glasgow', 'Luton', 'Leicester', 'Sheffield', 'Slough', 'Cardiff', 'Nottingham']
const NATIONALITIES = ['British', 'British', 'British', 'Pakistani', 'British / Pakistani', 'Indian', 'Bangladeshi', 'Irish']

const OPENERS = ['Hi, can I know more?', 'Price please', 'Is this still available?', 'Can you send details for 2 people?', 'Interested! What dates do you have?', 'How much for a family of four?', 'Do you do payment plans?', 'Info please 🙏']

export function makePerson(c: CompanyId, rnd: () => number = Math.random): CustomerFields {
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]
  const between = (a: number, b: number) => a + rnd() * (b - a)
  const first = pick(FIRST), last = pick(LAST)
  return {
    fullName: `${first} ${last}`,
    nationality: pick(NATIONALITIES),
    phone: `+44 7${Math.floor(between(100, 999))} ${Math.floor(between(100000, 999999))}`,
    email: `${first}.${last}${Math.floor(between(1, 99))}@${pick(['gmail.com', 'outlook.com', 'yahoo.co.uk', 'hotmail.co.uk'])}`.toLowerCase(),
    city: pick(CITIES),
    tripDetails: rnd() < 0.7 ? pick(TRIPS[c]) : '',
  }
}

export const SOCIAL_OPENERS = OPENERS

export function createBaseData(): AppData {
  const users: User[] = [
    { id: 'u-admin', name: 'Sana Malik', role: 'admin', title: 'CRM Manager', companyIds: COMPANIES.map((c) => c.id), viewOnlyCompanyIds: [], joinedAt: fromPkt(2026, 1, 5) },
    { id: 'u-mkt1', name: 'Hamza Qureshi', role: 'marketing', title: 'Marketing Executive', companyIds: ['flightnest', 'holidaynest', 'trip2go'], viewOnlyCompanyIds: ['travelope'], joinedAt: fromPkt(2026, 1, 5) },
    { id: 'u-mkt2', name: 'Ayesha Raza', role: 'marketing', title: 'Marketing Executive', companyIds: ['travelope', 'schengentravel', 'trip2goglobal'], viewOnlyCompanyIds: [], joinedAt: fromPkt(2026, 1, 5) },
  ]
  for (const [c, name] of TEAM_LEADS) {
    users.push({ id: `u-tl-${c}`, name, role: 'teamlead', title: 'Sales Team Lead', companyIds: [c], viewOnlyCompanyIds: [], joinedAt: fromPkt(2026, 1, 5) })
  }
  for (const c of COMPANIES) {
    AGENTS[c.id].forEach((name, i) => {
      users.push({
        id: `u-${c.id}-${i + 1}`, name, role: 'agent', title: 'Sales Agent', companyIds: [c.id], viewOnlyCompanyIds: [],
        availability: 'available', absentShiftKey: null, joinedAt: fromPkt(2026, 2, 1), rosterOrder: i + 1,
      })
    })
  }

  const campaigns: Campaign[] = []
  const ads: Ad[] = []
  for (const c of COMPANIES) {
    CAMPAIGNS[c.id].forEach(([name, adNames], i) => {
      const id = `cmp-${c.id}-${i + 1}`
      campaigns.push({ id, companyId: c.id, name })
      adNames.forEach((an, j) => ads.push({ id: `${id}-ad${j + 1}`, campaignId: id, name: an }))
    })
  }

  const connections: Connection[] = []
  for (const c of COMPANIES) {
    for (const kind of ['meta_forms', 'meta_inbox', 'meta_insights', 'website'] as const) {
      connections.push({
        id: `cn-${c.id}-${kind}`, companyId: c.id, kind,
        // Production authorisation for all six companies is still required: nothing is confirmed yet.
        state: 'pending',
        pocTested: kind !== 'website',
        lastEventAt: null, lastError: null,
      })
    }
  }

  return {
    version: DATA_VERSION,
    companies: COMPANIES.map((c) => ({ ...c })),
    users, campaigns, ads,
    leads: [], enquiries: [], assignments: [], offsets: [], tieRotation: {},
    audit: [], notifications: [], connections, externalEvents: [], failedEvents: [], insights: [],
    metaLastRefreshedAt: null, metaAvailable: true,
    params: structuredClone(DEFAULT_PARAMS),
    clock: { now: SEED_START, running: false, speed: 1 },
    seq: 100,
  }
}

type Ev = { t: number; run: (S: AppData) => void }

export function buildSeed(): AppData {
  const S = createBaseData()
  const rnd = mulberry32(20261017)
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]
  const between = (a: number, b: number) => a + rnd() * (b - a)
  const queue: Ev[] = []
  const at = (t: number, run: Ev['run']) => {
    if (t > SEED_NOW) return
    let lo = 0, hi = queue.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (queue[mid].t <= t) lo = mid + 1; else hi = mid }
    queue.splice(lo, 0, { t, run })
  }
  let extSeq = 900000

  const person = (c: CompanyId) => makePerson(c, rnd)
  const marketingFor = (c: CompanyId) => S.users.find((u) => u.role === 'marketing' && u.companyIds.includes(c))!.id

  // ----- outcome chain after a Lead is created
  const followUps = (lead: Lead, createdAt: number, forceUncontacted = false) => {
    const contactBase = isShiftTime(createdAt) ? createdAt : nextShiftStart(createdAt)
    const late = rnd() < 0.14
    const contactAt = contactBase + (late ? between(62, 105) : between(4, 50)) * MIN
    if (!forceUncontacted) {
      at(contactAt, (S) => {
        const l = S.leads.find((x) => x.id === lead.id)!
        if (!l.ownerId || l.firstContactAt) return
        E.recordFirstContact(S, l.id, l.ownerId)
        progress(l.id, S.clock.now)
      })
    }
    // A manager steps in on Leads left Unassigned (none eligible); Trip2GoGlobal has no agents.
    at(Math.max(createdAt, contactBase) + 25 * MIN, (S) => {
      const l = S.leads.find((x) => x.id === lead.id)!
      if (l.ownerId || l.companyId === 'trip2goglobal' || !isShiftTime(S.clock.now)) return
      const agents = E.companyAgents(S, l.companyId).filter((a) => !E.isAbsent(a, S.clock.now))
      if (!agents.length) return
      const target = agents.sort((a, b) => E.activeLeadCount(S, a.id) - E.activeLeadCount(S, b.id))[0]
      E.manualAssign(S, l.id, target.id, 'u-admin', 'No eligible agent at intake — assigned by Manager')
      progressAfterManual(l.id)
    })
  }
  const progressAfterManual = (leadId: string) => {
    at(S.clock.now + between(5, 40) * MIN, (S) => {
      const l = S.leads.find((x) => x.id === leadId)!
      if (!l.ownerId || l.firstContactAt) return
      E.recordFirstContact(S, l.id, l.ownerId)
      progress(l.id, S.clock.now)
    })
  }
  const note = (S: AppData, l: Lead, text: string) => { if (l.ownerId) E.addNote(S, l.id, text, l.ownerId) }
  const lossReason = () => pick(['Price too high', 'Price too high', 'Booked elsewhere', 'No response from client', 'No response from client', 'Travel plans changed', 'Visa / documents issue', 'Other'])
  const progress = (leadId: string, t: number) => {
    const r = rnd()
    if (r < 0.74) {
      at(t + between(0.2, 30) * HOUR, (S) => {
        const l = S.leads.find((x) => x.id === leadId)!
        if (!l.ownerId || l.status !== 'lead') return
        E.setStatus(S, l.id, 'mature', l.ownerId)
        note(S, l, pick(['Client engaged on WhatsApp — sent a quotation.', 'Spoke to client, shared options and prices.', 'Client replied to call-back; quotation sent by email.']))
        const r2 = rnd()
        if (r2 < 0.45) {
          at(S.clock.now + between(20, 90) * HOUR, (S) => {
            const l2 = S.leads.find((x) => x.id === leadId)!
            if (!l2.ownerId || l2.status !== 'mature') return
            E.setStatus(S, l2.id, 'hot', l2.ownerId)
            note(S, l2, pick(['Client confirmed dates, awaiting passport copies.', 'Client wants to proceed this week — holding fare.', 'Revised quote accepted in principle.']))
            const r3 = rnd()
            at(S.clock.now + between(20, 110) * HOUR, (S) => {
              const l3 = S.leads.find((x) => x.id === leadId)!
              if (!l3.ownerId || l3.status !== 'hot') return
              if (r3 < 0.55) { E.setStatus(S, l3.id, 'booked', l3.ownerId); note(S, l3, 'Booking confirmed, deposit received.') }
              else if (r3 < 0.8) E.setStatus(S, l3.id, 'lost', l3.ownerId, lossReason())
            })
          })
        } else if (r2 < 0.8) {
          at(S.clock.now + between(24, 120) * HOUR, (S) => {
            const l2 = S.leads.find((x) => x.id === leadId)!
            if (!l2.ownerId || l2.status !== 'mature') return
            E.setStatus(S, l2.id, 'lost', l2.ownerId, lossReason())
          })
        }
      })
    } else if (r < 0.86) {
      at(t + between(20, 72) * HOUR, (S) => {
        const l = S.leads.find((x) => x.id === leadId)!
        if (!l.ownerId || l.status !== 'lead') return
        E.setStatus(S, l.id, 'lost', l.ownerId, pick(['No response from client', 'No response from client', 'Travel plans changed', 'Price too high']))
      })
    }
  }

  // ----- lead intake events
  const RATES: Record<CompanyId, number> = { flightnest: 4.2, holidaynest: 3.2, trip2go: 2.6, travelope: 2.2, schengentravel: 2, trip2goglobal: 0.12 }
  for (let day = SEED_START; day <= SEED_NOW; day += DAY) {
    for (const c of COMPANIES) {
      const n = Math.round(RATES[c.id] * (0.5 + rnd()))
      for (let i = 0; i < n; i++) {
        const off = rnd() < 0.58 ? 14 * HOUR + rnd() * 8 * HOUR : (() => { const o = rnd() * 16 * HOUR; return o < 2 * HOUR ? 22 * HOUR + o : o - 2 * HOUR })()
        const t = day + off
        if (t > SEED_NOW) continue
        const recentUncontacted = SEED_NOW - t < 80 * MIN && rnd() < 0.6
        const r = rnd()
        const companyCampaigns = S.campaigns.filter((x) => x.companyId === c.id)
        if (c.id !== 'trip2goglobal' && r < 0.55) {
          // Meta Instant Form → Lead automatically, with campaign/ad where Meta provides them
          const cmp = rnd() < 0.9 && companyCampaigns.length ? pick(companyCampaigns) : null
          const ad = cmp ? pick(S.ads.filter((a) => a.campaignId === cmp.id)) : null
          const fields = person(c.id)
          at(t, (S) => {
            const res = E.receiveExternalEvent(S, c.id, { kind: 'lead', source: 'meta_form', fields, campaignId: cmp?.id ?? null, adId: ad?.id ?? null, externalId: `leadgen_${++extSeq}` })
            if (res.outcome === 'created') followUps(S.leads.find((l) => l.id === res.recordId)!, t, recentUncontacted)
          })
        } else if (r < 0.7 || c.id === 'trip2goglobal') {
          const fields = person(c.id)
          at(t, (S) => {
            const res = E.receiveExternalEvent(S, c.id, { kind: 'lead', source: 'website', fields, campaignId: null, adId: null, externalId: `web_${++extSeq}` })
            if (res.outcome === 'created') followUps(S.leads.find((l) => l.id === res.recordId)!, t, recentUncontacted)
          })
        } else if (r < 0.9) {
          // Social DM/comment → Unqualified Enquiry, converted later by Marketing
          const channel = pick<EnquiryChannel>(['facebook_dm', 'instagram_dm', 'instagram_dm', 'facebook_comment', 'instagram_comment'])
          const fields = person(c.id)
          const te = t - between(10, 150) * MIN
          let enquiryId = ''
          const cmp = companyCampaigns.length ? pick(companyCampaigns) : null
          at(Math.max(SEED_START, te), (S) => {
            const e = E.createEnquiry(S, {
              companyId: c.id, channel, handle: `@${fields.fullName.toLowerCase().replace(' ', '.')}`, text: pick(OPENERS),
              postContext: channel.endsWith('comment') && cmp ? `Comment on post: “${cmp.name}”` : undefined,
            })
            enquiryId = e.id
          })
          at(t, (S) => {
            const e = S.enquiries.find((x) => x.id === enquiryId)
            if (!e) return
            const mk = marketingFor(c.id)
            e.read = true
            e.messages.push({ from: 'marketing', text: channel.endsWith('comment') ? 'Thanks for your interest! We’ve sent you a private message to take your details.' : 'Thanks for getting in touch! Could you share your full name, nationality and best contact number?', at: S.clock.now - 6 * MIN })
            e.messages.push({ from: 'customer', text: `${fields.fullName}, ${fields.nationality}, ${fields.phone}. ${fields.tripDetails}`.trim(), at: S.clock.now - 2 * MIN })
            e.fields = { ...fields }
            const res = E.convertEnquiry(S, e.id, mk)
            if (res.ok && res.id) followUps(S.leads.find((l) => l.id === res.id)!, t, recentUncontacted)
          })
        } else {
          const fields = person(c.id)
          const source = rnd() < 0.7 ? 'phone' : 'email'
          at(t, (S) => {
            const manual = source === 'phone' && rnd() < 0.25 && isShiftTime(S.clock.now)
            const agents = E.companyAgents(S, c.id).filter((a) => E.isEffectivelyAvailable(a, S.clock.now))
            const lead = E.createLead(S, {
              companyId: c.id, source, fields,
              assignment: manual && agents.length ? { mode: 'manual', agentId: pick(agents).id } : { mode: 'auto' },
            }, source === 'phone' ? 'u-admin' : marketingFor(c.id))
            followUps(lead, t, recentUncontacted)
          })
        }
      }
    }

    // Availability changes during the shift (audit-logged)
    for (const a of S.users.filter((u) => u.role === 'agent')) {
      if (rnd() < 0.28) {
        const t0 = day + 14 * HOUR + between(0.3, 7) * HOUR
        const d = between(15, 55) * MIN
        at(t0, (S) => E.setAvailability(S, a.id, 'unavailable', a.id))
        at(t0 + d, (S) => E.setAvailability(S, a.id, 'available', a.id))
      }
    }
    // Occasional Absent marking at shift start, which releases pending off-time Leads
    if (day < pktDayStart(SEED_NOW) && rnd() < 0.12) {
      const c = pick(['flightnest', 'holidaynest', 'trip2go', 'travelope'] as CompanyId[])
      at(day + 14 * HOUR + 3 * MIN, (S) => {
        const a = pick(E.companyAgents(S, c))
        E.setAbsent(S, a.id, true, 'u-admin')
      })
    }
    // Occasional manual reassignment by a manager
    if (rnd() < 0.18) {
      const c = pick(['flightnest', 'holidaynest', 'trip2go', 'travelope', 'schengentravel'] as CompanyId[])
      at(day + 14 * HOUR + between(1, 7) * HOUR, (S) => {
        const cand = S.leads.filter((l) => l.companyId === c && l.ownerId && !l.firstContactAt)
        if (!cand.length) return
        const l = pick(cand)
        const others = E.companyAgents(S, c).filter((a) => a.id !== l.ownerId && !E.isAbsent(a, S.clock.now) && a.availability === 'available')
        if (!others.length) return
        const actor = rnd() < 0.6 ? 'u-admin' : `u-tl-${c}`
        E.manualAssign(S, l.id, pick(others).id, actor, pick(['Original owner on a long call', 'Customer asked for a Urdu speaker', 'Balancing workload', 'Owner stepped away']))
        progressAfterManual(l.id)
      })
    }
  }

  // Mid-month new agent (P1-FR-003 baseline)
  at(fromPkt(2026, 10, 10, 14, 30), (S) => { E.addAgent(S, { name: 'Noor Fatima', companyId: 'holidaynest' }, 'u-admin') })

  // Today: shift-start Absent marking, a simulated connection failure, an agent on a break, insights refresh
  at(fromPkt(2026, 10, 17, 14, 4), (S) => {
    const agents = E.companyAgents(S, 'flightnest')
    const pending = (id: string) => S.leads.filter((l) => l.ownerId === id && l.assignedInOffTime && !l.firstContactAt).length
    const target = agents.sort((a, b) => pending(b.id) - pending(a.id))[0]
    E.setAbsent(S, target.id, true, 'u-admin')
  })
  at(fromPkt(2026, 10, 17, 13, 20), (S) => E.setConnectionError(S, 'cn-trip2go-meta_forms', 'Webhook delivery failed — access token rejected (simulated)'))
  at(fromPkt(2026, 10, 17, 14, 50), (S) => E.setAvailability(S, 'u-flightnest-2', 'unavailable', 'u-flightnest-2'))
  at(fromPkt(2026, 10, 17, 14, 30), (S) => { refreshInsights(S) })
  // Trip2Go Meta form arriving while its connection is in error → flagged, not lost
  at(fromPkt(2026, 10, 17, 14, 41), (S) => {
    const cmp = S.campaigns.find((x) => x.companyId === 'trip2go')!
    const ad = S.ads.find((a) => a.campaignId === cmp.id)!
    E.receiveExternalEvent(S, 'trip2go', { kind: 'lead', source: 'meta_form', fields: person('trip2go'), campaignId: cmp.id, adId: ad.id, externalId: `leadgen_${++extSeq}` })
  })
  // Overnight Leads nobody has contacted yet: the SLA clock started at 14:00 and has now passed one hour
  for (const [c, h, m, src] of [['holidaynest', 3, 12, 'website'], ['travelope', 9, 40, 'meta_form'], ['schengentravel', 14, 38, 'meta_form']] as const) {
    at(fromPkt(2026, 10, 17, h, m), (S) => {
      const cmp = src === 'meta_form' ? S.campaigns.find((x) => x.companyId === c)! : null
      const ad = cmp ? S.ads.find((a) => a.campaignId === cmp.id)! : null
      const res = E.receiveExternalEvent(S, c, { kind: 'lead', source: src, fields: person(c), campaignId: cmp?.id ?? null, adId: ad?.id ?? null, externalId: `${src}_${++extSeq}` })
      if (res.recordId) followUps(S.leads.find((l) => l.id === res.recordId)!, S.clock.now, true)
    })
  }
  // Trip2GoGlobal has no agents yet, so its Leads stay Unassigned
  for (const [h, m] of [[11, 5], [14, 55]] as const) {
    at(fromPkt(2026, 10, 17, h, m), (S) => {
      E.receiveExternalEvent(S, 'trip2goglobal', { kind: 'lead', source: 'website', fields: person('trip2goglobal'), campaignId: null, adId: null, externalId: `web_${++extSeq}` })
    })
  }

  // Open (unconverted) social enquiries for the Marketing Inbox
  const openEnquiries: [CompanyId, EnquiryChannel, string, number, boolean][] = [
    ['flightnest', 'instagram_dm', 'Can I know more?', 22, false],
    ['flightnest', 'facebook_comment', 'Price for Lahore in December?', 48, false],
    ['holidaynest', 'facebook_dm', 'Hi, is the Dubai deal available over Christmas? Family of 4.', 75, true],
    ['holidaynest', 'instagram_comment', 'Info please 🙏', 140, true],
    ['trip2go', 'instagram_dm', 'Do you do payment plans for the Maldives?', 190, true],
    ['travelope', 'facebook_dm', 'Interested in the Baku tour, what dates?', 35, false],
    ['schengentravel', 'instagram_dm', 'Need a France visa appointment urgently', 12, false],
    ['schengentravel', 'facebook_comment', 'How long does it take?', 300, true],
  ]
  for (const [c, channel, text, minsAgo, partial] of openEnquiries) {
    at(SEED_NOW - minsAgo * MIN, (S) => {
      const fields = person(c)
      const cmp = S.campaigns.find((x) => x.companyId === c)
      const e = E.createEnquiry(S, { companyId: c, channel, handle: `@${fields.fullName.toLowerCase().replace(' ', '_')}`, text, postContext: channel.endsWith('comment') && cmp ? `Comment on post: “${cmp.name}”` : undefined })
      if (partial) {
        e.read = true
        e.messages.push({ from: 'marketing', text: 'Thanks for reaching out! Could you share your full name, nationality and a contact number?', at: S.clock.now + 4 * MIN })
        e.messages.push({ from: 'customer', text: `It's ${fields.fullName}.`, at: S.clock.now + 9 * MIN })
        e.fields = { ...EMPTY_FIELDS, fullName: fields.fullName }
      }
    })
  }

  // ----- run the simulation
  S.clock.now = SEED_START
  while (queue.length) {
    const ev = queue.shift()!
    E.advanceTo(S, ev.t)
    ev.run(S)
  }
  E.advanceTo(S, SEED_NOW)

  const todayShift = fromPkt(2026, 10, 17, 14, 0)
  for (const n of S.notifications) if (n.at < todayShift) n.read = true
  S.clock = { now: SEED_NOW, running: true, speed: 1 }
  return S
}
