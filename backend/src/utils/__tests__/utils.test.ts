import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../html';
import { mapLimit } from '../async';

describe('escapeHtml', () => {
  it('escapes markup and double quotes, leaves apostrophes as typed', () => {
    expect(escapeHtml(`<a href="x">R&D</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;R&amp;D&lt;/a&gt;');
    expect(escapeHtml("Priya Raman's")).toBe("Priya Raman's");
  });

  it('treats null and undefined as empty, numbers as text', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('mapLimit', () => {
  it('keeps the order of the items', async () => {
    const out = await mapLimit([30, 10, 20, 0], 2, n => new Promise<number>(r => setTimeout(() => r(n), n)));
    expect(out).toEqual([30, 10, 20, 0]);
  });

  it('never has more than `limit` calls in flight', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapLimit(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      peak = Math.max(peak, ++inFlight);
      await new Promise(r => setTimeout(r, 5));
      inFlight--;
    });
    expect(peak).toBe(3);
  });

  it('handles an empty list', async () => {
    expect(await mapLimit([], 4, async x => x)).toEqual([]);
  });
});
