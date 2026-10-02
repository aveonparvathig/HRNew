// Files kept against an employee: what may be uploaded and how it is
// checked. Pure, DB-independent.
import { cleanLabel } from './masters';

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_TYPES = [
  { mime: 'application/pdf', label: 'PDF', extensions: ['pdf'] },
  { mime: 'image/jpeg', label: 'JPG', extensions: ['jpg', 'jpeg'] },
  { mime: 'image/png', label: 'PNG', extensions: ['png'] },
  { mime: 'image/webp', label: 'WebP', extensions: ['webp'] },
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATA_URI = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/;

// What a file really is, from its first bytes.
export function sniffMime(bytes: Buffer): string | null {
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

// The size in bytes of what a base64 string holds.
export const base64Bytes = (base64: string) =>
  Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);

// A file name safe to keep and to offer for download: no path, no
// control characters, not endless.
export function cleanFileName(name: any): string {
  const base = String(name ?? '').split(/[\\/]/).pop() || '';
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim().slice(0, 150);
}

export interface DocumentInput {
  category: string;
  title: string;
  documentDate: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  fileData: string;
  visibleToEmployee: boolean;
}

// The details of a document as typed (everything but the file).
export function documentDetails(b: any, fallbackTitle = ''): string | Pick<DocumentInput, 'category' | 'title' | 'documentDate' | 'visibleToEmployee'> {
  const category = cleanLabel(b?.category);
  if (!category) return 'Pick a category';
  if (category.length > 120) return 'Keep the category under 120 characters';
  const title = String(b?.title ?? '').trim().replace(/\s+/g, ' ') || fallbackTitle;
  if (!title) return 'Give the document a title';
  if (title.length > 150) return 'Keep the title under 150 characters';
  const date = String(b?.documentDate ?? '').trim();
  if (date && (!DATE.test(date) || isNaN(Date.parse(date)))) return 'Enter a valid date for the document';
  return { category, title, documentDate: date || null, visibleToEmployee: Boolean(b?.visibleToEmployee) };
}

// An upload, checked: a PDF or an image, within the size limit, and
// really the kind of file it says it is.
export function documentInput(b: any): string | DocumentInput {
  const fileName = cleanFileName(b?.fileName);
  if (!fileName) return 'Attach a file';
  const match = DATA_URI.exec(String(b?.fileData ?? ''));
  const type = match && DOCUMENT_TYPES.find(t => t.mime === match[1]);
  if (!match || !type) return 'Attach a PDF or an image (JPG, PNG)';
  const sizeBytes = base64Bytes(match[2]);
  if (sizeBytes === 0) return 'The file is empty';
  if (sizeBytes > MAX_DOCUMENT_BYTES) return 'The file is too large. Keep each document under 5 MB.';
  if (sniffMime(Buffer.from(match[2].slice(0, 64), 'base64')) !== type.mime) {
    return `The file is not a ${type.label}, whatever its name says. Attach a PDF or an image (JPG, PNG).`;
  }
  const details = documentDetails(b, fileName.replace(/\.[A-Za-z0-9]{1,5}$/, ''));
  if (typeof details === 'string') return details;
  return { ...details, fileName, mimeType: type.mime, sizeBytes, fileData: String(b.fileData) };
}

// "2.3 MB", "640 KB"
export const sizeLabel = (bytes: number) =>
  (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
