// Secrets kept in the database (the mail server's password) are stored
// encrypted with a key from the server's environment, so a copy of the
// database alone does not reveal them.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// SETTINGS_SECRET if set, else the token secret. Changing it makes stored
// secrets unreadable: they then have to be typed in again.
let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (!cachedKey) {
    const secret = process.env.SETTINGS_SECRET || process.env.JWT_SECRET || '';
    if (!secret) throw new Error('No secret to protect stored settings with');
    cachedKey = scryptSync(secret, 'aveon-hr-settings', 32);
  }
  return cachedKey;
}

export function seal(plain: string): string {
  if (!plain) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join(':');
}

// Returns '' when the value cannot be read (wrong key, or damaged).
export function unseal(sealed: string): string {
  const [version, iv, tag, body] = String(sealed || '').split(':');
  if (version !== 'v1' || !iv || !tag || !body) return '';
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}
