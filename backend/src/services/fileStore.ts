// Uploaded files, wherever the company keeps them: in the database or in
// its object storage. Each file's row says where that file is, so
// changing the setting never strands a file already stored.
import { randomUUID } from 'crypto';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { seal, unseal } from './secretBox';
import {
  StorageSettingsLike, bytesOfDataUri, dataUriOf, objectKey, regionOf, storageFailure, storageProblem,
} from './fileStoreCalc';

export { seal };

const EMPTY: StorageSettingsLike = {
  provider: 'DB', endpoint: '', region: '', bucket: '', accessKeyId: '', secretEnc: '', prefix: '', forcePathStyle: false,
};

export async function storageSettingsFor(organizationId: string): Promise<StorageSettingsLike & { updatedByName?: string; updatedAt?: Date }> {
  return (await prisma.storageSettings.findUnique({ where: { organizationId } })) || { ...EMPTY };
}

// Everything but the secret key, which is never sent back.
export const storageSettingsJSON = (s: StorageSettingsLike) => ({
  provider: s.provider, endpoint: s.endpoint, region: s.region, bucket: s.bucket, accessKeyId: s.accessKeyId,
  prefix: s.prefix, forcePathStyle: s.forcePathStyle, hasSecret: Boolean(s.secretEnc),
});

export const problemOf = (s: StorageSettingsLike) => storageProblem(s, Boolean(unseal(s.secretEnc)));

function clientFor(s: StorageSettingsLike) {
  return new S3Client({
    region: regionOf(s),
    endpoint: s.endpoint || undefined,
    forcePathStyle: s.forcePathStyle,
    credentials: { accessKeyId: s.accessKeyId, secretAccessKey: unseal(s.secretEnc) },
    maxAttempts: 2,
    requestHandler: { requestTimeout: 30_000, connectionTimeout: 8_000 } as any,
    // Checksums only where the service asks for them: not every
    // S3-compatible service takes the newer ones
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

async function put(s: StorageSettingsLike, key: string, mimeType: string, bytes: Uint8Array) {
  await clientFor(s).send(new PutObjectCommand({ Bucket: s.bucket, Key: key, Body: bytes, ContentType: mimeType }));
}

async function get(s: StorageSettingsLike, key: string): Promise<Uint8Array> {
  const res = await clientFor(s).send(new GetObjectCommand({ Bucket: s.bucket, Key: key }));
  if (!res.Body) throw new Error('The file came back empty');
  return res.Body.transformToByteArray();
}

async function remove(s: StorageSettingsLike, key: string) {
  await clientFor(s).send(new DeleteObjectCommand({ Bucket: s.bucket, Key: key }));
}

// Write a small file, read it back and remove it: proof that the key can
// do all three in this bucket. Returns what went wrong, or null.
export async function testStorage(s: StorageSettingsLike): Promise<string | null> {
  const problem = problemOf(s);
  if (problem) return problem;
  const key = `${s.prefix ? `${s.prefix}/` : ''}connection-test-${randomUUID()}.txt`;
  const probe = Buffer.from(`Aveon HR storage test ${new Date().toISOString()}`);
  try {
    await put(s, key, 'text/plain', probe);
    const back = Buffer.from(await get(s, key));
    await remove(s, key);
    return back.equals(probe) ? null : 'The file read back from the bucket is not the file that was written';
  } catch (err) {
    return storageFailure(err);
  }
}

export interface StoredFile {
  storage: string;
  storageKey: string;
  fileData: string;
}

// Keep a new file where the company's setting says. In object storage the
// row holds only the key; a failure there is reported, not quietly
// turned into a file in the database.
export async function saveFile(
  organizationId: string, personId: string, mimeType: string, dataUri: string,
): Promise<StoredFile> {
  const s = await storageSettingsFor(organizationId);
  if (s.provider !== 'S3') return { storage: 'DB', storageKey: '', fileData: dataUri };
  const problem = problemOf(s);
  if (problem) throw new AppError(400, `File storage is not ready: ${problem}. A Super Admin can fix it in Company Settings → File Storage.`);
  const key = objectKey(s.prefix, organizationId, personId, randomUUID(), mimeType);
  try {
    await put(s, key, mimeType, bytesOfDataUri(dataUri).bytes);
  } catch (err) {
    throw new AppError(502, `The file could not be stored: ${storageFailure(err)}`);
  }
  return { storage: 'S3', storageKey: key, fileData: '' };
}

// A stored file as the data URI the screens open.
export async function loadFile(organizationId: string, file: StoredFile & { mimeType: string }): Promise<string> {
  if (file.storage !== 'S3') return file.fileData;
  const s = await storageSettingsFor(organizationId);
  try {
    return dataUriOf(file.mimeType, await get(s, file.storageKey));
  } catch (err) {
    throw new AppError(502, `The file could not be fetched: ${storageFailure(err)}`);
  }
}

// Remove a file's object from the bucket. The row is the caller's. A
// failure is returned, not thrown: the row may still go, leaving an
// object nobody points to rather than a row that cannot be deleted.
export async function removeStored(organizationId: string, files: Pick<StoredFile, 'storage' | 'storageKey'>[]): Promise<string | null> {
  const kept = files.filter(f => f.storage === 'S3' && f.storageKey);
  if (kept.length === 0) return null;
  const s = await storageSettingsFor(organizationId);
  let failure: string | null = null;
  for (const f of kept) {
    try { await remove(s, f.storageKey); } catch (err) { failure = storageFailure(err); }
  }
  return failure;
}

// How much is kept where.
export async function storageUsage(organizationId: string) {
  const groups = await prisma.employeeDocument.groupBy({
    by: ['storage'], where: { organizationId }, _count: true, _sum: { sizeBytes: true },
  });
  const of = (storage: string) => {
    const g = groups.find(x => x.storage === storage);
    return { files: g?._count || 0, bytes: g?._sum.sizeBytes || 0 };
  };
  return { DB: of('DB'), S3: of('S3') };
}

// Move files that are not where the setting now says, a few at a time so
// one request never runs long. Each file is written to the new place and
// its row repointed before the old copy is removed, so a failure midway
// leaves the file where it was.
export async function moveFiles(organizationId: string, limit = 15) {
  const s = await storageSettingsFor(organizationId);
  const target = s.provider === 'S3' ? 'S3' : 'DB';
  if (target === 'S3') {
    const problem = problemOf(s);
    if (problem) throw new AppError(400, problem);
  }
  const where = { organizationId, storage: { not: target } };
  const rows = await prisma.employeeDocument.findMany({
    where, take: limit, orderBy: { createdAt: 'asc' },
    select: { id: true, personId: true, mimeType: true, storage: true, storageKey: true, fileData: true, title: true },
  });
  let moved = 0;
  const failed: { title: string; reason: string }[] = [];
  for (const row of rows) {
    try {
      if (target === 'S3') {
        const key = objectKey(s.prefix, organizationId, row.personId, randomUUID(), row.mimeType);
        await put(s, key, row.mimeType, bytesOfDataUri(row.fileData).bytes);
        await prisma.employeeDocument.update({ where: { id: row.id }, data: { storage: 'S3', storageKey: key, fileData: '' } });
      } else {
        const fileData = dataUriOf(row.mimeType, await get(s, row.storageKey));
        await prisma.employeeDocument.update({ where: { id: row.id }, data: { storage: 'DB', storageKey: '', fileData } });
        await remove(s, row.storageKey).catch(() => { /* the file is safe in the database; the object is an orphan */ });
      }
      moved++;
    } catch (err) {
      failed.push({ title: row.title, reason: storageFailure(err) });
    }
  }
  const remaining = await prisma.employeeDocument.count({ where });
  return { target, moved, failed, remaining };
}
