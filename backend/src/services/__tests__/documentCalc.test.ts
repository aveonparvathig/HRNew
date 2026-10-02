import { describe, it, expect } from 'vitest';
import {
  MAX_DOCUMENT_BYTES, base64Bytes, cleanFileName, documentDetails, documentInput, sizeLabel, sniffMime,
} from '../documentCalc';

const uri = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString('base64')}`;
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 2)]);
const upload = (over: any = {}) => ({ category: 'Identity', title: '', fileName: 'pan-card.pdf', fileData: uri('application/pdf', PDF), ...over });

describe('an uploaded document', () => {
  it('takes a PDF or an image and records what it is', () => {
    expect(documentInput(upload())).toMatchObject({
      category: 'Identity', title: 'pan-card', documentDate: null, fileName: 'pan-card.pdf', mimeType: 'application/pdf',
      sizeBytes: PDF.length, visibleToEmployee: false,
    });
    expect(documentInput(upload({ fileName: 'photo.png', fileData: uri('image/png', PNG), title: ' Passport   photo ', documentDate: '2026-04-01', visibleToEmployee: 1 })))
      .toMatchObject({ title: 'Passport photo', documentDate: '2026-04-01', mimeType: 'image/png', visibleToEmployee: true });
    expect(documentInput(upload({ fileName: 'scan.jpeg', fileData: uri('image/jpeg', JPG) }))).toMatchObject({ mimeType: 'image/jpeg' });
  });

  it('refuses other kinds of file', () => {
    expect(documentInput(upload({ fileData: uri('text/html', Buffer.from('<html>')) }))).toMatch(/PDF or an image/);
    expect(documentInput(upload({ fileData: uri('image/svg+xml', Buffer.from('<svg onload="x"/>')) }))).toMatch(/PDF or an image/);
    expect(documentInput(upload({ fileData: 'https://example.com/a.pdf' }))).toMatch(/PDF or an image/);
    expect(documentInput(upload({ fileData: '' }))).toMatch(/PDF or an image/);
    expect(documentInput(upload({ fileName: '' }))).toMatch(/Attach a file/);
  });

  it('refuses a file that is not what it says it is', () => {
    expect(documentInput(upload({ fileData: uri('application/pdf', Buffer.from('<script>alert(1)</script>')) }))).toMatch(/not a PDF/);
    expect(documentInput(upload({ fileName: 'x.png', fileData: uri('image/png', PDF) }))).toMatch(/not a PNG/);
    expect(sniffMime(Buffer.from('MZ\x90\x00'))).toBeNull();
  });

  it('holds the size limit on the file, not on its encoding', () => {
    const body = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(MAX_DOCUMENT_BYTES - 9, 0x20)]);
    expect(documentInput(upload({ fileData: uri('application/pdf', body) }))).toMatchObject({ sizeBytes: MAX_DOCUMENT_BYTES });
    const over = Buffer.concat([body, Buffer.from(' ')]);
    expect(documentInput(upload({ fileData: uri('application/pdf', over) }))).toMatch(/under 5 MB/);
    expect(base64Bytes(Buffer.from('ab').toString('base64'))).toBe(2);
    expect(base64Bytes(Buffer.from('a').toString('base64'))).toBe(1);
    expect(base64Bytes(Buffer.from('abc').toString('base64'))).toBe(3);
  });

  it('wants a category, a title and a real date', () => {
    expect(documentInput(upload({ category: ' ' }))).toMatch(/category/);
    expect(documentInput(upload({ documentDate: '2026-02-31x' }))).toMatch(/valid date/);
    expect(documentInput(upload({ title: 'x'.repeat(151) }))).toMatch(/150/);
    expect(documentDetails({ category: 'Education', title: '' })).toMatch(/title/);
    expect(documentDetails({ category: 'Education', title: 'Degree', documentDate: '' }))
      .toEqual({ category: 'Education', title: 'Degree', documentDate: null, visibleToEmployee: false });
  });

  it('keeps only the name of the file', () => {
    expect(cleanFileName('C:\\Users\\hr\\Desktop\\offer letter.pdf')).toBe('offer letter.pdf');
    expect(cleanFileName('../../etc/passwd')).toBe('passwd');
    expect(cleanFileName('a<b>:"c|?*.pdf')).toBe('abc.pdf');
    expect(cleanFileName('x'.repeat(300)).length).toBe(150);
    expect(cleanFileName(null)).toBe('');
  });

  it('writes sizes for people', () => {
    expect(sizeLabel(640 * 1024)).toBe('640 KB');
    expect(sizeLabel(2.34 * 1024 * 1024)).toBe('2.3 MB');
    expect(sizeLabel(200)).toBe('1 KB');
  });
});
