// Income-tax declarations in the database: the item catalogue, one
// employee's declaration for a year, proofs, and the printable Form 12BB.
// Used both by HR (any employee) and by employees (their own).
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { orgBrand } from '../orgBrand';
import { financialYearFor, periodsOfFinancialYear } from './financialYear';
import {
  DEFAULT_DECLARATION_ITEMS, declarationTotals, dueControlChanges, itemsMissingProof, lineDeduction, rentNeedsLandlordPan,
  cleanLandlords, landlordProblem, cleanRentByMonth, selfEditState, LandlordLike,
} from './declarationCalc';
import { FIXED_EARNINGS } from './lines';
import { MANAGED_CODES } from './payComponents';
import { todayIST } from './loanLedger';
import { PAN_FORMAT, hasValidPan } from './taxCalc';
import { esc, inr, reportShell } from './reportHtml';

const str = (v: any) => String(v ?? '').trim();
const r2 = (n: number) => Math.round(n * 100) / 100;
const REGIMES = ['NEW', 'OLD'];
const PROOF_KINDS = ['ITEM', 'RENT', 'HOUSING_LOAN', 'PREVIOUS_EMPLOYER'];
const MAX_PROOF_BYTES = 4 * 1024 * 1024; // of the data URI
const PROFILE_AMOUNTS = ['prevEmployerIncome', 'prevEmployerTds', 'otherIncome', 'annualRentPaid', 'housingLoanInterest'];
// Fixed pay components an exemption rule can be put on. HRA has its own
// rule; basic and DA are never exempt.
const EXEMPTIBLE_FIXED = ['transportAllowance', 'foodAllowance', 'internetAllowance'];
// Managed components that can still carry a rule
const EXEMPTIBLE_MANAGED = ['LEAVE_ENCASHMENT'];

// The pay components an exemption rule can be put on: the fixed
// allowances, and taxable earnings from the catalogue.
export async function exemptibleComponents(organizationId: string) {
  const catalogue = await prisma.payComponent.findMany({
    where: { organizationId, type: 'EARNING', taxable: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return [
    ...FIXED_EARNINGS.filter(c => EXEMPTIBLE_FIXED.includes(c.key)).map(c => ({ key: c.key, label: c.label, isActive: true })),
    ...catalogue
      .filter(c => !MANAGED_CODES.includes(c.code) || EXEMPTIBLE_MANAGED.includes(c.code))
      .map(c => ({ key: `c:${c.id}`, label: c.name, isActive: c.isActive })),
  ];
}

export async function declarationItemsFor(organizationId: string) {
  const count = await prisma.declarationItem.count({ where: { organizationId } });
  if (count === 0) {
    await prisma.declarationItem.createMany({
      data: DEFAULT_DECLARATION_ITEMS.map(([code, name, section, sectionNew, group, maxAmount, deductPercent], i) => ({
        organizationId, code, name, section, sectionNew, group, maxAmount, deductPercent, sortOrder: i,
      })),
      skipDuplicates: true,
    });
  }
  return prisma.declarationItem.findMany({ where: { organizationId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
}

// The year's declaration control. Its one-off dates are acted on here,
// the first time the control is read after they come due.
export async function yearControlFor(organizationId: string, fyStart: number) {
  const control = await prisma.taxYearControl.upsert({
    where: { organizationId_fyStart: { organizationId, fyStart } },
    create: { organizationId, fyStart },
    update: {},
  });
  const patch = dueControlChanges(control, todayIST());
  if (!patch) return control;
  const label = `FY ${financialYearFor(fyStart).label}`;
  await prisma.payrollAuditLog.createMany({
    data: [
      ...(patch.declarationOpen === false ? [{ field: `${label} · Declaration window open`, oldValue: 'Yes', newValue: `No (closed after ${control.declarationLockOn})` }] : []),
      ...(patch.proofOpen === true ? [{ field: `${label} · Proof submission open`, oldValue: 'No', newValue: `Yes (from ${control.proofOpenFrom})` }] : []),
    ].map(row => ({ organizationId, userId: null, userName: 'Automatic', action: 'DECLARATION_WINDOW_CHANGED', ...row })),
  });
  return prisma.taxYearControl.update({ where: { organizationId_fyStart: { organizationId, fyStart } }, data: patch });
}

// Count of proofs attached per declaration item of a profile.
async function proofCounts(profileId: string) {
  const rows = await prisma.declarationProof.groupBy({ by: ['itemId'], where: { profileId, kind: 'ITEM' }, _count: true });
  return new Map(rows.map(r => [r.itemId || '', r._count]));
}

async function profileFor(organizationId: string, personId: string, fyStart: number) {
  // Never another organization's employee, whatever id the request carries
  const person = await prisma.person.findFirst({ where: { id: personId, organizationId }, select: { id: true } });
  if (!person) throw new AppError(404, 'Person not found');
  return prisma.employeeTaxProfile.upsert({
    where: { personId_fyStart: { personId, fyStart } },
    create: { organizationId, personId, fyStart },
    update: {},
    include: {
      lines: true,
      proofs: { select: { id: true, kind: true, itemId: true, fileName: true, uploadedBy: true, createdAt: true } },
      reopenRequests: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  });
}

// One employee's declaration for a year, with every active item listed
// (declared or not) and the totals the tax computation will use.
export async function loadDeclaration(organizationId: string, personId: string, fyStart: number) {
  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId },
    select: { id: true, name: true, employeeNo: true, designation: true, panNumber: true, address: true },
  });
  if (!person) throw new AppError(404, 'Person not found');
  const [items, profile, control, settings, components] = await Promise.all([
    declarationItemsFor(organizationId),
    profileFor(organizationId, personId, fyStart),
    yearControlFor(organizationId, fyStart),
    prisma.payrollSettings.upsert({ where: { organizationId }, create: { organizationId }, update: {} }),
    exemptibleComponents(organizationId),
  ]);
  const componentLabel = new Map(components.map(c => [c.key, c.label]));
  const lineByItem = new Map(profile.lines.map(l => [l.itemId, l]));
  const shown = items.filter(i => i.isActive || lineByItem.has(i.id));
  const lines = shown.map(item => {
    const line = lineByItem.get(item.id);
    const row = { itemId: item.id, declaredAmount: line?.declaredAmount ?? 0, approvedAmount: line?.approvedAmount ?? null };
    return {
      ...row, remarks: line?.remarks ?? '',
      name: item.name, section: item.section, sectionNew: item.sectionNew, group: item.group,
      maxAmount: item.maxAmount, deductPercent: item.deductPercent, proofRequired: item.proofRequired,
      limitPeriod: item.limitPeriod, itemRegime: item.regime,
      componentLabel: item.group === 'EXEMPTION' ? componentLabel.get(item.componentKey) || '' : '',
      allowed: lineDeduction(row, item, profile.poiConsidered),
      proofs: profile.proofs.filter(p => p.kind === 'ITEM' && p.itemId === item.id),
    };
  });
  const totals = declarationTotals(profile.lines, items, profile.poiConsidered);
  const { lines: _lines, proofs, reopenRequests, ...header } = profile;
  const landlords = cleanLandlords(header.landlords);
  return {
    person: { ...person, hasValidPan: hasValidPan(person.panNumber) },
    fyStart, financialYear: financialYearFor(fyStart).label,
    periods: periodsOfFinancialYear(fyStart),
    profile: {
      ...header,
      // One landlord kept the old way still shows as a row
      landlords: landlords.length ? landlords
        : header.landlordName || header.landlordPan ? [{ name: header.landlordName, pan: header.landlordPan, address: '', rent: header.annualRentPaid }] : [],
    },
    // What the employee may do with it themselves
    self: selfEditState(header, control),
    reopenRequests,
    regime: header.regime || settings.defaultTaxRegime,
    defaultTaxRegime: settings.defaultTaxRegime,
    lines, totals,
    otherProofs: proofs.filter(p => p.kind !== 'ITEM'),
    control,
  };
}

export interface SaveOptions {
  bySelf: boolean; // the employee is saving their own declaration
}

// Save the declared side of a declaration. An employee may do so only
// while the window is open, and may change regime only if allowed.
export async function saveDeclaration(organizationId: string, personId: string, fyStart: number, b: any, opts: SaveOptions) {
  const [items, profile, control] = await Promise.all([
    declarationItemsFor(organizationId),
    profileFor(organizationId, personId, fyStart),
    yearControlFor(organizationId, fyStart),
  ]);
  if (opts.bySelf) {
    const self = selfEditState(profile, control);
    if (!self.canEdit) throw new AppError(403, self.why);
  }

  const data: any = {};
  if (b.regime !== undefined && (!opts.bySelf || control.employeeCanChooseRegime)) {
    if (b.regime !== '' && !REGIMES.includes(b.regime)) throw new AppError(400, 'Pick the old or the new regime');
    data.regime = b.regime;
  }
  for (const f of PROFILE_AMOUNTS) {
    if (b[f] === undefined) continue;
    const v = Number(b[f] || 0);
    if (!isFinite(v) || v < 0) throw new AppError(400, 'Amounts cannot be negative');
    data[f] = r2(v);
  }
  if (b.isMetro !== undefined) data.isMetro = Boolean(b.isMetro);
  if (b.landlordName !== undefined) data.landlordName = str(b.landlordName);
  if (b.landlordPan !== undefined) {
    const pan = str(b.landlordPan).toUpperCase();
    if (pan && !PAN_FORMAT.test(pan)) throw new AppError(400, 'Landlord PAN must look like ABCDE1234F');
    data.landlordPan = pan;
  }
  // A year's rent typed on its own replaces any month-wise rent kept earlier
  if (b.annualRentPaid !== undefined && b.rentByMonth === undefined && profile.rentByMonth) data.rentByMonth = Prisma.DbNull;
  // Rent month by month: the year's rent is then its total
  if (b.rentByMonth !== undefined) {
    const months = cleanRentByMonth(b.rentByMonth, periodsOfFinancialYear(fyStart));
    if (typeof months === 'string') throw new AppError(400, months);
    data.rentByMonth = months ?? Prisma.DbNull;
    if (months) data.annualRentPaid = r2(Object.values(months).reduce((s, v) => s + v, 0));
  }
  // Up to four landlords; the first is the one the single-landlord fields carry
  if (b.landlords !== undefined) {
    const landlords: LandlordLike[] = cleanLandlords(b.landlords);
    const problem = landlordProblem(landlords, data.annualRentPaid ?? profile.annualRentPaid);
    if (problem) throw new AppError(400, problem);
    data.landlords = landlords.length ? landlords : Prisma.DbNull;
    data.landlordName = landlords[0]?.name || '';
    data.landlordPan = landlords[0]?.pan || '';
  }
  if (b.lenderName !== undefined) data.lenderName = str(b.lenderName).slice(0, 120);
  if (b.lenderAddress !== undefined) data.lenderAddress = str(b.lenderAddress).slice(0, 300);
  if (b.lenderPan !== undefined) {
    const pan = str(b.lenderPan).toUpperCase();
    if (pan && !PAN_FORMAT.test(pan)) throw new AppError(400, 'The lender’s PAN must look like ABCDE1234F');
    data.lenderPan = pan;
  }
  const rent = data.annualRentPaid ?? profile.annualRentPaid;
  const landlordPan = data.landlordPan ?? profile.landlordPan;
  const landlordName = data.landlordName ?? profile.landlordName;
  if (rent > 0 && !landlordName) throw new AppError(400, 'Enter the landlord’s name for the rent declared');
  if (rentNeedsLandlordPan(rent) && !landlordPan) {
    throw new AppError(400, 'The landlord’s PAN is required when the year’s rent is above ₹1,00,000');
  }
  if (opts.bySelf) data.submittedAt = new Date();

  const itemIds = new Set(items.map(i => i.id));
  const lineWrites: any[] = [];
  if (b.lines !== undefined) {
    if (!Array.isArray(b.lines)) throw new AppError(400, 'Lines must be a list');
    // While proofs are being taken, an employee's amount on an item that
    // needs a proof must have one attached
    if (opts.bySelf && control.proofOpen) {
      const missing = itemsMissingProof(
        b.lines.map((l: any) => ({ itemId: str(l?.itemId), amount: Number(l?.declaredAmount || 0) })), items, await proofCounts(profile.id),
      );
      if (missing.length) throw new AppError(400, `Attach a proof for: ${missing.join(', ')}. Then save again.`);
    }
    for (const raw of b.lines) {
      const itemId = str(raw?.itemId);
      if (!itemIds.has(itemId)) throw new AppError(400, 'Unknown declaration item');
      const declaredAmount = Number(raw.declaredAmount || 0);
      if (!isFinite(declaredAmount) || declaredAmount < 0) throw new AppError(400, 'Amounts cannot be negative');
      lineWrites.push(prisma.declarationLine.upsert({
        where: { profileId_itemId: { profileId: profile.id, itemId } },
        create: { profileId: profile.id, itemId, declaredAmount: r2(declaredAmount), remarks: str(raw.remarks) },
        update: { declaredAmount: r2(declaredAmount), remarks: str(raw.remarks) },
      }));
    }
  }
  await prisma.$transaction([
    prisma.employeeTaxProfile.update({ where: { id: profile.id }, data }),
    ...lineWrites,
    // A line with nothing declared, nothing approved and no proof is noise
    prisma.declarationLine.deleteMany({ where: { profileId: profile.id, declaredAmount: 0, approvedAmount: null } }),
  ]);
  return { before: profile };
}

// HR's side: approved amounts against proofs, and whether tax should now
// use them.
export async function saveApproval(organizationId: string, personId: string, fyStart: number, b: any) {
  const [items, profile] = await Promise.all([
    declarationItemsFor(organizationId),
    profileFor(organizationId, personId, fyStart),
  ]);
  const itemIds = new Set(items.map(i => i.id));
  const amount = (v: any): number | null => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    if (!isFinite(n) || n < 0) throw new AppError(400, 'Approved amounts cannot be negative');
    return r2(n);
  };
  // An amount cannot be approved on an item that needs a proof and has none
  const unproved = itemsMissingProof(
    (Array.isArray(b.lines) ? b.lines : []).map((l: any) => ({ itemId: str(l?.itemId), amount: amount(l?.approvedAmount) || 0 })),
    items, await proofCounts(profile.id),
  );
  if (unproved.length) throw new AppError(400, `No proof is attached for: ${unproved.join(', ')}. Attach one, or leave the approved amount blank.`);
  const writes: any[] = [];
  for (const raw of Array.isArray(b.lines) ? b.lines : []) {
    const itemId = str(raw?.itemId);
    if (!itemIds.has(itemId)) throw new AppError(400, 'Unknown declaration item');
    const approvedAmount = amount(raw.approvedAmount);
    writes.push(prisma.declarationLine.upsert({
      where: { profileId_itemId: { profileId: profile.id, itemId } },
      create: { profileId: profile.id, itemId, approvedAmount },
      update: { approvedAmount },
    }));
  }
  const data: any = {};
  if (b.rentApproved !== undefined) data.rentApproved = amount(b.rentApproved);
  if (b.housingInterestApproved !== undefined) data.housingInterestApproved = amount(b.housingInterestApproved);
  if (b.poiConsidered !== undefined) data.poiConsidered = Boolean(b.poiConsidered);
  await prisma.$transaction([
    prisma.employeeTaxProfile.update({ where: { id: profile.id }, data }),
    ...writes,
    prisma.declarationLine.deleteMany({ where: { profileId: profile.id, declaredAmount: 0, approvedAmount: null } }),
  ]);
  return { before: profile };
}

const reviewHeader = (organizationId: string, personId: string, fyStart: number) => Promise.all([
  prisma.person.findFirst({ where: { id: personId, organizationId }, select: { id: true, name: true } }),
  profileFor(organizationId, personId, fyStart),
  yearControlFor(organizationId, fyStart),
]);

// The employee (or HR for them) hands the declaration in. From then on
// the employee cannot change it.
export async function submitDeclaration(organizationId: string, personId: string, fyStart: number, opts: SaveOptions) {
  const [person, profile, control] = await reviewHeader(organizationId, personId, fyStart);
  if (!person) throw new AppError(404, 'Person not found');
  if (profile.status !== 'DRAFT') throw new AppError(400, 'This declaration has already been submitted');
  if (opts.bySelf) {
    const self = selfEditState(profile, control);
    if (!self.canEdit) throw new AppError(403, self.why);
  }
  await prisma.employeeTaxProfile.update({
    where: { id: profile.id },
    data: { status: 'SUBMITTED', submittedAt: new Date(), editGranted: false, reviewedAt: null, reviewedBy: '' },
  });
  return person;
}

// HR's verdict on a submitted declaration: reviewed, or back to the
// employee to correct (which they may do even with the window closed).
export async function reviewDeclaration(
  organizationId: string, personId: string, fyStart: number, action: string, by: string,
) {
  const [person, profile] = await reviewHeader(organizationId, personId, fyStart);
  if (!person) throw new AppError(404, 'Person not found');
  if (action === 'REVIEW') {
    if (profile.status !== 'SUBMITTED') throw new AppError(400, 'Only a submitted declaration can be marked as reviewed');
    await prisma.employeeTaxProfile.update({
      where: { id: profile.id }, data: { status: 'REVIEWED', reviewedAt: new Date(), reviewedBy: by },
    });
  } else if (action === 'SEND_BACK') {
    if (profile.status === 'DRAFT') throw new AppError(400, 'This declaration is already with the employee');
    await prisma.$transaction([
      prisma.employeeTaxProfile.update({
        where: { id: profile.id }, data: { status: 'DRAFT', editGranted: true, reviewedAt: null, reviewedBy: '' },
      }),
      // Sending it back answers any request to reopen it
      prisma.declarationReopenRequest.updateMany({
        where: { profileId: profile.id, status: 'PENDING' },
        data: { status: 'APPROVED', decidedBy: by, decidedAt: new Date() },
      }),
    ]);
  } else {
    throw new AppError(400, 'Pick what to do with the declaration');
  }
  return person;
}

// An employee who can no longer change their declaration asks HR to reopen it.
export async function requestReopen(organizationId: string, personId: string, fyStart: number, reason: string) {
  const [person, profile, control] = await reviewHeader(organizationId, personId, fyStart);
  if (!person) throw new AppError(404, 'Person not found');
  if (selfEditState(profile, control).canEdit) throw new AppError(400, 'You can already change this declaration');
  const text = str(reason).slice(0, 500);
  if (!text) throw new AppError(400, 'Say what you need to change');
  if (profile.reopenRequests.some(r => r.status === 'PENDING')) throw new AppError(400, 'Your earlier request is still waiting for HR');
  await prisma.declarationReopenRequest.create({ data: { organizationId, profileId: profile.id, reason: text } });
  return person;
}

// HR decides a reopen request. Approving puts the declaration back to
// draft for the employee.
export async function decideReopen(organizationId: string, requestId: string, approve: boolean, note: string, by: string) {
  const request = await prisma.declarationReopenRequest.findFirst({
    where: { id: requestId, organizationId },
    include: { profile: { select: { id: true, personId: true, fyStart: true, person: { select: { name: true } } } } },
  });
  if (!request) throw new AppError(404, 'Request not found');
  if (request.status !== 'PENDING') throw new AppError(400, 'This request has already been decided');
  await prisma.$transaction([
    prisma.declarationReopenRequest.update({
      where: { id: request.id },
      data: { status: approve ? 'APPROVED' : 'DECLINED', decidedBy: by, decidedAt: new Date(), decisionNote: str(note).slice(0, 500) },
    }),
    ...(approve ? [prisma.employeeTaxProfile.update({
      where: { id: request.profile.id }, data: { status: 'DRAFT', editGranted: true, reviewedAt: null, reviewedBy: '' },
    })] : []),
  ]);
  return request;
}

// Requests to reopen a declaration that HR has not decided yet.
export async function pendingReopenRequests(organizationId: string, fyStart?: number) {
  const rows = await prisma.declarationReopenRequest.findMany({
    where: { organizationId, status: 'PENDING', ...(fyStart ? { profile: { fyStart } } : {}) },
    include: { profile: { select: { personId: true, fyStart: true, status: true, person: { select: { name: true, employeeNo: true } } } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(r => ({
    id: r.id, reason: r.reason, createdAt: r.createdAt, fyStart: r.profile.fyStart,
    financialYear: financialYearFor(r.profile.fyStart).label, declarationStatus: r.profile.status,
    person: { id: r.profile.personId, name: r.profile.person.name, employeeNo: r.profile.person.employeeNo },
  }));
}

export async function addProof(
  organizationId: string, personId: string, fyStart: number, b: any, opts: SaveOptions & { uploadedBy: string },
) {
  const [profile, control] = await Promise.all([
    profileFor(organizationId, personId, fyStart),
    yearControlFor(organizationId, fyStart),
  ]);
  if (opts.bySelf && !control.proofOpen) throw new AppError(403, 'Proof submission is not open yet.');
  const kind = str(b.kind);
  if (!PROOF_KINDS.includes(kind)) throw new AppError(400, 'Pick what the proof is for');
  let itemId: string | null = null;
  if (kind === 'ITEM') {
    const item = await prisma.declarationItem.findFirst({ where: { id: str(b.itemId), organizationId } });
    if (!item) throw new AppError(400, 'Unknown declaration item');
    itemId = item.id;
  }
  const fileName = str(b.fileName).slice(0, 200);
  const fileData = String(b.fileData || '');
  if (!fileName || !/^data:(application\/pdf|image\/(png|jpe?g|webp));base64,/.test(fileData)) {
    throw new AppError(400, 'Attach a PDF or an image (PNG, JPG)');
  }
  if (fileData.length > MAX_PROOF_BYTES) throw new AppError(400, 'The file is too large. Keep each proof under 3 MB.');
  const proof = await prisma.declarationProof.create({
    data: { profileId: profile.id, kind, itemId, fileName, fileData, uploadedBy: opts.uploadedBy },
    select: { id: true, kind: true, itemId: true, fileName: true, uploadedBy: true, createdAt: true },
  });
  return proof;
}

// A proof with its file, checked to belong to the organization (and, for
// self-service, to the employee).
export async function fetchProof(organizationId: string, proofId: string, onlyPersonId?: string) {
  const proof = await prisma.declarationProof.findFirst({
    where: {
      id: proofId,
      profile: { organizationId, ...(onlyPersonId ? { personId: onlyPersonId } : {}) },
    },
    include: { profile: { select: { personId: true, fyStart: true } } },
  });
  if (!proof) throw new AppError(404, 'Proof not found');
  return proof;
}

export async function removeProof(organizationId: string, proofId: string, opts: SaveOptions & { personId?: string }) {
  const proof = await fetchProof(organizationId, proofId, opts.bySelf ? opts.personId : undefined);
  if (opts.bySelf) {
    const control = await yearControlFor(organizationId, proof.profile.fyStart);
    if (!control.proofOpen) throw new AppError(403, 'Proof submission is closed.');
  }
  await prisma.declarationProof.delete({ where: { id: proof.id } });
  return proof;
}

// Form 12BB: the employee's statement of claims for tax deduction.
export async function buildForm12bb(organizationId: string, personId: string, fyStart: number) {
  const d = await loadDeclaration(organizationId, personId, fyStart);
  const p = d.profile;
  const claimed = d.lines.filter(l => l.declaredAmount > 0);
  const group = (key: string) => claimed.filter(l => l.group === key);
  const deductions = [...group('SECTION_80C'), ...group('OTHER')];
  const others = claimed.filter(l => !['SECTION_80C', 'OTHER'].includes(l.group));
  const blank = '<span class="muted">—</span>';
  const landlordRows = p.landlords.length > 1
    ? `<tr><th>Landlord</th><th>PAN</th><th>Address</th><th class="amt">Rent</th></tr>
      ${p.landlords.map(l => `<tr><td>${esc(l.name)}</td><td>${esc(l.pan) || blank}</td><td>${esc(l.address) || blank}</td><td class="amt">${inr(l.rent)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="3">Rent paid in the year</td><td class="amt">${inr(p.annualRentPaid)}</td></tr>`
    : `<tr><td>Rent paid to the landlord</td><td class="amt">${inr(p.annualRentPaid)}</td></tr>
    <tr><td>Name of the landlord</td><td>${esc(p.landlordName) || blank}</td></tr>
    <tr><td>Address of the landlord</td><td>${esc(p.landlords[0]?.address) || blank}</td></tr>
    <tr><td>PAN of the landlord</td><td>${esc(p.landlordPan) || blank}</td></tr>`;
  const rows = (list: typeof claimed) => list.map(l => `<tr>
      <td>${esc(l.section)}${l.sectionNew ? ` <span class="muted">(${esc(l.sectionNew)})</span>` : ''}</td><td>${esc(l.name)}</td>
      <td class="amt">${inr(l.declaredAmount)}</td><td>${l.proofs.length ? `${l.proofs.length} attached` : '<span class="muted">—</span>'}</td></tr>`).join('');
  const html = reportShell(await orgBrand(organizationId), 'Form 12BB', `Statement of claims for deduction of tax · FY ${d.financialYear}`, `
  <table class="st-table" style="width:auto;min-width:70%;">
    <tr><th colspan="2">Employee</th></tr>
    <tr><td>Name</td><td>${esc(d.person.name)}${d.person.employeeNo ? ` (${esc(d.person.employeeNo)})` : ''}</td></tr>
    <tr><td>Address</td><td>${esc(d.person.address) || '<span class="muted">—</span>'}</td></tr>
    <tr><td>PAN</td><td>${esc(d.person.panNumber) || '<span class="muted">not on record</span>'}</td></tr>
    <tr><td>Financial year</td><td>${esc(d.financialYear)}</td></tr>
  </table>
  <div class="st-h">1. House Rent Allowance</div>
  <table class="st-table" style="width:auto;min-width:70%;">
    ${landlordRows}
  </table>
  <div class="st-h">2. Interest on housing loan</div>
  <table class="st-table" style="width:auto;min-width:70%;">
    <tr><td>Interest payable or paid to the lender</td><td class="amt">${inr(p.housingLoanInterest)}</td></tr>
    <tr><td>Name of the lender</td><td>${esc(p.lenderName) || blank}</td></tr>
    <tr><td>Address of the lender</td><td>${esc(p.lenderAddress) || blank}</td></tr>
    <tr><td>PAN of the lender</td><td>${esc(p.lenderPan) || blank}</td></tr>
  </table>
  <div class="st-h">3. Deductions under Chapter VI-A</div>
  <table class="st-table">
    <tr><th>Section</th><th>Particulars</th><th class="amt">Amount</th><th>Evidence</th></tr>
    ${rows(group('SECTION_80C'))}
    ${rows(group('OTHER'))}
    ${deductions.length ? '' : '<tr><td colspan="4">No deductions claimed.</td></tr>'}
    <tr class="tot"><td colspan="2">Total claimed</td><td class="amt">${inr(r2(deductions.reduce((s, l) => s + l.declaredAmount, 0)))}</td><td></td></tr>
  </table>
  ${others.length ? `<div class="st-h">4. Other income, exempt allowances and tax paid elsewhere</div>
  <table class="st-table">
    <tr><th>Head</th><th>Particulars</th><th class="amt">Amount</th><th>Evidence</th></tr>
    ${rows(others)}
  </table>` : ''}
  <div style="margin-top:28px;font-size:12.5px;">
    <p><strong>Verification</strong></p>
    <p>I, ${esc(d.person.name)}, do hereby certify that the information given above is complete and correct.</p>
    <div style="display:flex;justify-content:space-between;margin-top:40px;">
      <div>Place: ____________________<br/>Date: ____________________</div>
      <div style="text-align:right;">____________________________<br/>Signature of the employee${d.person.designation ? `<br/>${esc(d.person.designation)}` : ''}</div>
    </div>
  </div>`);
  return { html, title: `Form 12BB — ${d.person.name} — FY ${d.financialYear}` };
}
