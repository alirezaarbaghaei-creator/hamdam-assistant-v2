/**
 * Dependency-free .xlsx (Excel) export for the web app.
 *
 * Builds a minimal OOXML spreadsheet package and wraps it in a store-only
 * (uncompressed) ZIP archive. Persian text is written as UTF-8 inline strings,
 * so no shared-strings table is needed. The result is a genuine .xlsx file
 * that Excel / LibreOffice / Google Sheets open natively.
 */

export interface ExcelSheet {
  /** Sheet name — max 31 chars; illegal characters are stripped. */
  name?: string;
  headers: string[];
  rows: (string | number)[][];
  /** Column widths in Excel character units (auto-computed when omitted). */
  widths?: number[];
  /** Right-to-left sheet layout (default: true, for Persian). */
  rtl?: boolean;
}

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ─── ZIP (store method) ────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function buildZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime =
    ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate =
    (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // general purpose flag: UTF-8 names
    lv.setUint16(8, 0, true); // compression: store
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // compressed size
    lv.setUint32(22, size, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra field length
    local.set(nameBytes, 30);

    localParts.push(local, entry.data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // central directory signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 names
    cv.setUint16(10, 0, true); // store
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true); // file name length
    // extra/comment/disk/internal attrs stay 0
    cv.setUint32(38, 0, true); // external file attributes
    cv.setUint32(42, offset, true); // local header offset
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + size;
  }

  const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central directory
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true); // central directory offset
  // disk numbers + comment length stay 0

  const out = new Uint8Array(offset + centralSize + eocd.length);
  let pos = 0;
  for (const part of [...localParts, ...centralParts, eocd]) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

// ─── OOXML helpers ─────────────────────────────────────────────

function escXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 0 -> A, 25 -> Z, 26 -> AA, ... */
function colLetter(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function sanitizeSheetName(name: string | undefined): string {
  const cleaned = (name ?? '')
    .replace(/[\\/?*[\]:]/g, '')
    .trim()
    .slice(0, 31);
  return cleaned || 'Sheet1';
}

function autoWidths(sheet: ExcelSheet): number[] {
  const colCount = Math.max(sheet.headers.length, ...sheet.rows.map((r) => r.length), 1);
  const widths: number[] = [];
  for (let i = 0; i < colCount; i++) {
    const cells = [sheet.headers[i] ?? '', ...sheet.rows.map((r) => String(r[i] ?? ''))];
    let max = 8;
    for (const cell of cells) {
      // Persian/Arabic glyphs render roughly twice as wide as ASCII
      const visual = cell.replace(/[\u0600-\u06FF\u0750-\u077F]/g, '..');
      max = Math.max(max, visual.length + 3);
    }
    widths.push(Math.min(45, max));
  }
  return widths;
}

function cellXml(col: number, row: number, value: string | number, header: boolean): string {
  const ref = `${colLetter(col)}${row}`;
  const style = header ? ' s="1"' : '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"${style}><v>${value}</v></c>`;
  }
  const text = escXml(String(value ?? ''));
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${text}</t></is></c>`;
}

function buildSheetXml(sheet: ExcelSheet): string {
  const colCount = Math.max(sheet.headers.length, ...sheet.rows.map((r) => r.length), 1);
  const widths = sheet.widths ?? autoWidths(sheet);
  const rtl = sheet.rtl !== false;
  const lastCell = colLetter(colCount - 1);
  const totalRows = sheet.rows.length + 1;

  const parts: string[] = [];
  parts.push(
    `${XML_DECL}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`,
  );
  parts.push(`<dimension ref="A1:${lastCell}${totalRows}"/>`);
  parts.push(
    `<sheetViews><sheetView${rtl ? ' rightToLeft="1"' : ''} workbookViewId="0"/></sheetViews>`,
  );
  parts.push('<sheetFormatPr defaultRowHeight="15"/>');
  parts.push(
    `<cols>${widths
      .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
      .join('')}</cols>`,
  );
  parts.push('<sheetData>');
  parts.push(`<row r="1">${sheet.headers.map((h, i) => cellXml(i, 1, h, true)).join('')}</row>`);
  sheet.rows.forEach((row, ri) => {
    const r = ri + 2;
    parts.push(`<row r="${r}">${row.map((v, ci) => cellXml(ci, r, v, false)).join('')}</row>`);
  });
  parts.push('</sheetData></worksheet>');
  return parts.join('');
}

// ─── Public API ────────────────────────────────────────────────

/** Build the raw bytes of a single-sheet .xlsx file. */
export function buildXlsxBytes(sheet: ExcelSheet): Uint8Array {
  const sheetName = sanitizeSheetName(sheet.name);
  const enc = (s: string) => new TextEncoder().encode(s);

  const files: ZipEntry[] = [
    {
      name: '[Content_Types].xml',
      data: enc(
        `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
          '</Types>',
      ),
    },
    {
      name: '_rels/.rels',
      data: enc(
        `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>',
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: enc(
        `${XML_DECL}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheets><sheet name="${escXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: enc(
        `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
          '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
          '</Relationships>',
      ),
    },
    {
      name: 'xl/styles.xml',
      data: enc(
        `${XML_DECL}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
          '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
          '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
          '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
          '<fill><patternFill patternType="gray125"/></fill></fills>' +
          '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
          '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
          '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
          '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
          '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
          '</styleSheet>',
      ),
    },
    { name: 'xl/worksheets/sheet1.xml', data: enc(buildSheetXml(sheet)) },
  ];

  return buildZip(files);
}

/** Build the sheet and trigger a browser download as `filename.xlsx`. */
export function exportToExcel(sheet: ExcelSheet & { filename: string }): void {
  const bytes = buildXlsxBytes(sheet);
  const filename = sheet.filename.toLowerCase().endsWith('.xlsx')
    ? sheet.filename
    : `${sheet.filename}.xlsx`;
  const blob = new Blob([bytes as BlobPart], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}