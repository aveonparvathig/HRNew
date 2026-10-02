// Documents as PDF files. The same HTML the print pages show is rendered
// by a headless Chromium installed in the server image, so a PDF looks
// exactly like the printed page. qpdf adds a password where one is asked.
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { existsSync, promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import puppeteer, { Browser } from 'puppeteer-core';
import { AppError } from '../middleware/errorHandler';

const CHROMIUM_PATHS = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
const chromiumPath = () => process.env.CHROMIUM_PATH || CHROMIUM_PATHS.find(p => existsSync(p)) || '';
const QPDF_PATHS = ['/usr/bin/qpdf', '/usr/local/bin/qpdf'];
const qpdfPath = () => process.env.QPDF_PATH || QPDF_PATHS.find(p => existsSync(p)) || '';

// What this server can do, for the settings screen
export const pdfEngine = () => ({ pdf: Boolean(chromiumPath()), password: Boolean(qpdfPath()) });

// One browser serves every request and is closed after a quiet minute.
let browser: Promise<Browser> | null = null;
let idle: NodeJS.Timeout | null = null;
const IDLE_MS = 60_000;

async function getBrowser(): Promise<Browser> {
  const executablePath = chromiumPath();
  if (!executablePath) {
    throw new AppError(503, 'PDF files are not available on this server: the browser that makes them is not installed. Use Print / Save as PDF instead.');
  }
  if (!browser) {
    browser = puppeteer.launch({
      executablePath,
      headless: true,
      // In a container there is no user namespace for Chromium's own
      // sandbox; pages get no scripts and no network instead (see below).
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
        '--no-first-run', '--no-zygote', `--user-data-dir=${path.join(os.tmpdir(), 'chromium-pdf')}`],
    }).catch(err => { browser = null; throw err; });
  }
  if (idle) clearTimeout(idle);
  idle = setTimeout(() => {
    const closing = browser;
    browser = null;
    closing?.then(b => b.close()).catch(() => { /* already gone */ });
  }, IDLE_MS);
  idle.unref();
  return browser;
}

// Renders run one at a time: a payroll's worth of payslips must not start
// thirty browser pages at once.
let queue: Promise<unknown> = Promise.resolve();
const inTurn = <T>(job: () => Promise<T>): Promise<T> => {
  const next = queue.then(job, job);
  queue = next.catch(() => { /* the caller sees the error */ });
  return next;
};

const asDocument = (html: string) => (/<html[\s>]/i.test(html) ? html : `<!doctype html>
<html><head><meta charset="utf-8">
<style>html, body { margin: 0; padding: 0; background: #fff; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }</style>
</head><body>${html}</body></html>`);

// A4 PDF of a document. The page size and margins come from the
// document's own print rules where it has them (the wide reports ask for
// landscape); otherwise portrait with a 12 mm margin.
export function htmlToPdf(html: string): Promise<Buffer> {
  return inTurn(async () => {
    const page = await (await getBrowser()).newPage();
    try {
      // The documents are static HTML with inline images. Nothing may run
      // and nothing may be fetched, whatever text ends up inside them.
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', request => {
        const url = request.url();
        if (url.startsWith('data:') || url === 'about:blank') request.continue();
        else request.abort();
      });
      await page.emulateMediaType('print');
      await page.setContent(asDocument(html), { waitUntil: 'load', timeout: 30_000 });
      const pdf = await page.pdf({
        format: 'A4', printBackground: true, preferCSSPageSize: true,
        margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await page.close().catch(() => { /* browser already closed */ });
    }
  });
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', d => { stderr += d; });
    child.on('error', reject);
    // qpdf exits 3 for warnings with a usable file written
    child.on('close', code => (code === 0 || code === 3 ? resolve() : reject(new Error(stderr.trim() || `exit ${code}`))));
  });
}

// The same PDF, openable only with the password (AES-256). The password
// reaches qpdf through a file, not the command line.
export async function protectPdf(pdf: Buffer, password: string): Promise<Buffer> {
  const qpdf = qpdfPath();
  if (!qpdf) throw new AppError(503, 'Password-protected PDF files are not available on this server.');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-'));
  try {
    const input = path.join(dir, 'in.pdf');
    const output = path.join(dir, 'out.pdf');
    const args = path.join(dir, 'args');
    await fs.writeFile(input, pdf);
    // A random owner password: nobody can lift the restrictions
    await fs.writeFile(args, [
      '--encrypt', `--user-password=${password}`, `--owner-password=${randomBytes(18).toString('base64url')}`,
      '--bits=256', '--', input, output,
    ].join('\n'), { mode: 0o600 });
    await run(qpdf, [`@${args}`]);
    return await fs.readFile(output);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// Several PDF files as one, in the order given.
export async function mergePdfs(files: Buffer[]): Promise<Buffer> {
  if (files.length === 1) return files[0];
  const qpdf = qpdfPath();
  if (!qpdf) throw new AppError(503, 'PDF files cannot be joined on this server.');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-'));
  try {
    const inputs: string[] = [];
    for (const [i, file] of files.entries()) {
      const name = path.join(dir, `in${i}.pdf`);
      await fs.writeFile(name, file);
      inputs.push(name);
    }
    const output = path.join(dir, 'out.pdf');
    await run(qpdf, ['--empty', '--pages', ...inputs, '--', output]);
    return await fs.readFile(output);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// Several documents as one: each starts on a new page.
export const joinHtml = (documents: string[]) =>
  documents.map((html, i) => `<div style="${i ? 'page-break-before:always;break-before:page;' : ''}">${html}</div>`).join('');
