// Demo data. History is produced by running the real engine forward in simulated time,
// so fairness counts, ownership history, SLA alerts, audit log, reports and insights all agree.

import { COMPANIES, DEFAULT_PARAMS, DEFAULT_SALES_CONFIG, EMPTY_FIELDS } from './constants'
import * as E from './engine'
import * as SA from './sales'
import { refreshInsights, mulberry32 } from './insights'
import type { Ad, AppData, Campaign, CompanyId, Connection, CustomerFields, Enquiry, EnquiryChannel, Lead, MessageStatus, PreferredContact, User } from './types'
import { DAY, HOUR, MIN, fromPkt, isShiftTime, nextShiftStart, pktDayStart } from '../lib/time'

export const DATA_VERSION = 5
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
    { id: 'u-admin', name: 'Sana Malik', role: 'admin', title: 'Admin / CRM Manager', companyIds: COMPANIES.map((c) => c.id), viewOnlyCompanyIds: [], joinedAt: fromPkt(2026, 1, 5), permissions: [] },
    // v1.4: the Manager is assigned the Reassignment and Booking Margin Override permissions; sees all companies through the switcher
    { id: 'u-mgr', name: 'Imran Sheikh', role: 'manager', title: 'Sales & Marketing Manager', companyIds: COMPANIES.map((c) => c.id), viewOnlyCompanyIds: [], joinedAt: fromPkt(2026, 1, 5), permissions: ['reassignment', 'booking_margin_override'] },
    { id: 'u-mkt1', name: 'Hamza Qureshi', role: 'marketing', title: 'Marketing Executive', companyIds: ['flightnest', 'holidaynest', 'trip2go'], viewOnlyCompanyIds: ['travelope'], joinedAt: fromPkt(2026, 1, 5), permissions: [] },
    { id: 'u-mkt2', name: 'Ayesha Raza', role: 'marketing', title: 'Marketing Executive', companyIds: ['travelope', 'schengentravel', 'trip2goglobal'], viewOnlyCompanyIds: [], joinedAt: fromPkt(2026, 1, 5), permissions: [] },
    // Sales back-office roles. Their company scope is a placeholder (all companies) until the Roles & Permissions document is provided.
    { id: 'u-acc', name: 'Rizwan Haider', role: 'accounts', title: 'Accounts', companyIds: COMPANIES.map((c) => c.id), viewOnlyCompanyIds: [], joinedAt: fromPkt(2026, 1, 5), permissions: [] },
    { id: 'u-proc', name: 'Sobia Nawaz', role: 'processing', title: 'Processing (Fulfilment)', companyIds: COMPANIES.map((c) => c.id), viewOnlyCompanyIds: [], joinedAt: fromPkt(2026, 1, 5), permissions: [] },
    { id: 'u-help', name: 'Adeel Shah', role: 'helpline', title: 'Helpline', companyIds: COMPANIES.map((c) => c.id), viewOnlyCompanyIds: [], joinedAt: fromPkt(2026, 1, 5), permissions: [] },
  ]
  for (const [c, name] of TEAM_LEADS) {
    // Team Lead status does not grant reassignment or override permission by default (P3-FR-001)
    users.push({ id: `u-tl-${c}`, name, role: 'teamlead', title: 'Sales Team Lead', companyIds: [c], viewOnlyCompanyIds: [], joinedAt: fromPkt(2026, 1, 5), permissions: [] })
  }
  for (const c of COMPANIES) {
    AGENTS[c.id].forEach((name, i) => {
      users.push({
        id: `u-${c.id}-${i + 1}`, name, role: 'agent', title: 'Sales Agent', companyIds: [c.id], viewOnlyCompanyIds: [],
        availability: 'available', absentShiftKey: null, joinedAt: fromPkt(2026, 2, 1), rosterOrder: i + 1, permissions: [],
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
    messagingSim: { nextOutcome: 'success' },
    params: structuredClone(DEFAULT_PARAMS),
    opportunities: [], tasks: [], payments: [], bookings: [], refunds: [], cases: [], waThreads: [], documents: [],
    salesConfig: structuredClone(DEFAULT_SALES_CONFIG),
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
  // Seeded conversation history (simulated: none of it went through Meta)
  const out = (S: AppData, e: Enquiry, text: string, t: number, by: string, kind: 'dm' | 'private-reply' | 'public-reply' = 'dm', status: MessageStatus = 'read', via: 'crm' | 'meta' = 'crm') => {
    e.messages.push({ id: E.nextId(S, 'msg'), from: 'marketing', kind, text, at: t, byUserId: via === 'crm' ? by : undefined, via, status, externalId: `sim_mid_${S.seq}`, simulated: true })
    if (kind === 'private-reply') e.privateReplyAt = t
    e.lastActivityAt = Math.max(e.lastActivityAt, t)
  }
  const inn = (S: AppData, e: Enquiry, text: string, t: number) => {
    e.messages.push({ id: E.nextId(S, 'msg'), from: 'customer', kind: 'dm', text, at: t, externalId: `sim_mid_${S.seq}` })
    e.lastInboundDmAt = t
    e.lastActivityAt = Math.max(e.lastActivityAt, t)
  }
  const ASK = 'Thanks for getting in touch! Could you share your full name, nationality and best contact number?'
  const ASK_PRIVATE = 'Hi! Thanks for your comment — could you share your full name, nationality and best contact number so we can send you the details?'

  // ----- Sales chain after a Lead is created (SAL-FR-001 … SAL-FR-006), run through the real Sales engine
  const L = (S: AppData, id: string) => S.leads.find((x) => x.id === id)!
  const O = (S: AppData, leadId: string) => SA.oppForLead(S, leadId)!
  const PACKAGES: Record<CompanyId, string[]> = {
    flightnest: ['Pakistan visit visa service', 'Umrah visa service'],
    holidaynest: ['UAE visit visa service', 'Turkey e-visa service'],
    trip2go: ['Maldives visa service', 'Schengen family visa service'],
    travelope: ['Azerbaijan & Georgia visa service', 'Thailand visa service'],
    schengentravel: ['Schengen visa service — France', 'Schengen visa service — Spain', 'Schengen visa service — Italy'],
    trip2goglobal: ['Visa service'],
  }
  const DEST: Record<CompanyId, string[]> = {
    flightnest: ['Pakistan', 'Saudi Arabia'], holidaynest: ['United Arab Emirates', 'Türkiye'], trip2go: ['Maldives', 'France'],
    travelope: ['Azerbaijan', 'Thailand'], schengentravel: ['France', 'Spain', 'Italy'], trip2goglobal: ['France'],
  }
  const firstContact = (leadId: string) => {
    at(S.clock.now, (S) => {
      const l = L(S, leadId)
      if (!l.ownerId || l.firstContactAt) return
      const o = O(S, leadId)
      const channel = rnd() < 0.7 ? 'call' : 'whatsapp'
      if (rnd() < 0.22) {
        // No answer first: the callback becomes a dated task, then the agent reaches the client
        const cb = S.clock.now + between(30, 120) * MIN
        SA.logAttempt(S, o.id, { channel: 'call', outcome: pick(['no_answer', 'voicemail', 'busy'] as const), callbackAt: cb, completeContactTask: false }, l.ownerId)
        at(cb + between(0, 15) * MIN, (S) => {
          const l2 = L(S, leadId)
          if (!l2.ownerId || l2.firstContactAt) return
          const o2 = O(S, leadId)
          SA.logAttempt(S, o2.id, { channel: 'call', outcome: 'answered', completeContactTask: true, recordFirstContact: true }, l2.ownerId)
          for (const tk of S.tasks.filter((x) => x.oppId === o2.id && x.kind === 'callback' && !x.doneAt)) SA.completeTask(S, tk.id, l2.ownerId)
          SA.setStage(S, o2.id, 'contacting', l2.ownerId)
          progress(leadId, S.clock.now)
        })
        return
      }
      SA.logAttempt(S, o.id, { channel, outcome: 'answered', completeContactTask: true, recordFirstContact: true }, l.ownerId)
      SA.setStage(S, o.id, 'contacting', l.ownerId)
      if (channel === 'whatsapp' || rnd() < 0.35) {
        const agent = S.users.find((u) => u.id === l.ownerId)!
        SA.sendWhatsApp(S, o.id, `Hi ${l.fields.fullName.split(' ')[0]}, this is ${agent.name.split(' ')[0]} from ${E.companyName(S, l.companyId)}. Thanks for your enquiry — when is a good time to talk about your trip?`, l.ownerId)
        const t2 = S.clock.now + between(3, 40) * MIN
        at(t2, (S) => { SA.simulateWhatsAppInbound(S, O(S, leadId).id, pick(['Hi, now is fine 👍', 'Can you call me after 6?', 'Yes please send the details here', 'Thanks! What documents do you need?'])) })
      }
      progress(leadId, S.clock.now)
    })
  }

  const followUps = (lead: Lead, createdAt: number, forceUncontacted = false) => {
    const contactBase = isShiftTime(createdAt) ? createdAt : nextShiftStart(createdAt)
    const late = rnd() < 0.14
    const contactAt = contactBase + (late ? between(62, 105) : between(4, 50)) * MIN
    if (!forceUncontacted) at(contactAt, () => firstContact(lead.id))
    // A Manager steps in on Leads left Unassigned (all Absent); Trip2GoGlobal has no agents.
    at(Math.max(createdAt, contactBase) + 25 * MIN, (S) => {
      const l = L(S, lead.id)
      if (l.ownerId || l.companyId === 'trip2goglobal' || !isShiftTime(S.clock.now)) return
      const agents = E.companyAgents(S, l.companyId).filter((a) => !E.isAbsent(a, S.clock.now))
      if (!agents.length) return
      const target = agents.sort((a, b) => E.uncontactedCount(S, a.id) - E.uncontactedCount(S, b.id))[0]
      E.manualAssign(S, l.id, target.id, 'u-mgr', 'Left Unassigned at intake — assigned by Manager')
      at(S.clock.now + between(5, 40) * MIN, () => firstContact(lead.id))
    })
  }
  const note = (S: AppData, l: Lead, text: string) => { if (l.ownerId) E.addNote(S, l.id, text, l.ownerId) }
  const lossReason = () => pick(['Price too high', 'Price too high', 'Booked elsewhere', 'No response from client', 'No response from client', 'Travel plans changed', 'Visa / documents issue', 'Other'])

  const qualify = (S: AppData, l: Lead) => {
    const o = O(S, l.id)
    const dest = pick(DEST[l.companyId])
    const base = o.applicants[0]
    const dob = `19${Math.floor(between(60, 99))}-0${Math.floor(between(1, 9))}-1${Math.floor(between(0, 9))}`
    const apps: { id: string; data: Record<string, string> }[] = [{ id: base.id, data: { ...base.data, 'travel.destination': dest, 'travel.visaType': pick(['Tourist', 'Family visit', 'Short stay']), 'travel.purpose': pick(['Holiday', 'Visiting family', 'Wedding']), 'travel.travelDate': `2026-1${Math.floor(between(1, 2))}-${10 + Math.floor(between(0, 18))}`, 'applicant.dob': dob, 'applicant.passportNumber': `${Math.floor(between(100000000, 999999999))}`, 'applicant.passportExpiry': `2031-0${Math.floor(between(1, 9))}-15`, 'applicant.visaStatus': pick(['British citizen', 'Indefinite leave to remain', 'Skilled worker visa']), 'work.status': pick(['Employed', 'Self-employed', 'Student', 'Retired']), 'contact.postcode': `${pick(['B', 'M', 'LS', 'E', 'BD'])}${Math.floor(between(1, 20))} ${Math.floor(between(1, 9))}AB` } }]
    if (rnd() < 0.3) {
      const fn = makePerson(l.companyId, rnd)
      apps.push({ id: '', data: { 'applicant.fullName': `${fn.fullName.split(' ')[0]} ${l.fields.fullName.split(' ').slice(-1)[0]}`, 'applicant.nationality': l.fields.nationality, 'travel.destination': dest, 'applicant.dob': dob } as Record<string, string> })
    }
    SA.saveQualification(S, o.id, apps, l.ownerId!)
  }

  const runCase = (leadId: string) => {
    // Processing records options → agent records the customer's choice → Processing books the appointment
    at(S.clock.now + between(1, 20) * HOUR, (S) => {
      const c = SA.caseOf(S, O(S, leadId))
      if (!c) return
      const dest = O(S, leadId).applicants[0].data['travel.destination'] ?? 'France'
      SA.addVisaOption(S, c.id, { country: dest, centre: pick(['London', 'Manchester', 'Birmingham']), date: '2026-11-0' + Math.floor(between(3, 9)), time: '10:30' }, 'u-proc')
      SA.addVisaOption(S, c.id, { country: dest, centre: pick(['London', 'Edinburgh', 'Cardiff']), date: '2026-11-1' + Math.floor(between(0, 9)), time: '14:15' }, 'u-proc')
      SA.sendOptionsToAgent(S, c.id, 'u-proc')
      at(S.clock.now + between(2, 26) * HOUR, (S) => {
        const o = O(S, leadId)
        const c2 = SA.caseOf(S, o)!
        const owner = L(S, leadId).ownerId
        if (!owner) return
        SA.recordSelection(S, c2.id, pick(c2.options).id, owner)
        at(S.clock.now + between(1, 20) * HOUR, (S) => {
          const o3 = O(S, leadId)
          const c3 = SA.caseOf(S, o3)!
          SA.recordAppointment(S, c3.id, `APT-${Math.floor(between(100000, 999999))}`, 'u-proc')
          const settle = () => {
            const c4 = SA.caseOf(S, O(S, leadId))!
            for (const it of c4.checklist.filter((i) => i.owner === 'processing')) SA.toggleChecklistItem(S, c4.id, it.key, true, 'u-proc')
          }
          const balance = SA.paymentTotals(S, o3).outstanding
          const after = (fn: () => void, h: number) => at(S.clock.now + h * HOUR, fn)
          const finish = () => {
            after(() => {
              settle()
              const owner2 = L(S, leadId).ownerId
              const c5 = SA.caseOf(S, O(S, leadId))!
              if (!owner2) return
              for (const it of c5.checklist.filter((i) => i.owner === 'sales')) SA.toggleChecklistItem(S, c5.id, it.key, true, owner2)
              after(() => {
                if (SA.completenessCheck(S, c5.id, owner2).ok) SA.markPackSent(S, c5.id, rnd() < 0.85 ? 'whatsapp' : 'email', owner2)
                after(() => {
                  if (rnd() < 0.15) return
                  SA.recordOutcome(S, c5.id, rnd() < 0.82 ? 'granted' : 'refused', 'u-proc')
                  const o6 = O(S, leadId)
                  const c6 = SA.caseOf(S, o6)!
                  if (c6.outcome?.result === 'granted') {
                    // The agent works the review task most of the time (tasks never change the stage)
                    at(S.clock.now + between(2, 40) * HOUR, (S) => {
                      const ow = L(S, leadId).ownerId
                      if (!ow) return
                      for (const tk of S.tasks.filter((x) => x.oppId === O(S, leadId).id && !x.doneAt && (x.kind === 'review' ? rnd() < 0.85 : x.kind === 'referral' && rnd() < 0.4))) SA.completeTask(S, tk.id, ow)
                    })
                  }
                  if (c6.outcome?.result === 'granted' && rnd() < 0.35) {
                    at(S.clock.now + between(2, 48) * HOUR, (S) => {
                      const ow = L(S, leadId).ownerId
                      if (ow) SA.createReferral(S, O(S, leadId).id, { ...makePerson(o6.companyId, rnd), tripDetails: 'Referred by an existing customer' }, ow)
                    })
                  }
                  if (c6.outcome?.result === 'refused' && rnd() < 0.6) {
                    at(S.clock.now + between(4, 30) * HOUR, (S) => {
                      const b = SA.bookingOf(S, O(S, leadId))!
                      SA.requestRefund(S, b.id, Math.min(SA.paymentTotals(S, O(S, leadId)).paid, 40 + Math.round(between(0, 6)) * 10), 'Visa refused — customer asked for the service fee back (partial, per terms)', 'u-help')
                      if (rnd() < 0.7) at(S.clock.now + between(3, 30) * HOUR, (S) => { const rf = S.refunds.find((r) => r.bookingId === b.id && r.status === 'requested'); if (rf) SA.decideRefund(S, rf.id, rnd() < 0.85, 'u-acc') })
                    })
                  }
                }, between(72, 240))
              }, between(4, 30))
            }, between(4, 40))
          }
          if (balance > 0) {
            // Balance gate: the agent collects the rest, Accounts confirms it, then work continues
            after(() => {
              const owner3 = L(S, leadId).ownerId
              if (!owner3) return
              const res = SA.submitPayment(S, O(S, leadId).id, { type: 'full', amount: 0, proofName: `balance-transfer-${Math.floor(between(1000, 9999))}.pdf` }, owner3)
              if (res.ok && res.id) after(() => { SA.decidePayment(S, res.id!, 'confirm', 'u-acc'); finish() }, between(2, 20))
            }, between(6, 60))
          } else finish()
        })
      })
    })
  }

  const book = (leadId: string) => {
    const l = L(S, leadId)
    if (!l.ownerId) return
    const o = O(S, leadId)
    const total = o.quote!.agreedAmount
    const partial = rnd() < 0.35
    const res = SA.submitPayment(S, o.id, partial ? { type: 'partial', amount: Math.max(50, Math.round(total * between(0.3, 0.6))), proofName: `deposit-${Math.floor(between(1000, 9999))}.jpg` } : { type: 'full', amount: 0, proofName: `bank-transfer-${Math.floor(between(1000, 9999))}.pdf` }, l.ownerId)
    if (!res.ok || !res.id) return
    at(S.clock.now + between(1, 18) * HOUR, (S) => {
      if (rnd() < 0.08) {
        SA.decidePayment(S, res.id!, 'reject', 'u-acc', 'Proof does not show the transfer reference')
        at(S.clock.now + between(2, 20) * HOUR, () => book(leadId))
        return
      }
      SA.decidePayment(S, res.id!, 'confirm', 'u-acc')
      const o2 = O(S, leadId)
      if (!o2.bookingId && SA.isNotBookable(S, o2) && rnd() < 0.6) {
        at(S.clock.now + between(1, 20) * HOUR, (S) => { SA.overrideMargin(S, o2.id, 'u-mgr', 'Repeat customer — approved below threshold') })
      }
      at(S.clock.now + between(1.5, 22) * HOUR, (S) => {
        const o3 = O(S, leadId)
        if (!o3.bookingId) return
        const b = SA.bookingOf(S, o3)!
        note(S, L(S, leadId), `Booking ${b.ref} confirmed.`)
        if (b.invoice.status === 'sent' && rnd() < 0.8) at(S.clock.now + between(2, 72) * HOUR, (S) => { SA.simulateSignature(S, b.id) })
        if (rnd() < 0.55) at(S.clock.now + between(24, 200) * HOUR, (S) => { SA.recordExpense(S, b.id, Math.round(between(55, 110)), pick(['Appointment fee and insurance policy', 'Insurance + hotel deposit', 'Appointment booking fee']), 'u-acc') })
        if (rnd() < 0.5) {
          const ow = L(S, leadId).ownerId
          if (ow) SA.uploadDocument(S, o3.id, { name: `passport-${L(S, leadId).fields.fullName.split(' ')[0].toLowerCase()}.pdf`, kind: 'passport', sizeKb: between(300, 2400) }, ow)
        }
        runCase(leadId)
      })
    })
  }

  const progress = (leadId: string, t: number) => {
    const r = rnd()
    if (r < 0.74) {
      at(t + between(0.2, 30) * HOUR, (S) => {
        const l = L(S, leadId)
        if (!l.ownerId || l.status !== 'lead') return
        E.setStatus(S, l.id, 'mature', l.ownerId)
        qualify(S, l)
        SA.setStage(S, O(S, leadId).id, 'qualified', l.ownerId)
        note(S, l, pick(['Client engaged on WhatsApp — qualification taken.', 'Spoke to client, collected travel and applicant details.', 'Client replied to call-back; details recorded.']))
        const r2 = rnd()
        if (r2 < 0.45) {
          at(S.clock.now + between(20, 90) * HOUR, (S) => {
            const l2 = L(S, leadId)
            if (!l2.ownerId || l2.status !== 'mature') return
            E.setStatus(S, l2.id, 'hot', l2.ownerId)
            const o = O(S, leadId)
            const low = rnd() < 0.1
            const pkg = pick(PACKAGES[l2.companyId])
            const flightReq = rnd() < 0.4
            SA.saveQuote(S, o.id, { packageName: pkg, agreedAmount: low ? Math.round(between(120, 150)) : Math.round(between(17, 45)) * 10, flightReservation: { required: flightReq, paid: flightReq && rnd() < 0.5 }, hotelReservationCompanyCost: rnd() < 0.5, addOns: { actualFlight: rnd() < 0.12, actualHotel: rnd() < 0.08 } }, l2.ownerId)
            SA.setStage(S, o.id, 'quoted', l2.ownerId)
            note(S, l2, pick(['Quote agreed in principle.', 'Client accepted the package price.', 'Revised quote accepted.']))
            at(S.clock.now + between(2, 30) * HOUR, (S) => {
              const l3 = L(S, leadId)
              if (!l3.ownerId || l3.status !== 'hot') return
              const o3 = O(S, leadId)
              SA.generateDraft(S, o3.id, l3.ownerId)
              SA.setStage(S, o3.id, 'data_verification', l3.ownerId)
              if (rnd() < 0.2) SA.requestDraftCorrections(S, o3.id, 'Customer asked to fix the date of birth spelling', l3.ownerId)
              const r3 = rnd()
              at(S.clock.now + between(2, 60) * HOUR, (S) => {
                const l4 = L(S, leadId)
                if (!l4.ownerId || l4.status !== 'hot') return
                const o4 = O(S, leadId)
                if (r3 < 0.6) {
                  if (SA.latestDraft(o4)?.status !== 'unverified') {
                    const a = { ...o4.applicants[0], data: { ...o4.applicants[0].data, 'applicant.dob': (o4.applicants[0].data['applicant.dob'] ?? '1990-01-0').slice(0, -1) + '5' } }
                    SA.saveQualification(S, o4.id, [a, ...o4.applicants.slice(1)], l4.ownerId)
                    if (SA.draftOutOfDate(o4)) SA.generateDraft(S, o4.id, l4.ownerId)
                  }
                  SA.recordDraftApproval(S, o4.id, rnd() < 0.8 ? 'whatsapp' : 'email', l4.ownerId)
                  book(leadId)
                } else if (r3 < 0.82) {
                  SA.markLost(S, o4.id, lossReason(), l4.ownerId)
                } else if (rnd() < 0.5) {
                  SA.setDormant(S, o4.id, true, l4.ownerId)
                } else {
                  SA.createTask(S, o4.id, { kind: 'follow_up', title: 'Follow up on the draft approval', due: { mode: 'exact', at: S.clock.now + between(10, 70) * HOUR } }, l4.ownerId)
                }
              })
            })
          })
        } else if (r2 < 0.8) {
          at(S.clock.now + between(24, 120) * HOUR, (S) => {
            const l2 = L(S, leadId)
            if (!l2.ownerId || l2.status !== 'mature') return
            SA.markLost(S, O(S, leadId).id, lossReason(), l2.ownerId)
          })
        } else if (rnd() < 0.5) {
          at(S.clock.now + between(24, 120) * HOUR, (S) => {
            const l2 = L(S, leadId)
            if (l2.ownerId && l2.status === 'mature') SA.setDormant(S, O(S, leadId).id, true, l2.ownerId)
          })
        }
      })
    } else if (r < 0.86) {
      at(t + between(20, 72) * HOUR, (S) => {
        const l = L(S, leadId)
        if (!l.ownerId || l.status !== 'lead') return
        SA.markLost(S, O(S, leadId).id, pick(['No response from client', 'No response from client', 'Travel plans changed', 'Price too high']), l.ownerId)
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
        // Some form Leads carry a preferred contact time (SAL-FR-001): an exact UK time or a vague window
        const pref: PreferredContact | null = rnd() < 0.35 ? (rnd() < 0.5 ? { mode: 'window', label: pick(['Evening', 'Morning', 'After 6pm', 'Lunchtime']) } : { mode: 'exact', at: Math.round((t + between(1, 26) * HOUR) / (15 * MIN)) * 15 * MIN }) : null
        const r = rnd()
        const companyCampaigns = S.campaigns.filter((x) => x.companyId === c.id)
        if (c.id !== 'trip2goglobal' && r < 0.55) {
          // Meta Instant Form → Lead automatically, with campaign/ad where Meta provides them
          const cmp = rnd() < 0.9 && companyCampaigns.length ? pick(companyCampaigns) : null
          const ad = cmp ? pick(S.ads.filter((a) => a.campaignId === cmp.id)) : null
          const fields = person(c.id)
          at(t, (S) => {
            const res = E.receiveExternalEvent(S, c.id, { kind: 'lead', source: 'meta_form', fields, campaignId: cmp?.id ?? null, adId: ad?.id ?? null, externalId: `leadgen_${++extSeq}`, preferredContact: pref })
            if (res.outcome === 'created') followUps(S.leads.find((l) => l.id === res.recordId)!, t, recentUncontacted)
          })
        } else if (r < 0.7 || c.id === 'trip2goglobal') {
          const fields = person(c.id)
          at(t, (S) => {
            const res = E.receiveExternalEvent(S, c.id, { kind: 'lead', source: 'website', fields, campaignId: null, adId: null, externalId: `web_${++extSeq}`, preferredContact: pref })
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
            out(S, e, channel.endsWith('comment') ? ASK_PRIVATE : ASK, S.clock.now - 6 * MIN, mk, channel.endsWith('comment') ? 'private-reply' : 'dm')
            inn(S, e, `${fields.fullName}, ${fields.nationality}, ${fields.phone}. ${fields.tripDetails}`.trim(), S.clock.now - 2 * MIN)
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
        E.setAbsent(S, a.id, true, rnd() < 0.5 ? 'u-mgr' : 'u-admin')
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
        const actor = rnd() < 0.6 ? 'u-mgr' : 'u-admin'
        const res = E.manualAssign(S, l.id, pick(others).id, actor, pick(['Original owner on a long call', 'Customer asked for a Urdu speaker', 'Balancing workload', 'Owner stepped away']))
        if (res.ok) at(S.clock.now + between(5, 40) * MIN, () => firstContact(l.id))
      })
    }
  }

  // New agent added later: starting score = team average (placeholder — to be confirmed in v1.4)
  at(fromPkt(2026, 10, 10, 14, 30), (S) => { E.addAgent(S, { name: 'Noor Fatima', companyId: 'holidaynest' }, 'u-admin') })

  // Today: shift-start Absent marking, a simulated connection failure, an agent on a break, insights refresh
  at(fromPkt(2026, 10, 17, 14, 4), (S) => {
    const agents = E.companyAgents(S, 'flightnest')
    const pending = (id: string) => S.leads.filter((l) => l.ownerId === id && l.assignedInOffTime && !l.firstContactAt).length
    const target = agents.sort((a, b) => pending(b.id) - pending(a.id))[0]
    E.setAbsent(S, target.id, true, 'u-mgr')
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
    ['trip2go', 'facebook_dm', 'Hello, do you still have the Maldives offer?', 26 * 60, true],
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
      const mk = marketingFor(c)
      if (partial) {
        e.read = true
        const isComment = channel.endsWith('comment')
        out(S, e, isComment ? ASK_PRIVATE : ASK, S.clock.now + 4 * MIN, mk, isComment ? 'private-reply' : 'dm', 'read')
        inn(S, e, `It's ${fields.fullName}.`, S.clock.now + 9 * MIN)
        e.fields = { ...EMPTY_FIELDS, fullName: fields.fullName }
        if (c === 'holidaynest' && channel === 'facebook_dm') {
          // A reply sent from Meta Business Suite, synced into the CRM thread
          out(S, e, 'Yes, Christmas dates are available — a colleague will share prices shortly.', S.clock.now + 12 * MIN, mk, 'dm', 'delivered', 'meta')
        }
        if (c === 'schengentravel' && channel === 'facebook_comment') {
          out(S, e, 'Usually 10–15 working days. We’ve sent you a private message with the details!', S.clock.now + 5 * MIN, mk, 'public-reply', 'sent')
        }
      }
      if (c === 'travelope' && channel === 'facebook_dm') {
        e.read = true
        e.messages.push({ id: E.nextId(S, 'msg'), from: 'marketing', kind: 'dm', text: 'Hi! Which month are you planning to travel, and how many travellers?', at: S.clock.now + 3 * MIN, byUserId: mk, via: 'crm', status: 'failed', simulated: true, error: { code: 'rate_limited', message: 'Meta is rate-limiting this page. Try again shortly.', retryable: true } })
        e.lastActivityAt = S.clock.now + 3 * MIN
      }
    })
  }

  // ----- run the simulation
  S.clock.now = SEED_START
  let guard = 0
  while (queue.length) {
    if (++guard > 400_000) throw new Error(`Seed did not settle: ${queue.length} events still queued at ${new Date(queue[0].t).toISOString()}`)
    const ev = queue.shift()!
    E.advanceTo(S, ev.t)
    ev.run(S)
  }
  E.advanceTo(S, SEED_NOW)

  const todayShift = fromPkt(2026, 10, 17, 14, 0)
  for (const n of S.notifications) if (n.at < todayShift) n.read = true
  // Sales notifications older than a day are treated as read so the bell shows today's work
  for (const n of S.notifications) if (n.type === 'sales' && n.at < SEED_NOW - DAY) n.read = true
  S.clock = { now: SEED_NOW, running: true, speed: 1 }
  return S
}
