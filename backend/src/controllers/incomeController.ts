import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';

const GST_RATE = 0.18;

const ENGINEER_SEED: string[] = [
];

export const INVOICE_STATUSES = [
  { value: 'PROFORMA', label: 'Proforma invoice generated' },
  { value: 'ALREADY_SENT', label: 'Proforma invoice sent' },
  { value: 'TAX_SENT', label: 'Tax invoice sent' },
  { value: 'NOT_NEEDED', label: 'Invoice not needed' },
  { value: 'WAITING', label: 'Waiting' },
];

export const FEATURE_STATUSES = [
  { value: 'NOT_STARTED', label: 'Not started' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'TESTING', label: 'Testing' },
  { value: 'LIVE', label: 'Live' },
  { value: 'ON_HOLD', label: 'On hold' },
  { value: 'NA', label: 'N.A.' },
];

const DEFAULT_FEATURES = [
  'Admission & Enrollment Management', 'Student Information System (SIS)',
  'Academic Management', 'Outcome Based Education (OBE)', 'Attendance Management',
  'Timetable Management', 'Learning Management System (LMS)',
  'Examination & Controller of Examination (COE)', 'Fees & Finance', 'HR and Payroll',
  'Library Management', 'Hostel & Mess Management', 'Transport Management',
  'Placement & Career Services', 'Alumni Management', 'Research & Innovation',
  'NAAC / NBA / NIRF / IQAC', 'Inventory & Asset Management', 'Communication Hub',
  'Student & Parent Portal', 'Faculty Portal', 'Mobile Applications',
  'Dashboards & Analytics', 'Integration', 'Security & Administration',
];

const ONBOARDING_STAGES = ['ONBOARDING', 'IMPLEMENTATION', 'LIVE', 'ON_HOLD', 'DISCONTINUED'];
const INSTITUTION_TYPES = ['COLLEGE', 'SCHOOL', 'UNIVERSITY', 'POLYTECHNIC', 'OTHER'];

const round2 = (n: number) => Math.round(n * 100) / 100;
const todayStr = () => new Date().toISOString().split('T')[0];

// ---------------------------------------------------------------------------
// Pure helpers (operate on fetched rows; billing rows carry `payments`)
// ---------------------------------------------------------------------------
function normalizeAcademicYear(raw: string): string {
  const m = String(raw || '').trim().match(/^(\d{4})\s*-\s*(\d{2,4})$/);
  if (!m) throw new AppError(400, 'Academic year must use the format 2025-2026');
  const start = parseInt(m[1]);
  const end = m[2].length === 4 ? parseInt(m[2]) : parseInt(m[1].slice(0, 2) + m[2]);
  if (end !== start + 1) throw new AppError(400, 'The end year must be the start year + 1');
  return `${start}-${end}`;
}

// ---------------------------------------------------------------------------
// Billing periods: ACADEMIC (label like "2026-2027") or CUSTOM (explicit
// contract dates, e.g. 01 Feb 2026 -> 31 Jan 2027).
// ---------------------------------------------------------------------------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const fmtShortDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export const periodLabelOf = (b: any): string =>
  b.periodType === 'CUSTOM' && b.periodStart && b.periodEnd
    ? `${fmtShortDate(b.periodStart)} → ${fmtShortDate(b.periodEnd)}`
    : b.academicYear;

function resolvePeriod(body: any): { periodType: string; periodStart: string | null; periodEnd: string | null; academicYear: string } {
  if (body.periodType === 'CUSTOM') {
    const periodStart = String(body.periodStart || '');
    const periodEnd = String(body.periodEnd || '');
    if (!DATE_RE.test(periodStart) || !DATE_RE.test(periodEnd)) {
      throw new AppError(400, 'Pick the period start and end dates');
    }
    if (periodEnd <= periodStart) {
      throw new AppError(400, 'The period end must be after the start');
    }
    return { periodType: 'CUSTOM', periodStart, periodEnd, academicYear: periodStart };
  }
  return {
    periodType: 'ACADEMIC',
    periodStart: null,
    periodEnd: null,
    academicYear: normalizeAcademicYear(body.academicYear),
  };
}

// UTC arithmetic: local-midnight parsing shifts a day through toISOString()
// in timezones ahead of UTC (IST included).
const addDaysStr = (date: string, days: number) => {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
};

const addYearsStr = (date: string, years: number) => {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().split('T')[0];
};

function computeBillingFields(b: any) {
  if (!b.overrideAmounts) {
    if (b.studentCount && b.rate != null) {
      b.taxableValue = round2(Number(b.studentCount) * Number(b.rate));
    }
    if (b.taxableValue != null) {
      b.gstAmount = round2(Number(b.taxableValue) * GST_RATE);
      b.netAmount = round2(Number(b.taxableValue) + b.gstAmount + Number(b.oneTimePayment || 0));
    }
  }
  b.yearStart = parseInt(String(b.academicYear).slice(0, 4)) || 0;
  return b;
}

const receivedOf = (b: any) =>
  round2((b.payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0));

const totalDueOf = (b: any) => round2(Number(b.netAmount || 0) + Number(b.previousPending || 0));

const sortedPayments = (b: any) =>
  [...(b.payments || [])].sort((a, x) =>
    (x.receivedOn || '9999').localeCompare(a.receivedOn || '9999'));

function billingJSON(b: any, opts: { withPayments?: boolean } = {}) {
  const received = receivedOf(b);
  const due = totalDueOf(b);
  return {
    ...b,
    client: undefined,
    clientName: b.client?.name || b.clientId,
    periodLabel: periodLabelOf(b),
    received,
    totalDue: due,
    balance: round2(due - received),
    collectionPct: due > 0 ? Math.min(Math.max(Math.round((received / due) * 100), 0), 100) : 0,
    followupOverdue: Boolean(b.nextFollowupDate && b.nextFollowupDate <= todayStr()),
    payments: opts.withPayments ? sortedPayments(b) : undefined,
  };
}

function clientTotalsOf(billings: any[]) {
  const billed = round2(billings.reduce((s, b) => s + totalDueOf(b), 0));
  const received = round2(billings.reduce((s, b) => s + receivedOf(b), 0));
  return {
    billed, received,
    balance: round2(billed - received),
    collectionPct: billed > 0 ? Math.min(Math.max(Math.round((received / billed) * 100), 0), 100) : 0,
  };
}

function agreementInfo(ob: any) {
  if (!ob) return { label: 'Not started', expired: false, expiring: false, daysToExpiry: null };
  if (!ob.agreementSigned) return { label: 'Agreement pending', expired: false, expiring: false, daysToExpiry: null };
  if (!ob.agreementEnd) return { label: 'Signed', expired: false, expiring: false, daysToExpiry: null };
  const days = Math.floor((new Date(ob.agreementEnd).getTime() - new Date(todayStr()).getTime()) / 86400000);
  const expired = days < 0;
  const expiring = !expired && days <= (ob.reminderDays ?? 90);
  const label = expired
    ? `Expired ${Math.abs(days)}d ago`
    : expiring
      ? `Expires in ${days}d`
      : `Valid till ${ob.agreementEnd}`;
  return { label, expired, expiring, daysToExpiry: days };
}

function featureProgressOf(features: any[]) {
  const applicable = features.filter(f => f.status !== 'NA');
  const live = applicable.filter(f => f.status === 'LIVE');
  return {
    total: features.length,
    applicable: applicable.length,
    live: live.length,
    pct: applicable.length ? Math.round((live.length / applicable.length) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------
const fetchOrgBillings = (organizationId: string) =>
  prisma.clientBilling.findMany({
    where: { organizationId },
    include: { payments: true, client: true },
  });

async function fetchOrgClient(clientId: string, organizationId: string) {
  const client = await prisma.incomeClient.findFirst({ where: { id: clientId, organizationId } });
  if (!client) throw new AppError(404, 'Client not found');
  return client;
}

async function fetchOrgBilling(billingId: string, organizationId: string) {
  const billing = await prisma.clientBilling.findFirst({
    where: { id: billingId, organizationId },
    include: { payments: true },
  });
  if (!billing) throw new AppError(404, 'Billing record not found');
  return billing;
}

// Engineers are mapped to People: every active employee is offered, plus any
// legacy names still present on billing rows (so old data stays selectable).
async function engineerNames(organizationId: string): Promise<string[]> {
  const [rows, employees] = await Promise.all([
    prisma.clientBilling.findMany({
      where: { organizationId, engineer: { not: '' } },
      select: { engineer: true },
      distinct: ['engineer'],
    }),
    prisma.person.findMany({
      where: {
        organizationId,
        isEmployee: true,
        employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] },
      },
      select: { name: true },
    }),
  ]);
  const set = new Set(ENGINEER_SEED);
  employees.forEach(e => set.add(e.name));
  rows.forEach(r => set.add(r.engineer));
  return Array.from(set).sort();
}

// ---------------------------------------------------------------------------
// Analytics (same math as the Django services/income_analytics.py port)
// ---------------------------------------------------------------------------
function buildAnalyticsFrom(billings: any[], payments: any[]) {
  const fy: Record<string, any> = {};
  for (const b of billings) {
    const r = (fy[b.academicYear] ||= {
      year: periodLabelOf(b), yearStart: b.yearStart, billed: 0, received: 0, outstanding: 0,
    });
    const due = totalDueOf(b);
    const rec = receivedOf(b);
    r.billed = round2(r.billed + due);
    r.received = round2(r.received + rec);
    r.outstanding = round2(r.outstanding + due - rec);
  }
  const fyRows = Object.values(fy).sort((a: any, b: any) => a.yearStart - b.yearStart);
  fyRows.forEach((r: any) => {
    r.collectionPct = r.billed > 0 ? Math.min(Math.max(Math.round((r.received / r.billed) * 100), 0), 100) : 0;
  });
  const grandOutstanding = round2(fyRows.reduce((s: number, r: any) => s + r.outstanding, 0));

  const perClient: Record<string, any> = {};
  for (const b of billings) {
    const r = (perClient[b.clientId] ||= {
      clientId: b.clientId, name: b.client?.name || b.clientId,
      engineer: '', engineerYear: -1,
      billed: 0, received: 0, balance: 0, isActive: b.client?.isActive ?? true,
    });
    const due = totalDueOf(b);
    const rec = receivedOf(b);
    r.billed = round2(r.billed + due);
    r.received = round2(r.received + rec);
    r.balance = round2(r.balance + due - rec);
    if (b.engineer && b.yearStart > r.engineerYear) {
      r.engineer = b.engineer;
      r.engineerYear = b.yearStart;
    }
  }
  const clientOutstanding = Object.values(perClient).sort((a: any, b: any) => b.balance - a.balance);
  const positiveTotal = clientOutstanding.reduce((s: number, r: any) => s + (r.balance > 0 ? r.balance : 0), 0);
  clientOutstanding.forEach((r: any) => {
    r.sharePct = r.balance > 0 && positiveTotal > 0 ? Math.round((r.balance / positiveTotal) * 100) : 0;
    r.collectionPct = r.billed > 0 ? Math.min(Math.max(Math.round((r.received / r.billed) * 100), 0), 100) : 0;
  });

  const eng: Record<string, any> = {};
  for (const b of billings) {
    if (!b.engineer) continue;
    const r = (eng[b.engineer] ||= {
      engineer: b.engineer, clientIds: new Set(), billed: 0, received: 0, outstanding: 0,
    });
    const due = totalDueOf(b);
    const rec = receivedOf(b);
    r.clientIds.add(b.clientId);
    r.billed = round2(r.billed + due);
    r.received = round2(r.received + rec);
    r.outstanding = round2(r.outstanding + due - rec);
  }
  const engineerRows = Object.values(eng)
    .map((r: any) => ({ ...r, clientCount: r.clientIds.size, clientIds: undefined }))
    .sort((a: any, b: any) => b.outstanding - a.outstanding);

  const monthly: Record<string, number> = {};
  let undatedTotal = 0;
  for (const p of payments) {
    if (p.receivedOn) {
      const key = p.receivedOn.slice(0, 7);
      monthly[key] = round2((monthly[key] || 0) + Number(p.amount));
    } else {
      undatedTotal = round2(undatedTotal + Number(p.amount));
    }
  }
  const monthlyTrend = Object.entries(monthly).sort()
    .map(([month, amount]) => ({ month, amount }));

  return { fyRows, grandOutstanding, clientOutstanding, engineerRows, monthlyTrend, undatedReceived: undatedTotal };
}

function buildForecastFrom(billings: any[]) {
  if (billings.length === 0) {
    return { targetYear: '', currentYear: '', currentBilled: 0, rows: [], conservativeTotal: 0, growthTotal: 0 };
  }
  const maxStart = Math.max(...billings.map(b => b.yearStart));
  const targetYear = `${maxStart + 1}-${maxStart + 2}`;
  const currentYear = `${maxStart}-${maxStart + 1}`;
  const currentBilled = round2(
    billings.filter(b => b.yearStart === maxStart).reduce((s, b) => s + Number(b.netAmount || 0), 0)
  );

  const byClient: Record<string, any[]> = {};
  for (const b of billings) (byClient[b.clientId] ||= []).push(b);

  const out: any[] = [];
  let conservativeTotal = 0;
  let growthTotal = 0;

  for (const clientRows of Object.values(byClient)) {
    const client = clientRows[0].client;
    if (!client?.isActive) continue;
    const latest = clientRows.reduce((a, b) => (b.yearStart > a.yearStart ? b : a));
    const conservative = Number(latest.netAmount || 0);

    const counts = clientRows
      .filter(b => b.studentCount)
      .map(b => [b.yearStart, b.studentCount] as [number, number])
      .sort((a, b) => a[0] - b[0]);

    let note = '';
    let projectedCount: number | null = null;
    let growthAmount = conservative;

    if (latest.rate && latest.studentCount && counts.length >= 2) {
      const factors: number[] = [];
      for (let i = 1; i < counts.length; i++) {
        const [y1, c1] = counts[i - 1];
        const [y2, c2] = counts[i];
        if (c1 && y2 === y1 + 1) factors.push(c2 / c1);
      }
      if (factors.length) {
        const avgGrowth = factors.reduce((s, f) => s + f, 0) / factors.length;
        projectedCount = Math.round(latest.studentCount * avgGrowth);
        growthAmount = round2(projectedCount * Number(latest.rate) * (1 + GST_RATE));
      } else {
        note = 'no consecutive-year trend';
      }
    } else {
      note = !latest.rate ? 'fixed fee' : 'single year of data';
    }

    out.push({
      clientId: client.id,
      name: client.name,
      engineer: latest.engineer,
      currentYear: periodLabelOf(latest),
      currentNet: conservative,
      currentCount: latest.studentCount,
      projectedCount,
      conservative,
      growth: growthAmount,
      note,
    });
    conservativeTotal = round2(conservativeTotal + conservative);
    growthTotal = round2(growthTotal + growthAmount);
  }

  out.sort((a, b) => b.growth - a.growth);
  return { targetYear, currentYear, currentBilled, rows: out, conservativeTotal, growthTotal };
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export const incomeController = {
  // ---- Meta --------------------------------------------------------------
  async getMeta(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const [engineers, academicYears] = await Promise.all([
      engineerNames(orgId),
      prisma.academicYear.findMany({
        where: { organizationId: orgId },
        orderBy: { label: 'desc' },
      }),
    ]);
    res.json({
      engineers,
      academicYears,
      invoiceStatuses: INVOICE_STATUSES,
      onboardingStages: ONBOARDING_STAGES,
      institutionTypes: INSTITUTION_TYPES,
      featureStatuses: FEATURE_STATUSES,
    });
  },

  // ---- Dashboard ---------------------------------------------------------
  async getDashboard(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const today = todayStr();
    const [billings, payments, clients, onboardings] = await Promise.all([
      fetchOrgBillings(orgId),
      prisma.paymentReceipt.findMany({ where: { organizationId: orgId } }),
      prisma.incomeClient.findMany({ where: { organizationId: orgId } }),
      prisma.clientOnboarding.findMany({ where: { organizationId: orgId } }),
    ]);

    const analytics = buildAnalyticsFrom(billings, payments);
    const rows = billings.map(b => billingJSON(b));

    const followups = rows
      .filter(b => b.nextFollowupDate && b.nextFollowupDate <= today)
      .sort((a, b) => a.nextFollowupDate!.localeCompare(b.nextFollowupDate!));
    const waiting = rows.filter(b => b.invoiceStatus === 'WAITING');

    const clientById = new Map(clients.map(c => [c.id, c]));
    const billingById = new Map(billings.map(b => [b.id, b]));
    const recentPayments = [...payments]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 8)
      .map(p => {
        const billing = billingById.get(p.billingId);
        return {
          ...p,
          clientName: clientById.get(p.clientId)?.name,
          academicYear: billing ? periodLabelOf(billing) : undefined,
        };
      });

    const topClients = analytics.clientOutstanding.filter((r: any) => r.balance > 0).slice(0, 8);

    const obByClient = new Map(onboardings.map(o => [o.clientId, o]));
    let expiringCount = 0;
    let poPendingCount = 0;
    for (const c of clients.filter(c => c.isActive)) {
      const ob = obByClient.get(c.id);
      if (!ob?.poReceived) poPendingCount++;
      const info = agreementInfo(ob);
      if (ob?.agreementSigned && (info.expired || info.expiring)) expiringCount++;
    }

    res.json({
      fyRows: analytics.fyRows,
      grandOutstanding: analytics.grandOutstanding,
      engineerRows: analytics.engineerRows,
      topClients,
      followups,
      waiting,
      recentPayments,
      clientCount: clients.filter(c => c.isActive).length,
      expiringCount,
      poPendingCount,
      today,
    });
  },

  // ---- Analytics + forecast ---------------------------------------------
  async getAnalytics(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const [billings, payments] = await Promise.all([
      fetchOrgBillings(orgId),
      prisma.paymentReceipt.findMany({ where: { organizationId: orgId } }),
    ]);
    res.json({ ...buildAnalyticsFrom(billings, payments), forecast: buildForecastFrom(billings) });
  },

  // ---- Academic years ----------------------------------------------------
  async getAcademicYears(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    // Auto-import labels already used on billings
    const [existing, usedLabels] = await Promise.all([
      prisma.academicYear.findMany({ where: { organizationId: orgId } }),
      prisma.clientBilling.findMany({
        where: { organizationId: orgId },
        select: { academicYear: true },
        distinct: ['academicYear'],
      }),
    ]);
    const have = new Set(existing.map(y => y.label));
    const missing = usedLabels.map(u => u.academicYear).filter(l => !have.has(l));
    if (missing.length) {
      await prisma.academicYear.createMany({
        data: missing.map(label => ({ organizationId: orgId, label })),
        skipDuplicates: true,
      });
    }

    const [years, counts] = await Promise.all([
      prisma.academicYear.findMany({
        where: { organizationId: orgId },
        orderBy: { label: 'desc' },
      }),
      prisma.clientBilling.groupBy({
        by: ['academicYear'],
        where: { organizationId: orgId },
        _count: { _all: true },
      }),
    ]);
    const countByLabel = new Map(counts.map(c => [c.academicYear, c._count._all]));
    res.json({
      years: years.map(y => ({ ...y, usageCount: countByLabel.get(y.label) || 0 })),
    });
  },

  async createAcademicYear(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const label = normalizeAcademicYear(req.body.label);
    const exists = await prisma.academicYear.findUnique({
      where: { organizationId_label: { organizationId: orgId, label } },
    });
    if (exists) throw new AppError(400, `${label} already exists`);
    const year = await prisma.academicYear.create({ data: { organizationId: orgId, label } });
    res.status(201).json(year);
  },

  async toggleAcademicYear(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const year = await prisma.academicYear.findFirst({
      where: { id: req.params.yearId, organizationId: orgId },
    });
    if (!year) throw new AppError(404, 'Academic year not found');
    const updated = await prisma.academicYear.update({
      where: { id: year.id },
      data: { isActive: !year.isActive },
    });
    res.json(updated);
  },

  // ---- Clients -----------------------------------------------------------
  async getClients(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const q = String(req.query.q || '').trim().toLowerCase();
    const engineer = String(req.query.engineer || '').trim();
    const show = String(req.query.show || 'all');
    const sort = String(req.query.sort || 'balance');
    const period = String(req.query.period || '').trim(); // '2026-2027' | 'CUSTOM' | ''
    const collection = String(req.query.collection || '').trim(); // full | partial | none | ''

    let clients = await prisma.incomeClient.findMany({
      where: {
        organizationId: orgId,
        ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
      },
      include: { billings: { include: { payments: true } } },
    });
    if (engineer) {
      clients = clients.filter(c => c.billings.some(b => b.engineer === engineer));
    }

    // Period filter scopes both membership and the money columns: with a year
    // selected, Billed/Received/Balance show only that period's figures.
    const matchesPeriod = (b: any) =>
      !period ? true
        : period === 'CUSTOM' ? b.periodType === 'CUSTOM'
          : b.periodType !== 'CUSTOM' && b.academicYear === period;

    const makeRow = (c: any) => {
      const scoped = c.billings.filter(matchesPeriod);
      const sorted = [...scoped].sort((a, b) => a.yearStart - b.yearStart);
      const latest = sorted[sorted.length - 1];
      return {
        ...c,
        billings: undefined,
        ...clientTotalsOf(scoped),
        latestEngineer: latest?.engineer || '',
        latestYear: latest?.academicYear || '',
        billingCount: scoped.length,
      };
    };

    let rows = clients.map(makeRow);
    if (period) rows = rows.filter(r => r.billingCount > 0);
    if (show === 'balance') rows = rows.filter(r => r.balance > 0);
    if (collection === 'full') rows = rows.filter(r => r.billed > 0 && r.balance <= 0);
    if (collection === 'partial') rows = rows.filter(r => r.received > 0 && r.balance > 0);
    if (collection === 'none') rows = rows.filter(r => r.billed > 0 && r.received === 0);

    const cmp = sort === 'name'
      ? (a: any, b: any) => a.name.localeCompare(b.name)
      : (a: any, b: any) => b.balance - a.balance;

    const activeRows = rows.filter(r => r.isActive).sort(cmp);
    const inactiveRows = rows.filter(r => !r.isActive).sort(cmp);

    const totalsOf = (rs: any[]) => ({
      billed: round2(rs.reduce((s, r) => s + r.billed, 0)),
      received: round2(rs.reduce((s, r) => s + r.received, 0)),
      balance: round2(rs.reduce((s, r) => s + r.balance, 0)),
    });

    // Period options for the filter dropdown (from actual data)
    const periodSet = new Set<string>();
    let hasCustomPeriods = false;
    for (const c of clients) {
      for (const b of c.billings) {
        if (b.periodType === 'CUSTOM') hasCustomPeriods = true;
        else if (b.academicYear) periodSet.add(b.academicYear);
      }
    }

    res.json({
      activeRows, inactiveRows,
      activeTotals: totalsOf(activeRows),
      inactiveTotals: totalsOf(inactiveRows),
      totalCount: activeRows.length + inactiveRows.length,
      engineers: await engineerNames(orgId),
      periods: Array.from(periodSet).sort().reverse(),
      hasCustomPeriods,
    });
  },

  async createClient(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const name = String(req.body.name || '').trim();
    if (!name) throw new AppError(400, 'Client name is required');
    const dup = await prisma.incomeClient.findFirst({
      where: { organizationId: orgId, name: { equals: name, mode: 'insensitive' } },
    });
    if (dup) throw new AppError(400, 'A client with this name already exists');
    const client = await prisma.incomeClient.create({
      data: {
        organizationId: orgId,
        name,
        agreementStatus: String(req.body.agreementStatus || ''),
        notes: String(req.body.notes || ''),
      },
    });
    res.status(201).json(client);
  },

  async getClientDetail(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const client = await prisma.incomeClient.findFirst({
      where: { id: req.params.clientId, organizationId: orgId },
      include: {
        billings: { include: { payments: true }, orderBy: { yearStart: 'asc' } },
        onboarding: true,
      },
    });
    if (!client) throw new AppError(404, 'Client not found');

    // Carry-forward mismatch: previousPending vs prior year's closing balance
    let prevBalance: number | null = null;
    const billingRows = client.billings.map(b => {
      const json = billingJSON(b, { withPayments: true });
      const mismatch = prevBalance !== null
        && b.previousPending != null
        && Math.abs(Number(b.previousPending) - prevBalance) > 1;
      const result = { ...json, mismatch, priorBalance: prevBalance };
      prevBalance = json.balance;
      return result;
    });

    res.json({
      ...client,
      billings: billingRows,
      totals: clientTotalsOf(client.billings),
      onboarding: client.onboarding
        ? {
            ...client.onboarding,
            poDocumentData: undefined,
            agreementDocumentData: undefined,
            agreement: agreementInfo(client.onboarding),
          }
        : null,
    });
  },

  async updateClient(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const client = await fetchOrgClient(req.params.clientId, orgId);
    const { name, agreementStatus, notes, isActive } = req.body;
    const data: any = {};
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) throw new AppError(400, 'Client name is required');
      const dup = await prisma.incomeClient.findFirst({
        where: {
          organizationId: orgId,
          id: { not: client.id },
          name: { equals: trimmed, mode: 'insensitive' },
        },
      });
      if (dup) throw new AppError(400, 'A client with this name already exists');
      data.name = trimmed;
    }
    if (agreementStatus !== undefined) data.agreementStatus = String(agreementStatus);
    if (notes !== undefined) data.notes = String(notes);
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    const updated = await prisma.incomeClient.update({ where: { id: client.id }, data });
    res.json(updated);
  },

  async toggleClientActive(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const client = await fetchOrgClient(req.params.clientId, orgId);
    const updated = await prisma.incomeClient.update({
      where: { id: client.id },
      data: { isActive: !client.isActive },
    });
    res.json(updated);
  },

  async updateClientEngineer(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const client = await fetchOrgClient(req.params.clientId, orgId);
    const latest = await prisma.clientBilling.findFirst({
      where: { clientId: client.id },
      orderBy: { yearStart: 'desc' },
    });
    if (!latest) throw new AppError(400, 'No billing year exists for this client');
    const engineer = String(req.body.engineer || '').trim();
    await prisma.clientBilling.update({ where: { id: latest.id }, data: { engineer } });
    res.json({ ok: true, engineer });
  },

  async deleteClient(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const client = await fetchOrgClient(req.params.clientId, orgId);
    const billingCount = await prisma.clientBilling.count({ where: { clientId: client.id } });
    if (billingCount > 0) {
      throw new AppError(400, 'Cannot delete a client with billing records. Mark it inactive instead.');
    }
    await prisma.incomeClient.delete({ where: { id: client.id } });
    res.json({ message: 'Client deleted' });
  },

  // ---- Billings ----------------------------------------------------------
  async getBillingPrefill(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const client = await fetchOrgClient(req.params.clientId, orgId);
    const latest = await prisma.clientBilling.findFirst({
      where: { clientId: client.id },
      include: { payments: true },
      orderBy: { yearStart: 'desc' },
    });
    if (!latest) return res.json({ prefill: null });
    const json = billingJSON(latest);
    // Next cycle follows the latest row's period style: academic years roll
    // to the next label; custom cycles roll to the day after the current end.
    const nextPeriod = latest.periodType === 'CUSTOM' && latest.periodEnd
      ? {
          periodType: 'CUSTOM',
          periodStart: addDaysStr(latest.periodEnd, 1),
          periodEnd: addDaysStr(addYearsStr(addDaysStr(latest.periodEnd, 1), 1), -1),
        }
      : {
          periodType: 'ACADEMIC',
          academicYear: `${latest.yearStart + 1}-${latest.yearStart + 2}`,
        };
    res.json({
      prefill: {
        ...nextPeriod,
        engineer: latest.engineer,
        studentCount: latest.studentCount,
        rate: latest.rate,
        previousPending: json.balance,
      },
    });
  },

  async createBilling(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const client = await fetchOrgClient(req.params.clientId, orgId);
    const period = resolvePeriod(req.body);
    const dup = await prisma.clientBilling.findUnique({
      where: { clientId_academicYear: { clientId: client.id, academicYear: period.academicYear } },
    });
    if (dup) {
      throw new AppError(400, period.periodType === 'CUSTOM'
        ? `This client already has a billing cycle starting ${fmtShortDate(period.periodStart!)}`
        : `This client already has a row for ${period.academicYear}`);
    }
    if (req.body.overrideAmounts && !req.body.netAmount) {
      throw new AppError(400, 'Enter the net amount when overriding');
    }
    const numOrNull = (v: any) => (v == null || v === '' ? null : Number(v));
    const fields = computeBillingFields({
      ...period,
      studentCount: numOrNull(req.body.studentCount),
      rate: numOrNull(req.body.rate),
      oneTimePayment: Number(req.body.oneTimePayment || 0),
      overrideAmounts: Boolean(req.body.overrideAmounts),
      taxableValue: numOrNull(req.body.taxableValue),
      gstAmount: Number(req.body.gstAmount || 0),
      netAmount: Number(req.body.netAmount || 0),
      previousPending: Number(req.body.previousPending || 0),
      engineer: String(req.body.engineer || '').trim(),
      invoiceStatus: String(req.body.invoiceStatus || ''),
      remarks: String(req.body.remarks || ''),
      nextFollowupDate: req.body.nextFollowupDate || null,
      followupNote: String(req.body.followupNote || ''),
    });
    const billing = await prisma.clientBilling.create({
      data: { ...fields, clientId: client.id, organizationId: orgId },
      include: { payments: true, client: true },
    });
    res.status(201).json(billingJSON(billing));
  },

  async updateBilling(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const billing = await fetchOrgBilling(req.params.billingId, orgId);
    const body = req.body;
    const merged: any = { ...billing };

    if (body.periodType !== undefined || body.periodStart !== undefined
        || body.periodEnd !== undefined || body.academicYear !== undefined) {
      const period = resolvePeriod({
        periodType: body.periodType ?? billing.periodType,
        periodStart: body.periodStart ?? billing.periodStart,
        periodEnd: body.periodEnd ?? billing.periodEnd,
        academicYear: body.academicYear
          ?? (billing.periodType === 'ACADEMIC' ? billing.academicYear : undefined),
      });
      const dup = await prisma.clientBilling.findFirst({
        where: { clientId: billing.clientId, academicYear: period.academicYear, id: { not: billing.id } },
      });
      if (dup) {
        throw new AppError(400, period.periodType === 'CUSTOM'
          ? `This client already has a billing cycle starting ${fmtShortDate(period.periodStart!)}`
          : `This client already has a row for ${period.academicYear}`);
      }
      Object.assign(merged, period);
    }
    const numOrNull = (v: any) => (v == null || v === '' ? null : Number(v));
    if (body.studentCount !== undefined) merged.studentCount = numOrNull(body.studentCount);
    if (body.rate !== undefined) merged.rate = numOrNull(body.rate);
    if (body.oneTimePayment !== undefined) merged.oneTimePayment = Number(body.oneTimePayment || 0);
    if (body.overrideAmounts !== undefined) merged.overrideAmounts = Boolean(body.overrideAmounts);
    if (body.taxableValue !== undefined) merged.taxableValue = numOrNull(body.taxableValue);
    if (body.gstAmount !== undefined) merged.gstAmount = Number(body.gstAmount || 0);
    if (body.netAmount !== undefined) merged.netAmount = Number(body.netAmount || 0);
    if (body.previousPending !== undefined) merged.previousPending = Number(body.previousPending || 0);
    if (body.engineer !== undefined) merged.engineer = String(body.engineer).trim();
    if (body.invoiceStatus !== undefined) merged.invoiceStatus = String(body.invoiceStatus);
    if (body.remarks !== undefined) merged.remarks = String(body.remarks);
    if (body.nextFollowupDate !== undefined) merged.nextFollowupDate = body.nextFollowupDate || null;
    if (body.followupNote !== undefined) merged.followupNote = String(body.followupNote);

    if (merged.overrideAmounts && !merged.netAmount) {
      throw new AppError(400, 'Enter the net amount when overriding');
    }
    computeBillingFields(merged);

    const updated = await prisma.clientBilling.update({
      where: { id: billing.id },
      data: {
        periodType: merged.periodType,
        periodStart: merged.periodStart,
        periodEnd: merged.periodEnd,
        academicYear: merged.academicYear,
        yearStart: merged.yearStart,
        studentCount: merged.studentCount,
        rate: merged.rate,
        oneTimePayment: merged.oneTimePayment,
        overrideAmounts: merged.overrideAmounts,
        taxableValue: merged.taxableValue,
        gstAmount: merged.gstAmount,
        netAmount: merged.netAmount,
        previousPending: merged.previousPending,
        engineer: merged.engineer,
        invoiceStatus: merged.invoiceStatus,
        remarks: merged.remarks,
        nextFollowupDate: merged.nextFollowupDate,
        followupNote: merged.followupNote,
      },
      include: { payments: true, client: true },
    });
    res.json(billingJSON(updated));
  },

  async deleteBilling(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const billing = await fetchOrgBilling(req.params.billingId, orgId);
    if (billing.payments.length > 0) {
      throw new AppError(400, 'Cannot delete a billing year with recorded payments');
    }
    await prisma.clientBilling.delete({ where: { id: billing.id } });
    res.json({ message: 'Billing record deleted' });
  },

  // ---- Payments ----------------------------------------------------------
  async addPayment(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const billing = await fetchOrgBilling(req.params.billingId, orgId);
    const amount = Number(req.body.amount);
    if (!amount || amount <= 0) throw new AppError(400, 'A positive amount is required');
    const payment = await prisma.paymentReceipt.create({
      data: {
        billingId: billing.id,
        clientId: billing.clientId,
        organizationId: orgId,
        amount: round2(amount),
        receivedOn: req.body.receivedOn || null,
        mode: String(req.body.mode || ''),
        note: String(req.body.note || ''),
      },
    });
    res.status(201).json(payment);
  },

  async deletePayment(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const payment = await prisma.paymentReceipt.findFirst({
      where: { id: req.params.paymentId, organizationId: orgId },
    });
    if (!payment) throw new AppError(404, 'Payment not found');
    await prisma.paymentReceipt.delete({ where: { id: payment.id } });
    res.json({ message: 'Payment entry deleted' });
  },

  // ---- Onboarding / implementation --------------------------------------
  async getOnboarding(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const client = await fetchOrgClient(req.params.clientId, orgId);
    const [ob, features] = await Promise.all([
      prisma.clientOnboarding.findUnique({ where: { clientId: client.id } }),
      prisma.featureStatus.findMany({
        where: { clientId: client.id },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    res.json({
      client: { id: client.id, name: client.name },
      onboarding: ob ? {
        ...ob,
        // Documents are heavy - ship flags here, bytes via the download route.
        poDocumentData: undefined,
        agreementDocumentData: undefined,
        poHasDocument: Boolean(ob.poDocumentData),
        agreementHasDocument: Boolean(ob.agreementDocumentData),
        agreement: agreementInfo(ob),
      } : null,
      features,
      progress: featureProgressOf(features),
    });
  },

  async getOnboardingDocument(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const client = await fetchOrgClient(req.params.clientId, orgId);
    const ob = await prisma.clientOnboarding.findUnique({ where: { clientId: client.id } });
    const kind = req.params.kind;
    if (!ob || !['po', 'agreement'].includes(kind)) throw new AppError(404, 'Document not found');
    const dataUri = kind === 'po' ? ob.poDocumentData : ob.agreementDocumentData;
    const filename = kind === 'po' ? ob.poFilename : ob.agreementFilename;
    if (!dataUri) throw new AppError(404, 'No document uploaded');
    res.json({ filename: filename || `${kind}-document`, dataUri });
  },

  async saveOnboarding(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const client = await fetchOrgClient(req.params.clientId, orgId);
    const existing = await prisma.clientOnboarding.findUnique({ where: { clientId: client.id } });
    const b = req.body;
    if (b.stage && !ONBOARDING_STAGES.includes(b.stage)) throw new AppError(400, 'Invalid stage');
    if (b.agreementStart && b.agreementEnd && b.agreementEnd <= b.agreementStart) {
      throw new AppError(400, 'Agreement end date must be after the start date');
    }
    const numOrKeep = (v: any, fallback: any) =>
      v != null && v !== '' ? Number(v) : fallback ?? null;
    const data: any = {
      stage: b.stage || existing?.stage || 'ONBOARDING',
      contactPerson: String(b.contactPerson ?? existing?.contactPerson ?? ''),
      contactDesignation: String(b.contactDesignation ?? existing?.contactDesignation ?? ''),
      contactPhone: String(b.contactPhone ?? existing?.contactPhone ?? ''),
      contactEmail: String(b.contactEmail ?? existing?.contactEmail ?? ''),
      institutionType: String(b.institutionType ?? existing?.institutionType ?? ''),
      address: String(b.address ?? existing?.address ?? ''),
      city: String(b.city ?? existing?.city ?? ''),
      studentStrength: numOrKeep(b.studentStrength, existing?.studentStrength),
      onboardedOn: b.onboardedOn ?? existing?.onboardedOn ?? null,
      goLiveDate: b.goLiveDate ?? existing?.goLiveDate ?? null,
      engineer: String(b.engineer ?? existing?.engineer ?? ''),
      poReceived: b.poReceived !== undefined ? Boolean(b.poReceived) : Boolean(existing?.poReceived),
      poNumber: String(b.poNumber ?? existing?.poNumber ?? ''),
      poDate: b.poDate ?? existing?.poDate ?? null,
      agreementSigned: b.agreementSigned !== undefined ? Boolean(b.agreementSigned) : Boolean(existing?.agreementSigned),
      agreementYears: numOrKeep(b.agreementYears, existing?.agreementYears),
      agreementStart: b.agreementStart ?? existing?.agreementStart ?? null,
      agreementEnd: b.agreementEnd ?? existing?.agreementEnd ?? null,
      reminderDays: numOrKeep(b.reminderDays, existing?.reminderDays) ?? 90,
      notes: String(b.notes ?? existing?.notes ?? ''),
      poDocumentData: b.poDocumentData ?? existing?.poDocumentData ?? '',
      poFilename: b.poFilename ?? existing?.poFilename ?? '',
      agreementDocumentData: b.agreementDocumentData ?? existing?.agreementDocumentData ?? '',
      agreementFilename: b.agreementFilename ?? existing?.agreementFilename ?? '',
    };
    for (const key of ['poDocumentData', 'agreementDocumentData'] as const) {
      const doc = data[key];
      if (doc && !/^data:(application\/pdf|image\/)/.test(doc)) {
        throw new AppError(400, 'Documents must be a PDF or an image');
      }
      if (doc && doc.length > 11_000_000) {
        throw new AppError(400, 'Documents must be under 8 MB');
      }
    }
    // Auto-compute agreement end from start + years when end not set
    if (data.agreementStart && data.agreementYears && !data.agreementEnd) {
      const d = new Date(data.agreementStart);
      d.setFullYear(d.getFullYear() + data.agreementYears);
      data.agreementEnd = d.toISOString().split('T')[0];
    }
    // Empty date strings -> null
    for (const k of ['onboardedOn', 'goLiveDate', 'poDate', 'agreementStart', 'agreementEnd']) {
      if (!data[k]) data[k] = null;
    }
    const ob = await prisma.clientOnboarding.upsert({
      where: { clientId: client.id },
      create: { ...data, clientId: client.id, organizationId: orgId },
      update: data,
    });
    res.json({
      ...ob,
      poDocumentData: undefined,
      agreementDocumentData: undefined,
      poHasDocument: Boolean(ob.poDocumentData),
      agreementHasDocument: Boolean(ob.agreementDocumentData),
      agreement: agreementInfo(ob),
    });
  },

  async getImplementationDashboard(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const clients = await prisma.incomeClient.findMany({
      where: { organizationId: orgId },
      include: { onboarding: true, features: true },
    });
    const rows = clients.map(c => {
      const ob = c.onboarding;
      const info = agreementInfo(ob);
      return {
        clientId: c.id,
        name: c.name,
        isActive: c.isActive,
        stage: ob?.stage || null,
        engineer: ob?.engineer || '',
        city: ob?.city || '',
        institutionType: ob?.institutionType || '',
        goLiveDate: ob?.goLiveDate || null,
        poReceived: Boolean(ob?.poReceived),
        poNumber: ob?.poNumber || '',
        agreementSigned: Boolean(ob?.agreementSigned),
        agreementLabel: info.label,
        agreementExpired: info.expired,
        agreementExpiring: info.expiring,
        progress: featureProgressOf(c.features),
      };
    });
    const stageCounts: Record<string, number> = {};
    for (const r of rows) {
      const key = r.stage || 'NOT_STARTED';
      stageCounts[key] = (stageCounts[key] || 0) + 1;
    }
    res.json({
      rows: rows.sort((a, b) => b.progress.pct - a.progress.pct || a.name.localeCompare(b.name)),
      stageCounts,
      alerts: {
        poPending: rows.filter(r => r.isActive && !r.poReceived).length,
        agreementPending: rows.filter(r => r.isActive && !r.agreementSigned).length,
        expiring: rows.filter(r => r.agreementExpiring || r.agreementExpired).length,
      },
    });
  },

  // ---- Feature delivery status -------------------------------------------
  async addFeature(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const client = await fetchOrgClient(req.params.clientId, orgId);
    const name = String(req.body.name || '').trim();
    if (!name) throw new AppError(400, 'Enter a feature name');
    const existing = await prisma.featureStatus.findFirst({
      where: { clientId: client.id, name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) throw new AppError(400, `"${name}" is already tracked for this client`);
    const agg = await prisma.featureStatus.aggregate({
      where: { clientId: client.id },
      _max: { order: true },
    });
    const feature = await prisma.featureStatus.create({
      data: {
        clientId: client.id,
        organizationId: orgId,
        name,
        order: (agg._max.order || 0) + 1,
      },
    });
    res.status(201).json(feature);
  },

  async seedFeatures(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const client = await fetchOrgClient(req.params.clientId, orgId);
    const existing = await prisma.featureStatus.findMany({
      where: { clientId: client.id },
      select: { name: true },
    });
    const have = new Set(existing.map(f => f.name.toLowerCase()));
    const toCreate = DEFAULT_FEATURES
      .map((name, idx) => ({ name, order: idx + 1 }))
      .filter(f => !have.has(f.name.toLowerCase()));
    if (toCreate.length) {
      await prisma.featureStatus.createMany({
        data: toCreate.map(f => ({
          clientId: client.id,
          organizationId: orgId,
          name: f.name,
          order: f.order,
        })),
        skipDuplicates: true,
      });
    }
    const features = await prisma.featureStatus.findMany({
      where: { clientId: client.id },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({ created: toCreate.length, features, progress: featureProgressOf(features) });
  },

  async updateFeature(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const feature = await prisma.featureStatus.findFirst({
      where: { id: req.params.featureId, organizationId: orgId },
    });
    if (!feature) throw new AppError(404, 'Feature not found');
    const { status, engineer, remarks } = req.body;
    const data: any = {};
    if (status !== undefined) {
      if (!FEATURE_STATUSES.some(s => s.value === status)) throw new AppError(400, 'Invalid status');
      data.status = status;
      data.completedOn = status === 'LIVE' ? (feature.completedOn || todayStr()) : null;
      if ((status === 'IN_PROGRESS' || status === 'TESTING') && !feature.startedOn) {
        data.startedOn = todayStr();
      }
    }
    if (engineer !== undefined) data.engineer = String(engineer).trim().slice(0, 50);
    if (remarks !== undefined) data.remarks = String(remarks).trim().slice(0, 300);
    const updated = await prisma.featureStatus.update({ where: { id: feature.id }, data });
    const features = await prisma.featureStatus.findMany({ where: { clientId: feature.clientId } });
    res.json({ feature: updated, progress: featureProgressOf(features) });
  },

  async deleteFeature(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const feature = await prisma.featureStatus.findFirst({
      where: { id: req.params.featureId, organizationId: orgId },
    });
    if (!feature) throw new AppError(404, 'Feature not found');
    await prisma.featureStatus.delete({ where: { id: feature.id } });
    const features = await prisma.featureStatus.findMany({ where: { clientId: feature.clientId } });
    res.json({ message: `Removed "${feature.name}"`, progress: featureProgressOf(features) });
  },

  // ---- Export / import ---------------------------------------------------
  async exportCsv(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const billings = await fetchOrgBillings(orgId);
    const esc = (v: any) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'Client', 'Academic Year', 'Period Start', 'Period End', 'Engineer', 'Students', 'Rate', 'One-time',
      'Taxable', 'GST', 'Net', 'Previous Pending', 'Total Due', 'Received',
      'Balance', 'Invoice Status', 'Remarks', 'Next Followup', 'Followup Note', 'Client Active',
    ];
    const lines = [header.join(',')];
    const rows = billings
      .map(b => ({ json: billingJSON(b), isActive: b.client.isActive }))
      .sort((a, b) => a.json.clientName.localeCompare(b.json.clientName) || a.json.yearStart - b.json.yearStart);
    for (const { json: b, isActive } of rows) {
      lines.push([
        esc(b.clientName),
        b.periodType === 'CUSTOM' ? '' : b.academicYear,
        b.periodStart ?? '', b.periodEnd ?? '',
        esc(b.engineer), b.studentCount ?? '',
        b.rate ?? '', b.oneTimePayment ?? 0, b.taxableValue ?? '', b.gstAmount ?? 0,
        b.netAmount ?? 0, b.previousPending ?? 0, b.totalDue, b.received, b.balance,
        b.invoiceStatus, esc(b.remarks), b.nextFollowupDate ?? '', esc(b.followupNote),
        isActive ? 'Yes' : 'No',
      ].join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="aveon-income-${todayStr()}.csv"`);
    res.send('﻿' + lines.join('\n'));
  },

  async importCsv(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const { csv, dryRun = true } = req.body;
    if (!csv || typeof csv !== 'string') throw new AppError(400, 'CSV content is required');

    const parseLine = (line: string): string[] => {
      const out: string[] = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) {
          if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (ch === '"') inQ = false;
          else cur += ch;
        } else if (ch === '"') inQ = true;
        else if (ch === ',') { out.push(cur); cur = ''; }
        else cur += ch;
      }
      out.push(cur);
      return out;
    };

    const lines = csv.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) throw new AppError(400, 'The file has no data rows');
    const header = parseLine(lines[0]).map(h => h.trim().toLowerCase());
    const dataRows = lines.slice(1).map(parseLine);
    res.json(await runIncomeImport(orgId, header, dataRows, Boolean(dryRun)));
  },

  // XLSX import - the workbook arrives as a base64 data URI.
  async importXlsx(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const { fileBase64, dryRun = true } = req.body;
    if (!fileBase64 || typeof fileBase64 !== 'string') {
      throw new AppError(400, 'File content is required');
    }
    const ExcelJS = await import('exceljs');
    const buffer = Buffer.from(fileBase64.replace(/^data:[^,]+,/, ''), 'base64');
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as any);
    } catch {
      throw new AppError(400, 'Could not read the workbook — please upload a valid .xlsx file');
    }
    const ws = wb.worksheets[0];
    if (!ws || ws.rowCount < 2) throw new AppError(400, 'The file has no data rows');

    const cellText = (cell: any): string => {
      const v = cell?.value;
      if (v == null) return '';
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      if (typeof v === 'object') {
        if ((v as any).result != null) return String((v as any).result); // formula
        if ((v as any).text != null) return String((v as any).text); // rich text / link
      }
      return String(v);
    };
    const header: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell: any, colNo: number) => {
      header[colNo - 1] = cellText(cell).trim().toLowerCase();
    });
    const dataRows: string[][] = [];
    ws.eachRow((row: any, rowNo: number) => {
      if (rowNo === 1) return;
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell: any, colNo: number) => {
        cells[colNo - 1] = cellText(cell);
      });
      dataRows.push(Array.from(cells, c => c ?? ''));
    });
    res.json(await runIncomeImport(orgId, header, dataRows, Boolean(dryRun)));
  },

  // Excel export of the full billing sheet
  async exportXlsx(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const billings = await fetchOrgBillings(orgId);
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Income', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'Client', key: 'client', width: 32 },
      { header: 'Academic Year', key: 'year', width: 14 },
      { header: 'Period Start', key: 'pstart', width: 13 },
      { header: 'Period End', key: 'pend', width: 13 },
      { header: 'Engineer', key: 'engineer', width: 16 },
      { header: 'Students', key: 'students', width: 10 },
      { header: 'Rate', key: 'rate', width: 10 },
      { header: 'One-time', key: 'oneTime', width: 12 },
      { header: 'Taxable', key: 'taxable', width: 14 },
      { header: 'GST', key: 'gst', width: 12 },
      { header: 'Net', key: 'net', width: 14 },
      { header: 'Previous Pending', key: 'prev', width: 16 },
      { header: 'Total Due', key: 'due', width: 14 },
      { header: 'Received', key: 'received', width: 14 },
      { header: 'Balance', key: 'balance', width: 14 },
      { header: 'Invoice Status', key: 'status', width: 16 },
      { header: 'Remarks', key: 'remarks', width: 28 },
      { header: 'Next Followup', key: 'followup', width: 14 },
      { header: 'Followup Note', key: 'note', width: 24 },
      { header: 'Client Active', key: 'active', width: 12 },
    ] as any;
    ws.getRow(1).font = { bold: true };
    (ws.getRow(1) as any).fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' },
    };
    const rows = billings
      .map(b => ({ json: billingJSON(b), isActive: b.client.isActive }))
      .sort((a, b) => a.json.clientName.localeCompare(b.json.clientName) || a.json.yearStart - b.json.yearStart);
    for (const { json: b, isActive } of rows) {
      ws.addRow({
        client: b.clientName,
        year: b.periodType === 'CUSTOM' ? '' : b.academicYear,
        pstart: b.periodStart ?? '', pend: b.periodEnd ?? '',
        engineer: b.engineer,
        students: b.studentCount ?? '', rate: b.rate ?? '', oneTime: b.oneTimePayment ?? 0,
        taxable: b.taxableValue ?? '', gst: b.gstAmount ?? 0, net: b.netAmount ?? 0,
        prev: b.previousPending ?? 0, due: b.totalDue, received: b.received,
        balance: b.balance, status: b.invoiceStatus, remarks: b.remarks,
        followup: b.nextFollowupDate ?? '', note: b.followupNote,
        active: isActive ? 'Yes' : 'No',
      });
    }
    for (const col of ['rate', 'oneTime', 'taxable', 'gst', 'net', 'prev', 'due', 'received', 'balance']) {
      ws.getColumn(col).numFmt = '#,##0.00';
    }
    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="aveon-income-${todayStr()}.xlsx"`);
    res.send(Buffer.from(buffer as any));
  },
};

// Shared import core for the CSV and XLSX entry points.
async function runIncomeImport(orgId: string, header: string[], dataRows: string[][], dryRun: boolean) {
    const col = (name: string) => header.findIndex(h => (h || '').includes(name));
    const ci = {
      client: col('client'), year: col('year'), students: col('student'),
      rate: col('rate'), engineer: col('engineer'), prev: col('previous'),
      received: col('received'), status: col('invoice'),
      pstart: col('period start'), pend: col('period end'),
    };
    if (ci.client < 0 || (ci.year < 0 && (ci.pstart < 0 || ci.pend < 0))) {
      throw new AppError(400, 'Columns "Client" plus either "Academic Year" or "Period Start"/"Period End" are required');
    }
    // Accepts ISO dates and the Indian DD-MM-YYYY convention.
    const asIsoDate = (raw: string): string | null => {
      const v = (raw || '').trim();
      if (DATE_RE.test(v)) return v;
      const m = v.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
      return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
    };

    const existingClients = await prisma.incomeClient.findMany({
      where: { organizationId: orgId },
      include: { billings: { select: { academicYear: true } } },
    });
    const clientByName = new Map(existingClients.map(c => [c.name.toLowerCase(), c]));
    const billingYears = new Map(
      existingClients.map(c => [c.id, new Set(c.billings.map(b => b.academicYear))])
    );

    const preview: any[] = [];
    let clientsCreated = 0, billingsCreated = 0, skipped = 0, errors = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const cells = dataRows[i];
      const name = (cells[ci.client] || '').trim();
      const yearRaw = ci.year >= 0 ? (cells[ci.year] || '').trim() : '';
      const pStart = ci.pstart >= 0 ? asIsoDate(cells[ci.pstart] || '') : null;
      const pEnd = ci.pend >= 0 ? asIsoDate(cells[ci.pend] || '') : null;
      if (!name || (!yearRaw && !(pStart && pEnd))) continue;

      // Custom contract period wins when both dates are present.
      let year: string;
      let period: { periodType: string; periodStart: string | null; periodEnd: string | null };
      if (pStart && pEnd) {
        if (pEnd <= pStart) {
          preview.push({ row: i + 2, client: name, year: `${pStart}→${pEnd}`, action: 'error: period end before start' });
          errors++;
          continue;
        }
        year = pStart;
        period = { periodType: 'CUSTOM', periodStart: pStart, periodEnd: pEnd };
      } else {
        try {
          year = normalizeAcademicYear(yearRaw);
        } catch {
          preview.push({ row: i + 2, client: name, year: yearRaw, action: 'error: bad year format' });
          errors++;
          continue;
        }
        period = { periodType: 'ACADEMIC', periodStart: null, periodEnd: null };
      }
      let client = clientByName.get(name.toLowerCase());
      const dupBilling = client && billingYears.get(client.id)?.has(year);
      if (dupBilling) {
        preview.push({ row: i + 2, client: name, year, action: 'skip (already exists)' });
        skipped++;
        continue;
      }
      const willCreateClient = !client;
      preview.push({
        row: i + 2, client: name, year,
        action: willCreateClient ? 'create client + billing' : 'create billing',
      });

      if (!dryRun) {
        if (!client) {
          client = await prisma.incomeClient.create({
            data: { organizationId: orgId, name },
            include: { billings: { select: { academicYear: true } } },
          }) as any;
          clientByName.set(name.toLowerCase(), client!);
          billingYears.set(client!.id, new Set());
          clientsCreated++;
        }
        const num = (idx: number) => {
          const v = idx >= 0 ? String(cells[idx] || '').replace(/[₹,\s]/g, '') : '';
          return v && !isNaN(Number(v)) ? Number(v) : null;
        };
        const fields = computeBillingFields({
          academicYear: year,
          ...period,
          studentCount: num(ci.students),
          rate: num(ci.rate),
          oneTimePayment: 0, overrideAmounts: false,
          taxableValue: null, gstAmount: 0, netAmount: 0,
          previousPending: num(ci.prev) || 0,
          engineer: ci.engineer >= 0 ? (cells[ci.engineer] || '').trim() : '',
          invoiceStatus: '', remarks: 'Imported', nextFollowupDate: null, followupNote: '',
        });
        const billing = await prisma.clientBilling.create({
          data: { ...fields, clientId: client!.id, organizationId: orgId },
        });
        billingYears.get(client!.id)!.add(year);
        billingsCreated++;
        const opening = num(ci.received);
        if (opening && opening > 0) {
          await prisma.paymentReceipt.create({
            data: {
              billingId: billing.id, clientId: client!.id, organizationId: orgId,
              amount: round2(opening), receivedOn: null,
              mode: '', note: 'Imported opening figure',
            },
          });
        }
      } else {
        if (willCreateClient) {
          clientsCreated++;
          // Track so later rows for the same new client count as "create billing"
          clientByName.set(name.toLowerCase(), { id: `pending_${name}` } as any);
          billingYears.set(`pending_${name}`, new Set([year]));
        } else {
          billingYears.get(client!.id)?.add(year);
        }
        billingsCreated++;
      }
    }

    return {
      dryRun,
      preview: preview.slice(0, 100),
      summary: { clientsCreated, billingsCreated, skipped, errors },
    };
}
