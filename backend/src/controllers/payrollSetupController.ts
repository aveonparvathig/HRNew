import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { diffFields, fieldLabel, logPayrollAudit } from '../services/payroll/audit';
import {
  INDIAN_STATES, DEDUCTOR_TYPES, PAN_PATTERN, TAN_PATTERN,
} from '../services/payroll/constants';

const str = (v: any) => String(v ?? '').trim();

const PROFILE_TEXT_FIELDS = [
  'pfCode', 'esiCode', 'ptRegistrationNo', 'lwfRegistrationNo',
  'shopsRegistrationNo', 'labourIdNumber', 'natureOfBusiness', 'managerName',
  'tdsCircleAddress',
  'responsibleName', 'responsibleDesignation', 'responsibleAddress',
  'responsibleEmail', 'responsiblePhone',
  'form16SignatoryName', 'form16SignatoryFatherName',
  'form16SignatoryDesignation', 'form16SigningPlace',
];
const PROFILE_FIELDS = [
  'panNumber', 'tanNumber', 'responsiblePan', 'deductorType', ...PROFILE_TEXT_FIELDS,
];

async function profileFor(organizationId: string) {
  return prisma.orgStatutoryProfile.upsert({
    where: { organizationId },
    create: { organizationId },
    update: {},
  });
}

const locationJSON = (l: any) => ({
  id: l.id, name: l.name, city: l.city, state: l.state, isActive: l.isActive,
  employeeCount: l._count?.people ?? 0,
});

async function fetchOrgLocation(id: string, organizationId: string) {
  const location = await prisma.workLocation.findFirst({ where: { id, organizationId } });
  if (!location) throw new AppError(404, 'Work location not found');
  return location;
}

function locationInput(b: any) {
  const name = str(b.name);
  if (!name) throw new AppError(400, 'Location name is required');
  const state = str(b.state);
  if (!INDIAN_STATES.includes(state)) throw new AppError(400, 'Pick a state from the list');
  return { name, city: str(b.city), state };
}

async function assertUniqueLocationName(organizationId: string, name: string, excludeId?: string) {
  const dup = await prisma.workLocation.findFirst({
    where: {
      organizationId,
      name: { equals: name, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (dup) throw new AppError(400, `A location named "${dup.name}" already exists`);
}

export const payrollSetupController = {
  // ---- Company statutory profile ------------------------------------------
  async getStatutoryProfile(req: any, res: Response) {
    res.json({
      profile: await profileFor(req.user?.organizationId),
      deductorTypes: DEDUCTOR_TYPES,
    });
  },

  async updateStatutoryProfile(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const before = await profileFor(orgId);
    const b = req.body;
    const data: any = {};

    const idFields: [string, RegExp, string][] = [
      ['panNumber', PAN_PATTERN, 'Company PAN must look like ABCDE1234F'],
      ['tanNumber', TAN_PATTERN, 'TAN must look like ABCD12345E'],
      ['responsiblePan', PAN_PATTERN, 'Responsible person PAN must look like ABCDE1234F'],
    ];
    for (const [field, pattern, message] of idFields) {
      if (b[field] === undefined) continue;
      const value = str(b[field]).toUpperCase();
      if (value && !pattern.test(value)) throw new AppError(400, message);
      data[field] = value;
    }
    if (b.deductorType !== undefined) {
      const value = str(b.deductorType);
      if (value && !DEDUCTOR_TYPES.includes(value)) throw new AppError(400, 'Pick a deductor type from the list');
      data.deductorType = value;
    }
    for (const field of PROFILE_TEXT_FIELDS) {
      if (b[field] !== undefined) data[field] = str(b[field]);
    }

    const profile = await prisma.orgStatutoryProfile.update({
      where: { organizationId: orgId },
      data,
    });
    await logPayrollAudit(req, diffFields(before, profile, PROFILE_FIELDS)
      .map(c => ({ action: 'STATUTORY_PROFILE_UPDATED' as const, ...c })));
    res.json({ profile, deductorTypes: DEDUCTOR_TYPES });
  },

  // ---- Work locations -----------------------------------------------------
  async getLocations(req: any, res: Response) {
    const locations = await prisma.workLocation.findMany({
      where: { organizationId: req.user?.organizationId },
      include: { _count: { select: { people: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ locations: locations.map(locationJSON), states: INDIAN_STATES });
  },

  async createLocation(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const input = locationInput(req.body);
    await assertUniqueLocationName(orgId, input.name);
    const location = await prisma.workLocation.create({
      data: { organizationId: orgId, ...input },
    });
    await logPayrollAudit(req, [{
      action: 'LOCATION_CREATED', field: location.name, newValue: `${location.city ? location.city + ', ' : ''}${location.state}`,
    }]);
    res.status(201).json(locationJSON(location));
  },

  async updateLocation(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const before = await fetchOrgLocation(req.params.locationId, orgId);
    const input = locationInput({ ...before, ...req.body });
    await assertUniqueLocationName(orgId, input.name, before.id);
    const location = await prisma.workLocation.update({
      where: { id: before.id },
      data: {
        ...input,
        ...(req.body.isActive !== undefined ? { isActive: Boolean(req.body.isActive) } : {}),
      },
      include: { _count: { select: { people: true } } },
    });
    await logPayrollAudit(req, diffFields(before, location, ['name', 'city', 'state', 'isActive'])
      .map(c => ({
        action: 'LOCATION_UPDATED' as const,
        field: `${before.name} · ${c.field}`, oldValue: c.oldValue, newValue: c.newValue,
      })));
    res.json(locationJSON(location));
  },

  async deleteLocation(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const location = await fetchOrgLocation(req.params.locationId, orgId);
    const assigned = await prisma.person.count({ where: { workLocationId: location.id } });
    if (assigned > 0) {
      throw new AppError(400, `${assigned} ${assigned === 1 ? 'person is' : 'people are'} assigned to this location. Move them first, or mark it inactive.`);
    }
    await prisma.workLocation.delete({ where: { id: location.id } });
    await logPayrollAudit(req, [{ action: 'LOCATION_DELETED', field: location.name, oldValue: location.state }]);
    res.json({ message: `Deleted ${location.name}` });
  },

  // ---- Audit log ----------------------------------------------------------
  async getAuditLog(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const where: any = { organizationId: orgId };
    if (req.query.runId) where.runId = String(req.query.runId);
    const [rows, total] = await Promise.all([
      prisma.payrollAuditLog.findMany({
        where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset,
      }),
      prisma.payrollAuditLog.count({ where }),
    ]);
    res.json({ rows: rows.map(r => ({ ...r, fieldLabel: fieldLabel(r.field) })), total, limit, offset });
  },
};
