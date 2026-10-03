// Workbooks in and out: reading the first sheet of an uploaded .xlsx into
// plain rows, and writing the templates the imports start from.
import { AppError } from '../middleware/errorHandler';
import { SheetRow, textCell } from './importCalc';

export const MAX_SHEET_BYTES = 5 * 1024 * 1024;
export const MAX_SHEET_ROWS = 2000;

// What a cell holds, as a plain value: text, a number, a date, yes/no.
function plain(value: any): any {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value !== 'object') return value;
  if (Array.isArray(value.richText)) return value.richText.map((part: any) => part.text || '').join('');
  if ('result' in value) return plain(value.result); // a formula: what it comes to
  if ('text' in value) return plain(value.text); // a link: its words
  if ('error' in value) return null;
  return null;
}

// The first sheet of a workbook sent as base64: the headings of row 1 and
// every row under them, each cell under its heading.
export async function readSheet(fileBase64: any): Promise<{ headers: string[]; rows: SheetRow[] }> {
  if (!fileBase64 || typeof fileBase64 !== 'string') throw new AppError(400, 'Attach the workbook');
  const buffer = Buffer.from(fileBase64.replace(/^data:[^,]+,/, ''), 'base64');
  if (buffer.length > MAX_SHEET_BYTES) throw new AppError(400, 'The workbook is too large. Keep it under 5 MB.');
  const Excel = await import('exceljs');
  const wb = new Excel.Workbook();
  try {
    await wb.xlsx.load(buffer as any);
  } catch {
    throw new AppError(400, 'Could not read the workbook. Upload an Excel file (.xlsx), not .xls or .csv.');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new AppError(400, 'The workbook has no sheet');
  if (ws.rowCount - 1 > MAX_SHEET_ROWS) throw new AppError(400, `The sheet has more than ${MAX_SHEET_ROWS} rows. Split it into smaller files.`);
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell: any, column: number) => { headers[column] = textCell(plain(cell.value)); });
  const rows: SheetRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells: Record<string, any> = {};
    headers.forEach((header, column) => {
      // The first column of a heading typed twice is the one read
      if (header && !(header in cells)) cells[header] = plain(row.getCell(column).value);
    });
    rows.push({ row: r, cells });
  }
  return { headers: headers.filter(Boolean), rows };
}

export interface TemplateColumn {
  header: string;
  note?: string;
  example?: string;
  // Kept as text, so a code or an account number is not turned into a number
  asText?: boolean;
}

// A workbook to fill in: the headings on the first sheet, with any rows
// given, and a Notes sheet saying what goes in each column.
export async function templateWorkbook(
  sheetName: string, columns: TemplateColumn[], rows: any[][], notes: string[], lists: { title: string; values: string[] }[] = [],
) {
  const Excel = await import('exceljs');
  const wb = new Excel.Workbook();
  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.addRow(columns.map(c => c.header));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEFFC' } };
  columns.forEach((c, i) => {
    const column = ws.getColumn(i + 1);
    column.width = Math.max(14, c.header.length + 3);
    if (c.asText) column.numFmt = '@';
  });
  for (const row of rows) ws.addRow(row.map((v, i) => (columns[i]?.asText && v !== null && v !== undefined ? String(v) : v ?? '')));

  const info = wb.addWorksheet('Notes');
  info.getColumn(1).width = 30;
  info.getColumn(2).width = 62;
  info.getColumn(3).width = 34;
  for (const line of notes) info.addRow([line]);
  info.addRow([]);
  const head = info.addRow(['Column', 'What to type', 'Example']);
  head.font = { bold: true };
  for (const c of columns) info.addRow([c.header, c.note || '', c.example || '']);
  for (const list of lists) {
    info.addRow([]);
    info.addRow([list.title]).font = { bold: true };
    for (const value of list.values) info.addRow([value]);
  }
  return wb;
}

export async function sendWorkbook(res: any, wb: any, filename: string) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^\w.\-]/g, '_')}"`);
  res.setHeader('X-File-Name', encodeURIComponent(filename));
  await wb.xlsx.write(res);
  res.end();
}
