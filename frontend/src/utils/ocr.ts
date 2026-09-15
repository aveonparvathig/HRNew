// Receipt OCR pipeline: canvas preprocessing -> Tesseract.js (WASM) -> a
// parser tuned for Indian receipts. Everything runs in the browser.
// tesseract.js is imported on demand so it never weighs down the page bundle.

// ---------------------------------------------------------------------------
// 1. Preprocess: upscale + grayscale + Otsu threshold. This is what turns
//    a phone photo of a thermal receipt into something OCR can read.
// ---------------------------------------------------------------------------
export function preprocessImage(file: File): Promise<{ processed: string; original: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // Original (for storage): capped at 1600px, JPEG
      const storeScale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const store = document.createElement('canvas');
      store.width = Math.round(img.width * storeScale);
      store.height = Math.round(img.height * storeScale);
      store.getContext('2d')!.drawImage(img, 0, 0, store.width, store.height);
      const original = store.toDataURL('image/jpeg', 0.82);

      // OCR input: upscale small images so glyphs are ~30px tall
      const ocrScale = Math.max(1, Math.min(3, 1800 / Math.max(img.width, img.height)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ocrScale);
      canvas.height = Math.round(img.height * ocrScale);
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const px = data.data;
      // Grayscale + histogram
      const hist = new Array(256).fill(0);
      const grays = new Uint8Array(px.length / 4);
      for (let i = 0; i < px.length; i += 4) {
        const g = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
        grays[i / 4] = g;
        hist[g]++;
      }
      // Otsu's threshold
      const totalPx = grays.length;
      let sum = 0;
      for (let i = 0; i < 256; i++) sum += i * hist[i];
      let sumB = 0, wB = 0, maxVar = 0, threshold = 127;
      for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (!wB) continue;
        const wF = totalPx - wB;
        if (!wF) break;
        sumB += t * hist[t];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const v = wB * wF * (mB - mF) * (mB - mF);
        if (v > maxVar) { maxVar = v; threshold = t; }
      }
      // Soft binarize: pure black/white beyond the threshold band, keeps
      // anti-aliased edges near it (Tesseract likes this better than hard 1-bit)
      for (let i = 0; i < px.length; i += 4) {
        const g = grays[i / 4];
        const v = g < threshold - 12 ? 0 : g > threshold + 12 ? 255 : Math.round((g - (threshold - 12)) * (255 / 24));
        px[i] = px[i + 1] = px[i + 2] = v;
      }
      ctx.putImageData(data, 0, 0);
      URL.revokeObjectURL(url);
      resolve({ processed: canvas.toDataURL('image/png'), original });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read the image')); };
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// 2. OCR — one shared worker. Spinning up the WASM worker + language data
//    costs seconds, so it is reused across receipts in a batch and released
//    after a quiet minute.
// ---------------------------------------------------------------------------
let workerPromise: Promise<any> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let progressCb: ((pct: number) => void) | null = null;

function getWorker(): Promise<any> {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(({ createWorker }) =>
      createWorker('eng', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text' && progressCb) {
            progressCb(Math.round(m.progress * 100));
          }
        },
      }),
    );
  }
  return workerPromise;
}

export async function releaseOcrWorker(): Promise<void> {
  clearTimeout(idleTimer);
  const wp = workerPromise;
  workerPromise = null;
  if (wp) {
    try { (await wp).terminate(); } catch { /* worker already gone */ }
  }
}

export async function ocrImage(
  processedDataUrl: string,
  onProgress?: (pct: number) => void,
): Promise<{ text: string; confidence: number }> {
  clearTimeout(idleTimer);
  const worker = await getWorker();
  progressCb = onProgress || null;
  try {
    const { data } = await worker.recognize(processedDataUrl);
    return { text: data.text || '', confidence: data.confidence || 0 };
  } finally {
    progressCb = null;
    idleTimer = setTimeout(releaseOcrWorker, 60_000);
  }
}

// ---------------------------------------------------------------------------
// 3. Receipt parser - Indian-receipt heuristics
// ---------------------------------------------------------------------------
export interface ParsedReceipt {
  amount: number | null;
  date: string | null; // YYYY-MM-DD
  merchant: string;
  gstin: string;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const toNum = (s: string) => {
  const n = Number(s.replace(/[,\s]/g, ''));
  return isNaN(n) ? null : n;
};

export function parseReceipt(text: string): ParsedReceipt {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const flat = ' ' + text.replace(/\n/g, ' | ') + ' ';

  // --- Amount: labeled totals win; else the largest currency-marked number;
  //     else the largest decimal number on the receipt.
  let amount: number | null = null;
  const labeled = [...flat.matchAll(
    /(?:grand\s*total|net\s*(?:amount|payable|total)|total\s*(?:amount|payable|value)?|amount\s*(?:payable|due)|bill\s*amount|payable)\s*[:\-–]?\s*(?:rs\.?|inr|₹|r5|k)?\s*([\d,]+(?:\.\d{1,2})?)/gi,
  )].map(m => toNum(m[1])).filter((n): n is number => n != null && n > 0);
  if (labeled.length) {
    amount = Math.max(...labeled);
  } else {
    const currencyMarked = [...flat.matchAll(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/gi)]
      .map(m => toNum(m[1])).filter((n): n is number => n != null && n > 0);
    if (currencyMarked.length) {
      amount = Math.max(...currencyMarked);
    } else {
      const decimals = [...flat.matchAll(/\b([\d,]{1,10}\.\d{2})\b/g)]
        .map(m => toNum(m[1])).filter((n): n is number => n != null && n > 0 && n < 10_000_000);
      if (decimals.length) amount = Math.max(...decimals);
    }
  }

  // --- Date: DD-MM-YYYY, DD/MM/YY, YYYY-MM-DD, "02 Feb 2026", "Feb 02, 2026"
  let date: string | null = null;
  const iso = flat.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  const dmy = flat.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  const dMonY = flat.match(/\b(\d{1,2})[\s-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,-]+(\d{2,4})\b/i);
  const monDY = flat.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s]+(\d{1,2})[\s,]+(\d{2,4})\b/i);
  const pad = (n: number) => String(n).padStart(2, '0');
  const fixYear = (y: number) => (y < 100 ? 2000 + y : y);
  if (iso) {
    date = `${iso[1]}-${iso[2]}-${iso[3]}`;
  } else if (dMonY) {
    date = `${fixYear(Number(dMonY[3]))}-${pad(MONTHS[dMonY[2].toLowerCase()])}-${pad(Number(dMonY[1]))}`;
  } else if (monDY) {
    date = `${fixYear(Number(monDY[3]))}-${pad(MONTHS[monDY[1].toLowerCase()])}-${pad(Number(monDY[2]))}`;
  } else if (dmy) {
    const d = Number(dmy[1]), m = Number(dmy[2]), y = fixYear(Number(dmy[3]));
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) date = `${y}-${pad(m)}-${pad(d)}`;
  }

  // --- GSTIN (15 chars: 2 digits, 5 letters, 4 digits, letter, alnum, Z, alnum)
  const gstin = flat.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]\b/i)?.[0]?.toUpperCase() || '';

  // --- Merchant: first meaningful text line (skip numbers, keywords, codes).
  //     Word boundaries matter: a bare /tel/ would reject every "HOTEL ..." line.
  const skip = /\b(?:invoice|receipt|bill|tax|gst|gstin|date|cash|memo|original|duplicate|phone|tel|mob(?:ile)?)\b|\b(?:no|ph)\s*[.:]|www\.|@/i;
  let merchant = '';
  for (const line of lines.slice(0, 8)) {
    if (/\d+\.\d{2}\s*$/.test(line)) continue; // ends in an amount → line item, not a name
    const letters = (line.match(/[A-Za-z]/g) || []).length;
    if (letters >= 4 && letters > line.length * 0.4 && !skip.test(line)) {
      merchant = line.replace(/[^A-Za-z0-9 &.'()-]/g, ' ').replace(/\s+/g, ' ').trim();
      break;
    }
  }

  return { amount, date, merchant, gstin };
}
