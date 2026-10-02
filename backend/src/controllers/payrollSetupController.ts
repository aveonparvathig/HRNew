import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { diffFields, fieldLabel, logPayrollAudit } from '../services/payroll/audit';
import {
  INDIAN_STATES, DEDUCTOR_TYPES, PAN_PATTERN, TAN_PATTERN,
} from '../services/payroll/constants';
import {
  IMAGE_DATA_URI, MAX_SIGNATURE_CHARS, cleanGstin, gstinDetails, isValidGstin,
} from '../services/masters';

const str = (v: any) => String(v ?? '').trim();

const PROFILE_TEXT_FIELDS = [
  'pfCode', 'esiCode', 'ptRegistrationNo', 'lwfRegistrationNo',
  'shopsRegistrationNo', 'labourIdNumber', 'natureOfBusiness', 'managerName',
  'tdsCircleAddress',
  'responsibleName', 'responsibleDesignation', 'responsibleAddress',
  'responsibleEmail', 'responsiblePhone',
  'form16SignatoryName', 'form16SignatoryFatherName',
  'form16SignatoryDesignation', 'form16SigningPlace',
  'deductorFlat', 'deductorBuilding', 'deductorStreet', 'deductorArea', 'deductorCity',
  'responsibleFlat', 'responsibleBuilding', 'responsibleStreet', 'responsibleArea', 'responsibleCity',
];
// Addresses for the TDS return: a state from the list, a six-digit PIN code
const ADDRESS_STATES = ['deductorState', 'responsibleState'];
const ADDRESS_PINS = ['deductorPin', 'responsiblePin'];
const ADDRESS_FLAGS = ['deductorAddressChanged', 'responsibleAddressChanged'];
const PROFILE_FIELDS = [
  'panNumber', 'tanNumber', 'gstNumber', 'responsiblePan', 'deductorType', ...PROFILE_TEXT_FIELDS,
  ...ADDRESS_STATES, ...ADDRESS_PINS, ...ADDRESS_FLAGS,
];

// The profile as the screens get it, with what the GST number says
async function profileJSON(profile: any) {
  const org = await prisma.organization.findUnique({ where: { id: profile.organizationId }, select: { state: true } });
  return {
    profile,
    deductorTypes: DEDUCTOR_TYPES,
    states: INDIAN_STATES,
    gst: gstinDetails(profile.gstNumber, { state: org?.state || '', pan: profile.panNumber }),
  };
}

async function profileFor(organizationId: string) {
  return prisma.orgStatutoryProfile.upsert({
    where: { organizationId },
    create: { organizationId },
    update: {},
  });
}

const locationJSON = (l: any) => ({
  id: l.id, name: l.name, city: l.city, state: l.state, isActive: l.isActive, excludeFromPt: l.excludeFromPt,
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
  return { name, city: str(b.city).replace(/\s+/g, ' '), state, excludeFromPt: Boolean(b.excludeFromPt) };
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
    res.json(await profileJSON(await profileFor(req.user?.organizationId)));
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
    if (b.gstNumber !== undefined) {
      const value = cleanGstin(b.gstNumber);
      if (value && value !== before.gstNumber && !isValidGstin(value)) {
        throw new AppError(400, 'That is not a valid GST number. It has 15 characters, such as 33ABCDE1234F1Z5, and the last one is a check character.');
      }
      data.gstNumber = value;
    }
    if (b.form16SignatureData !== undefined) {
      const image = String(b.form16SignatureData || '');
      if (image && !IMAGE_DATA_URI.test(image)) throw new AppError(400, 'The signature must be a PNG or JPG image');
      if (image.length > MAX_SIGNATURE_CHARS) throw new AppError(400, 'The signature image is too large. Use a smaller picture.');
      data.form16SignatureData = image;
    }
    if (b.deductorType !== undefined) {
      const value = str(b.deductorType);
      if (value && !DEDUCTOR_TYPES.includes(value)) throw new AppError(400, 'Pick a deductor type from the list');
      data.deductorType = value;
    }
    for (const field of PROFILE_TEXT_FIELDS) {
      if (b[field] !== undefined) data[field] = str(b[field]);
    }
    for (const field of ADDRESS_STATES) {
      if (b[field] === undefined) continue;
      const value = str(b[field]);
      if (value && !INDIAN_STATES.includes(value)) throw new AppError(400, 'Pick a state from the list');
      data[field] = value;
    }
    for (const field of ADDRESS_PINS) {
      if (b[field] === undefined) continue;
      const value = str(b[field]);
      if (value && !/^[1-9]\d{5}$/.test(value)) throw new AppError(400, 'A PIN code has six digits');
      data[field] = value;
    }
    for (const field of ADDRESS_FLAGS) if (b[field] !== undefined) data[field] = Boolean(b[field]);

    const profile = await prisma.orgStatutoryProfile.update({
      where: { organizationId: orgId },
      data,
    });
    await logPayrollAudit(req, [
      ...diffFields(before, profile, PROFILE_FIELDS).map(c => ({ action: 'STATUTORY_PROFILE_UPDATED' as const, ...c })),
      // The image itself is not written to the log
      ...(before.form16SignatureData !== profile.form16SignatureData ? [{
        action: 'STATUTORY_PROFILE_UPDATED' as const, field: 'Form 16 signature image',
        newValue: profile.form16SignatureData ? 'Uploaded' : 'Removed',
      }] : []),
    ]);
    res.json(await profileJSON(profile));
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
    await logPayrollAudit(req, diffFields(before, location, ['name', 'city', 'state', 'isActive', 'excludeFromPt'])
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
    // Months already paid print the location an employee was at then
    const inHistory = await prisma.positionChange.count({ where: { workLocationId: location.id } });
    if (inHistory > 0) {
      throw new AppError(400, 'Employees were at this location earlier and their position history says so. Mark it inactive instead.');
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
