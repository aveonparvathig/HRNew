// What an employee can see and do for themselves. Every query here is
// scoped to the Person linked to the login; nothing takes a person id
// from the request.
import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { actorPerson } from '../middleware/roles';
import { orgBrand } from '../services/orgBrand';
import { renderPayslipHtml } from '../services/payrollCalc';
import { loanBalanceAfter } from '../services/payroll/loanLedger';
import { financialYearFor, financialYearOf } from '../services/payroll/financialYear';
import { currentPeriodIST } from '../services/payroll/salaryStructure';
import {
  loadDeclaration, saveDeclaration, addProof, fetchProof, removeProof, buildForm12bb,
} from '../services/payroll/declarations';
import { claimsOfEntry } from '../services/payroll/payout';
import { buildTaxStatement } from './payrollTaxController';
import { buildYtdStatement } from './payrollReportsController';
import { buildLoanStatement, loansOfPerson } from './payrollLoansController';
import { buildForm16, buildForm12ba } from './payrollReturnsController';
import { yearControlFor } from '../services/payroll/declarations';

// Form 16 is for the employee only once HR has released the year's.
async function assertForm16Released(organizationId: string, fyStart: number) {
  const control = await yearControlFor(organizationId, fyStart);
  if (!control.form16Released) {
    throw new AppError(404, `Form 16 for FY ${financialYearFor(fyStart).label} has not been issued yet.`);
  }
}

const currentFyStart = () => financialYearOf(currentPeriodIST()).startYear;

function fyInput(value: any): number {
  if (value === undefined || value === null || value === '') return currentFyStart();
  const year = Number(/^(\d{4})/.exec(String(value))?.[1]);
  if (!year || year < 2000 || year > 2100) throw new AppError(400, 'Pick a financial year');
  return year;
}

const yearOptions = () => {
  const now = currentFyStart();
  return [now + 1, now, now - 1].map(y => ({ startYear: y, label: financialYearFor(y).label }));
};

// Payslips an employee may see: finalized and released by HR. A salary on
// hold stays hidden until the hold is released.
const released = { status: 'FINALIZED', releasedAt: { not: null } };
const notHeld = { payStatus: 'PAY' };

export const selfServiceController = {
  async getPayslips(req: any, res: Response) {
    const me = await actorPerson(req);
    const entries = await prisma.payslipEntry.findMany({
      where: { organizationId: me.organizationId, personId: me.id, run: released, ...notHeld },
      include: { run: { select: { period: true } } },
      orderBy: { run: { period: 'desc' } },
    });
    res.json({
      financialYears: yearOptions(),
      entries: entries.map(e => ({
        id: e.id, period: e.run.period, payDays: e.payDays, totalWorkingDays: e.totalWorkingDays,
        grossSalary: e.grossSalary, totalDeductions: e.totalDeductions, netPayable: e.netPayable,
      })),
    });
  },

  async getPayslip(req: any, res: Response) {
    const me = await actorPerson(req);
    const entry = await prisma.payslipEntry.findFirst({
      where: { id: req.params.entryId, organizationId: me.organizationId, personId: me.id, run: released, ...notHeld },
      include: { run: true, person: true, lines: true },
    });
    if (!entry) throw new AppError(404, 'Payslip not found');
    const brand = await orgBrand(me.organizationId);
    const withLoan = {
      ...entry,
      loanBalanceAfter: await loanBalanceAfter(me.organizationId, entry, entry.run.period),
      claims: entry.reimbursement > 0 ? await claimsOfEntry(entry.id) : [],
    };
    res.json({
      id: entry.id, period: entry.run.period, personName: entry.person.name,
      html: renderPayslipHtml(brand, entry.run, withLoan, entry.person),
    });
  },

  // ---- Declaration ------------------------------------------------------------
  async getDeclaration(req: any, res: Response) {
    const me = await actorPerson(req);
    const d = await loadDeclaration(me.organizationId, me.id, fyInput(req.query.fy));
    res.json({ ...d, financialYears: yearOptions() });
  },

  async saveDeclaration(req: any, res: Response) {
    const me = await actorPerson(req);
    const fyStart = fyInput(req.body.fyStart);
    await saveDeclaration(me.organizationId, me.id, fyStart, req.body, { bySelf: true });
    const d = await loadDeclaration(me.organizationId, me.id, fyStart);
    res.json({ ...d, financialYears: yearOptions() });
  },

  async addProof(req: any, res: Response) {
    const me = await actorPerson(req);
    const proof = await addProof(me.organizationId, me.id, fyInput(req.body.fyStart), req.body, {
      bySelf: true, uploadedBy: me.name,
    });
    res.status(201).json(proof);
  },

  async getProof(req: any, res: Response) {
    const me = await actorPerson(req);
    const proof = await fetchProof(me.organizationId, req.params.proofId, me.id);
    res.json({ fileName: proof.fileName, fileData: proof.fileData });
  },

  async deleteProof(req: any, res: Response) {
    const me = await actorPerson(req);
    await removeProof(me.organizationId, req.params.proofId, { bySelf: true, personId: me.id });
    res.json({ message: 'Proof removed' });
  },

  // ---- Loans --------------------------------------------------------------------
  async getLoans(req: any, res: Response) {
    const me = await actorPerson(req);
    res.json({ loans: await loansOfPerson(me.organizationId, me.id) });
  },

  // Part A of the employee's own Form 16, as uploaded by HR.
  async getForm16PartA(req: any, res: Response) {
    const me = await actorPerson(req);
    const fyStart = fyInput(req.query.fy);
    await assertForm16Released(me.organizationId, fyStart);
    const doc = await prisma.form16PartA.findFirst({ where: { personId: me.id, organizationId: me.organizationId, fyStart } });
    if (!doc) throw new AppError(404, 'Part A is not available yet');
    res.json({ fileName: doc.fileName, fileData: doc.fileData });
  },

  // ---- Own reports ----------------------------------------------------------------
  // kind: tax-statement | form-12bb | ytd-statement | loan-statement | form-16 | form-12ba
  async getReport(req: any, res: Response) {
    const me = await actorPerson(req);
    const fyStart = fyInput(req.query.fy);
    switch (req.params.kind) {
      case 'tax-statement':
        return res.json(await buildTaxStatement(me.organizationId, me.id, fyStart, true));
      case 'form-12bb':
        return res.json(await buildForm12bb(me.organizationId, me.id, fyStart));
      case 'ytd-statement':
        return res.json(await buildYtdStatement(me.organizationId, me.id, fyStart, true));
      case 'loan-statement':
        return res.json(await buildLoanStatement(me.organizationId, String(req.query.loanId || ''), me.id));
      case 'form-16': {
        await assertForm16Released(me.organizationId, fyStart);
        const partA = await prisma.form16PartA.count({ where: { personId: me.id, fyStart } });
        return res.json({ ...(await buildForm16(me.organizationId, me.id, fyStart)), partA: partA > 0, fyStart });
      }
      case 'form-12ba':
        await assertForm16Released(me.organizationId, fyStart);
        return res.json(await buildForm12ba(me.organizationId, me.id, fyStart));
      default:
        throw new AppError(404, 'Report not found');
    }
  },
};
