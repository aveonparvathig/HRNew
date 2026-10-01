// Income-tax declarations in the database: the item catalogue, one
// employee's declaration for a year, proofs, and the printable Form 12BB.
// Used both by HR (any employee) and by employees (their own).
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { orgBrand } from '../orgBrand';
import { financialYearFor } from './financialYear';
import {
  DEFAULT_DECLARATION_ITEMS, declarationTotals, lineDeduction, rentNeedsLandlordPan,
} from './declarationCalc';
import { PAN_FORMAT, hasValidPan } from './taxCalc';
import { esc, inr, reportShell } from './reportHtml';

const str = (v: any) => String(v ?? '').trim();
const r2 = (n: number) => Math.round(n * 100) / 100;
const REGIMES = ['NEW', 'OLD'];
const PROOF_KINDS = ['ITEM', 'RENT', 'HOUSING_LOAN', 'PREVIOUS_EMPLOYER'];
const MAX_PROOF_BYTES = 4 * 1024 * 1024; // of the data URI
const PROFILE_AMOUNTS = ['prevEmployerIncome', 'prevEmployerTds', 'otherIncome', 'annualRentPaid', 'housingLoanInterest'];

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

export async function yearControlFor(organizationId: string, fyStart: number) {
  return prisma.taxYearControl.upsert({
    where: { organizationId_fyStart: { organizationId, fyStart } },
    create: { organizationId, fyStart },
    update: {},
  });
}

async function profileFor(organizationId: string, personId: string, fyStart: number) {
  return prisma.employeeTaxProfile.upsert({
    where: { personId_fyStart: { personId, fyStart } },
    create: { organizationId, personId, fyStart },
    update: {},
    include: { lines: true, proofs: { select: { id: true, kind: true, itemId: true, fileName: true, uploadedBy: true, createdAt: true } } },
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
  const [items, profile, control, settings] = await Promise.all([
    declarationItemsFor(organizationId),
    profileFor(organizationId, personId, fyStart),
    yearControlFor(organizationId, fyStart),
    prisma.payrollSettings.upsert({ where: { organizationId }, create: { organizationId }, update: {} }),
  ]);
  const lineByItem = new Map(profile.lines.map(l => [l.itemId, l]));
  const shown = items.filter(i => i.isActive || lineByItem.has(i.id));
  const lines = shown.map(item => {
    const line = lineByItem.get(item.id);
    const row = { itemId: item.id, declaredAmount: line?.declaredAmount ?? 0, approvedAmount: line?.approvedAmount ?? null };
    return {
      ...row, remarks: line?.remarks ?? '',
      name: item.name, section: item.section, sectionNew: item.sectionNew, group: item.group,
      maxAmount: item.maxAmount, deductPercent: item.deductPercent,
      allowed: lineDeduction(row, item, profile.poiConsidered),
      proofs: profile.proofs.filter(p => p.kind === 'ITEM' && p.itemId === item.id),
    };
  });
  const totals = declarationTotals(profile.lines, items, profile.poiConsidered);
  const { lines: _lines, proofs, ...header } = profile;
  return {
    person: { ...person, hasValidPan: hasValidPan(person.panNumber) },
    fyStart, financialYear: financialYearFor(fyStart).label,
    profile: header,
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
  if (opts.bySelf && !control.declarationOpen) {
    throw new AppError(403, 'The declaration window is closed. Ask HR to open it if you need to make a change.');
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
    <tr><td>Rent paid to the landlord</td><td class="amt">${inr(p.annualRentPaid)}</td></tr>
    <tr><td>Name of the landlord</td><td>${esc(p.landlordName) || '<span class="muted">—</span>'}</td></tr>
    <tr><td>PAN of the landlord</td><td>${esc(p.landlordPan) || '<span class="muted">—</span>'}</td></tr>
  </table>
  <div class="st-h">2. Interest on housing loan</div>
  <table class="st-table" style="width:auto;min-width:70%;">
    <tr><td>Interest payable or paid to the lender</td><td class="amt">${inr(p.housingLoanInterest)}</td></tr>
  </table>
  <div class="st-h">3. Deductions under Chapter VI-A</div>
  <table class="st-table">
    <tr><th>Section</th><th>Particulars</th><th class="amt">Amount</th><th>Evidence</th></tr>
    ${rows(group('SECTION_80C'))}
    ${rows(group('OTHER'))}
    ${claimed.length ? '' : '<tr><td colspan="4">No deductions claimed.</td></tr>'}
    <tr class="tot"><td colspan="2">Total claimed</td><td class="amt">${inr(r2(claimed.reduce((s, l) => s + l.declaredAmount, 0)))}</td><td></td></tr>
  </table>
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
