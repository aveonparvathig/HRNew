// Where the company keeps its uploaded files: the database, or its own
// object storage. A Super Admin's setting.
import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { actorName, logPayrollAudit } from '../services/payroll/audit';
import { PLACE_FIELDS, STORAGE_PROVIDERS, storageInput } from '../services/fileStoreCalc';
import {
  moveFiles, problemOf, seal, storageSettingsFor, storageSettingsJSON, storageUsage, testStorage,
} from '../services/fileStore';
import { sizeLabel } from '../services/documentCalc';

const PROVIDER_LABEL: Record<string, string> = { DB: 'the database', S3: 'object storage' };

// The settings as they would be with what was typed, secret included.
async function typedSettings(organizationId: string, b: any) {
  const before = await storageSettingsFor(organizationId);
  const input = storageInput(b);
  if (typeof input === 'string') throw new AppError(400, input);
  const data: any = { ...input };
  // The secret is write-only: blank keeps the one already saved
  if (typeof b?.secretAccessKey === 'string' && b.secretAccessKey.trim()) data.secretEnc = seal(b.secretAccessKey.trim());
  return { before, data, next: { ...before, ...data } };
}

async function summary(organizationId: string) {
  const [settings, usage] = await Promise.all([storageSettingsFor(organizationId), storageUsage(organizationId)]);
  const target = settings.provider === 'S3' ? 'S3' : 'DB';
  const elsewhere = target === 'S3' ? usage.DB : usage.S3;
  return {
    settings: storageSettingsJSON(settings), providers: STORAGE_PROVIDERS,
    problem: settings.provider === 'S3' ? problemOf(settings) : null,
    usage: {
      DB: { ...usage.DB, label: sizeLabel(usage.DB.bytes) }, S3: { ...usage.S3, label: sizeLabel(usage.S3.bytes) },
    },
    // Files still in the place the setting no longer points to
    toMove: elsewhere.files,
  };
}

export const storageController = {
  async getSettings(req: any, res: Response) {
    res.json(await summary(req.user?.organizationId));
  },

  // Object storage is switched on only after a file has been written to
  // the bucket, read back and removed with the details given.
  async updateSettings(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const { before, data, next } = await typedSettings(organizationId, req.body);
    const usage = await storageUsage(organizationId);
    // Files in the bucket are found by their key alone: the bucket cannot change under them
    const moved = PLACE_FIELDS.filter(f => before[f] !== next[f]);
    if (usage.S3.files > 0 && moved.length > 0) {
      throw new AppError(400, `${usage.S3.files} ${usage.S3.files === 1 ? 'file is' : 'files are'} kept in the present bucket. Switch to the database and move them there first, then change the bucket.`);
    }
    if (next.provider === 'S3') {
      const failure = await testStorage(next);
      if (failure) throw new AppError(400, `Object storage was not switched on: ${failure}.`);
    }
    await prisma.storageSettings.upsert({
      where: { organizationId },
      create: { organizationId, ...data, updatedByName: await actorName(req.user?.userId) },
      update: { ...data, updatedByName: await actorName(req.user?.userId) },
    });
    const changed = (['provider', 'endpoint', 'region', 'bucket', 'accessKeyId', 'prefix', 'forcePathStyle'] as const)
      .filter(f => before[f] !== next[f])
      .map(f => ({ action: 'STORAGE_SETTINGS_UPDATED' as const, field: f as string, oldValue: String(before[f]), newValue: String(next[f]) }));
    // The secret itself is never written to the log
    if (before.secretEnc !== next.secretEnc) changed.push({ action: 'STORAGE_SETTINGS_UPDATED' as const, field: 'secretAccessKey', oldValue: '', newValue: 'changed' });
    await logPayrollAudit(req, changed);
    res.json({
      ...(await summary(organizationId)),
      message: next.provider === 'S3'
        ? 'Saved. New files go to object storage.'
        : 'Saved. New files are kept in the database.',
    });
  },

  // Try the details as typed, without saving them.
  async testSettings(req: any, res: Response) {
    const { next } = await typedSettings(req.user?.organizationId, req.body);
    const failure = await testStorage(next);
    res.json({ ok: !failure, error: failure || '', message: failure ? '' : `A test file was written to ${next.bucket}, read back and removed.` });
  },

  // Move a batch of the files that are not where the setting says. The
  // screen calls this until nothing remains.
  async move(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const result = await moveFiles(organizationId);
    if (result.moved > 0) {
      await logPayrollAudit(req, [{
        action: 'STORAGE_SETTINGS_UPDATED', field: 'Files moved', newValue: `${result.moved} to ${PROVIDER_LABEL[result.target]}`,
      }]);
    }
    res.json({ ...result, ...(await summary(organizationId)) });
  },
};
