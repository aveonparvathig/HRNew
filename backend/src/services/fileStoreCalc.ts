// Where uploaded files are kept: in the database, or in object storage
// that speaks the S3 interface (Amazon S3, Cloudflare R2, Backblaze B2,
// DigitalOcean Spaces, MinIO). Pure, DB-independent.

export const STORAGE_PROVIDERS = [
  { value: 'DB', label: 'In the database', hint: 'Nothing to set up. Fine for a few thousand documents.' },
  { value: 'S3', label: 'In object storage (S3-compatible)', hint: 'Amazon S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces or MinIO. Keeps the database small.' },
] as const;
export type StorageProvider = 'DB' | 'S3';
export const isProvider = (v: any): v is StorageProvider => v === 'DB' || v === 'S3';

export interface StorageSettingsLike {
  provider: string;
  endpoint: string; // '' = Amazon S3 itself
  region: string;
  bucket: string;
  accessKeyId: string;
  secretEnc: string;
  prefix: string; // a folder inside the bucket, '' = none
  forcePathStyle: boolean;
}

// The parts of the settings that say where a stored file is. Files kept
// in the bucket hold only their key, so these cannot change under them.
export const PLACE_FIELDS = ['endpoint', 'region', 'bucket'] as const;

const LOCAL = ['localhost', '127.0.0.1', '[::1]'];

// The address of the storage service, tidied — or what is wrong with it.
// Plain http is taken only for a service on the same machine.
export function endpointInput(value: any): { endpoint: string } | string {
  const raw = String(value ?? '').trim();
  if (!raw) return { endpoint: '' };
  let url: URL;
  try { url = new URL(raw); } catch { return 'The endpoint is a web address starting with https://'; }
  if (url.username || url.password) return 'Leave the access key out of the endpoint address';
  if (url.search || url.hash) return 'The endpoint is only the address of the service, with nothing after a ? or #';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL.includes(url.hostname))) {
    return 'The endpoint has to start with https://';
  }
  return { endpoint: `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}` };
}

// A folder inside the bucket: "hr/documents". No leading or trailing
// slash, nothing that climbs out of it.
export function prefixInput(value: any): { prefix: string } | string {
  const prefix = String(value ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  if (!prefix) return { prefix: '' };
  if (prefix.length > 100) return 'Keep the folder under 100 characters';
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(prefix) || prefix.split('/').some(part => part === '..' || part === '.')) {
    return 'The folder may hold letters, digits, hyphens, underscores, dots and /';
  }
  return { prefix };
}

// The settings as typed, checked field by field. Only what was sent is
// returned; the secret key is handled by the caller.
export function storageInput(b: any): string | Partial<Omit<StorageSettingsLike, 'secretEnc'>> {
  const out: Partial<Omit<StorageSettingsLike, 'secretEnc'>> = {};
  if (b?.provider !== undefined) {
    if (!isProvider(b.provider)) return 'Pick where files are kept';
    out.provider = b.provider;
  }
  if (b?.endpoint !== undefined) {
    const endpoint = endpointInput(b.endpoint);
    if (typeof endpoint === 'string') return endpoint;
    out.endpoint = endpoint.endpoint;
  }
  if (b?.region !== undefined) {
    const region = String(b.region ?? '').trim().toLowerCase();
    if (region && !/^[a-z0-9-]{2,40}$/.test(region)) return 'The region looks like ap-south-1 (or auto)';
    out.region = region;
  }
  if (b?.bucket !== undefined) {
    const bucket = String(b.bucket ?? '').trim();
    if (bucket && !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
      return 'A bucket name is 3 to 63 small letters, digits, hyphens or dots';
    }
    out.bucket = bucket;
  }
  if (b?.accessKeyId !== undefined) {
    const accessKeyId = String(b.accessKeyId ?? '').trim();
    if (/\s/.test(accessKeyId) || accessKeyId.length > 200) return 'The access key ID has no spaces in it';
    out.accessKeyId = accessKeyId;
  }
  if (b?.prefix !== undefined) {
    const prefix = prefixInput(b.prefix);
    if (typeof prefix === 'string') return prefix;
    out.prefix = prefix.prefix;
  }
  if (b?.forcePathStyle !== undefined) out.forcePathStyle = Boolean(b.forcePathStyle);
  return out;
}

// What is missing before files can go to object storage, or null.
export function storageProblem(s: StorageSettingsLike, secretReadable: boolean): string | null {
  if (!s.bucket) return 'The bucket is not set';
  if (!s.endpoint && !s.region) return 'Give the region of the bucket, or the endpoint of the storage service';
  if (!s.accessKeyId) return 'The access key ID is not set';
  if (!s.secretEnc) return 'The secret access key is not set';
  if (!secretReadable) return 'The saved secret access key can no longer be read. Type it in again.';
  return null;
}

// The region to sign requests for: as given, else "auto", which the
// services with their own endpoint accept.
export const regionOf = (s: Pick<StorageSettingsLike, 'region'>) => s.region || 'auto';

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
};

// Where one file goes in the bucket. The name says nothing about the
// employee: the company, the person and the file are ids.
export function objectKey(prefix: string, organizationId: string, personId: string, id: string, mimeType: string): string {
  const safe = (v: string) => String(v).replace(/[^A-Za-z0-9_-]/g, '');
  return `${prefix ? `${prefix}/` : ''}employee-documents/${safe(organizationId)}/${safe(personId)}/${safe(id)}.${EXTENSIONS[mimeType] || 'bin'}`;
}

// A file between its two forms: the data URI the API speaks and the bytes a bucket holds.
export function bytesOfDataUri(dataUri: string): { mimeType: string; bytes: Buffer } {
  const comma = dataUri.indexOf(',');
  const mimeType = /^data:([^;,]+)/.exec(dataUri.slice(0, Math.max(0, comma)))?.[1] || 'application/octet-stream';
  return { mimeType, bytes: Buffer.from(dataUri.slice(comma + 1), 'base64') };
}
export const dataUriOf = (mimeType: string, bytes: Uint8Array) =>
  `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;

// A failure from the storage service, in words HR can act on.
export function storageFailure(err: any): string {
  const code = String(err?.name || err?.Code || err?.code || '');
  const detail = `${code} ${err?.message || ''}`;
  if (/NoSuchBucket/.test(detail)) return 'The bucket does not exist: check its name and the region';
  if (/InvalidAccessKeyId|SignatureDoesNotMatch|InvalidToken|Unauthorized|\b401\b/.test(detail)) return 'The access key ID or the secret access key was not accepted';
  if (/AccessDenied|Forbidden|\b403\b/.test(detail)) return 'The key is not allowed to read and write in this bucket';
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|EHOSTUNREACH|ECONNRESET/.test(detail)) return 'Could not reach the storage service: check the endpoint';
  if (/Timeout|ETIMEDOUT|timed out/i.test(detail)) return 'The storage service did not answer in time';
  if (/PermanentRedirect|AuthorizationHeaderMalformed|IllegalLocationConstraint/.test(detail)) return 'The bucket is in another region: check the region';
  return String(err?.message || 'The storage service refused the request').slice(0, 200);
}
