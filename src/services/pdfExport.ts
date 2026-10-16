import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { looksLikeHtml, sanitizeLetterHtml, htmlToPlainText } from '@/lib/richtext';

export type PersianFontId = 'vazirmatn' | 'sahel' | 'estedad' | 'gandom' | 'shabnam' | 'tahoma';

export interface PersianFont {
  id: PersianFontId;
  name: string;
  cssFamily: string;
}

export const persianFonts: PersianFont[] = [
  { id: 'vazirmatn', name: 'وزیرمتن', cssFamily: 'Vazirmatn' },
  { id: 'sahel', name: 'ساحل', cssFamily: 'Sahel' },
  { id: 'estedad', name: 'استعداد', cssFamily: 'Estedad' },
  { id: 'gandom', name: 'گندم', cssFamily: 'Gandom' },
  { id: 'shabnam', name: 'شبنم', cssFamily: 'Shabnam' },
  { id: 'tahoma', name: 'تهوما', cssFamily: 'Tahoma, sans-serif' },
];

function getFontFamily(fontId: PersianFontId): string {
  const font = persianFonts.find((f) => f.id === fontId);
  return font?.cssFamily ?? 'Vazirmatn';
}

interface PdfExportOptions {
  fontId?: PersianFontId;
  content: string;
  watermark?: string;
}

const PAGE_WIDTH_PX = 794;
const PAGE_HEIGHT_PX = 1123;
const PADDING_X = 64;
const PADDING_Y = 72;
const FONT_SIZE = 17;
const LINE_HEIGHT = 2.0;
const SCALE = 2;

export async function exportToPDFBlob(
  _element: HTMLElement | null,
  options?: PdfExportOptions,
): Promise<Blob | null> {
  if (!options?.content) return null;

  // Formatted (HTML) letter bodies go through the rich renderer so fonts,
  // sizes, colors, alignment and lists survive the export. If that renderer
  // fails (html2canvas can choke on some WebView/CSS combos) we fall back to
  // the plain-text canvas renderer instead of returning nothing at all.
  if (looksLikeHtml(options.content)) {
    try {
      const richBlob = await exportRichHtmlToPdfBlob(options);
      if (richBlob) return richBlob;
      console.warn('[pdf] Rich renderer returned no output; falling back to plain text.');
    } catch (err) {
      console.error('[pdf] Rich renderer failed; falling back to plain text.', err);
    }
    options = { ...options, content: htmlToPlainText(options.content) };
  }

  const fontId = options?.fontId ?? 'vazirmatn';
  const fontFamily = getFontFamily(fontId);
  const content = options.content;
  const hasWatermark = !!options?.watermark;

  await ensureFontsLoaded(fontFamily);

  const usableWidth = PAGE_WIDTH_PX - PADDING_X * 2;
  const lineHeightPx = FONT_SIZE * LINE_HEIGHT;
  const usableHeight = PAGE_HEIGHT_PX - PADDING_Y * 2;
  const linesPerPage = Math.floor(usableHeight / lineHeightPx);

  const allLines = wrapText(content, usableWidth, fontFamily, FONT_SIZE);

  const pageCount = Math.max(1, Math.ceil(allLines.length / linesPerPage));

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pdfW = pdf.internal.pageSize.getWidth();
  const imgW = pdfW;
  const imgH = (PAGE_HEIGHT_PX * imgW) / PAGE_WIDTH_PX;

  for (let p = 0; p < pageCount; p++) {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_WIDTH_PX * SCALE;
    canvas.height = PAGE_HEIGHT_PX * SCALE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_WIDTH_PX, PAGE_HEIGHT_PX);

    if (hasWatermark) {
      drawWatermark(ctx, fontFamily);
    }

    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#1e293b';
    ctx.font = `${FONT_SIZE}px ${fontFamily}, Tahoma, sans-serif`;

    const startX = PAGE_WIDTH_PX - PADDING_X;
    let y = PADDING_Y;

    const start = p * linesPerPage;
    const end = Math.min(start + linesPerPage, allLines.length);

    for (let i = start; i < end; i++) {
      ctx.fillText(allLines[i], startX, y);
      y += lineHeightPx;
    }

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    if (p > 0) pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, 0, imgW, imgH);
  }

  return pdf.output('blob');
}

function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'مکتوب';
}

/**
 * Exports the letter to a PDF and hands it to the user.
 *
 * Android: the file is written straight into the public Download folder through
 * the native MediaStore plugin (see lib/capacitor.ts for why @capacitor/filesystem
 * cannot do this), then opened with ACTION_VIEW. No dialog, no share sheet, no
 * stranded private file.
 *
 * If the native write fails for any reason — an old APK that predates the plugin,
 * a denied legacy permission, a full disk — we fall back to the share sheet, which
 * has worked since 1.6.4, and only then to a silent private save.
 *
 * Web: a plain browser download into the download directory.
 */
export async function exportToPDF(
  element: HTMLElement | null,
  fileName: string,
  options?: PdfExportOptions,
): Promise<{ shared: boolean; downloaded: boolean; opened?: boolean }> {
  const blob = await exportToPDFBlob(element, options);
  if (!blob) throw new Error('PDF generation failed: no content');

  const { saveBlobToDownloads } = await import('@/lib/capacitor');
  const safeName = `${sanitizeFileName(fileName)}.pdf`;

  try {
    const result = await saveBlobToDownloads(blob, safeName);

    // A saved-but-unopenable file is still a successful download; the message
    // just tells the user where it went.
    if (result.downloaded) {
      return { shared: false, downloaded: true, opened: result.opened };
    }

    console.warn('[pdf] direct download unavailable, using the share sheet', result.fallbackReason);
  } catch (err) {
    console.warn('[pdf] direct download threw, using the share sheet', err);
  }

  // ── Fallback 1: private write + share sheet (always available) ──────────
  try {
    const { saveAndShareBlob } = await import('@/lib/capacitor');
    return await saveAndShareBlob(blob, safeName);
  } catch (shareErr) {
    console.warn('[pdf] share failed, retrying with a silent save', shareErr);
  }

  // ── Fallback 2: private write only, so the bytes are never lost ─────────
  const { saveBlob } = await import('@/lib/capacitor');
  const { downloaded } = await saveBlob(blob, safeName);
  return { shared: false, downloaded };
}

function drawWatermark(ctx: CanvasRenderingContext2D, fontFamily: string) {
  ctx.save();
  ctx.translate(PAGE_WIDTH_PX / 2, PAGE_HEIGHT_PX / 2);
  ctx.rotate(-0.5);
  ctx.font = `900 80px ${fontFamily}, Tahoma, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(99, 102, 241, 0.06)';
  ctx.direction = 'ltr';
  ctx.fillText('kateb.site', 0, 0);
  ctx.restore();
}

function wrapText(
  content: string,
  maxWidth: number,
  fontFamily: string,
  fontSize: number,
): string[] {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return content.split('\n');

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.font = `${fontSize}px ${fontFamily}, Tahoma, sans-serif`;

  const lines: string[] = [];
  const paragraphs = content.split('\n');

  for (const para of paragraphs) {
    if (para.trim() === '') {
      lines.push('');
      continue;
    }

    const words = para.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const w = ctx.measureText(testLine).width;

      if (w > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
  }

  return lines;
}

async function ensureFontsLoaded(_fontFamily: string) {
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore
    }
  }
}

/**
 * Renders a formatted (HTML) letter body to PDF pages via html2canvas so that
 * fonts, sizes, colors, alignment, lists and spacing survive the export.
 * The body is laid out off-screen at A4 width, then sliced into page-sized
 * canvas chunks (padding + optional watermark applied per page).
 */
async function exportRichHtmlToPdfBlob(options: PdfExportOptions): Promise<Blob | null> {
  const fontId = options.fontId ?? 'vazirmatn';
  const fontFamily = getFontFamily(fontId);
  const hasWatermark = !!options.watermark;
  const contentCssW = PAGE_WIDTH_PX - PADDING_X * 2;
  const usableHeightCss = PAGE_HEIGHT_PX - PADDING_Y * 2;

  const watermarkLabel = (options.watermark ?? '').replace(/^\n+/g, '').trim();
  const watermarkHtml = watermarkLabel
    ? `<div style="margin-top:28px;border-top:1px solid #e2e8f0;padding-top:10px;color:#94a3b8;font-size:12px;text-align:right">${watermarkLabel}</div>`
    : '';

  const holder = document.createElement('div');
  holder.className = 'kateb-letter-body';
  holder.dir = 'rtl';
  holder.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    `width:${contentCssW}px`,
    'padding:0',
    'margin:0',
    'background:#ffffff',
    'color:#1e293b',
    `font-family:${fontFamily},Tahoma,sans-serif`,
    'font-size:17px',
    'line-height:2',
    'text-align:right',
  ].join(';');
  holder.innerHTML = sanitizeLetterHtml(options.content) + watermarkHtml;
  document.body.appendChild(holder);

  try {
    await ensureFontsLoaded(fontFamily);
    // Give webfonts a beat to actually rasterize before capture.
    await new Promise((r) => setTimeout(r, 150));

    const src = await html2canvas(holder, {
      scale: SCALE,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
    });

    const srcH = src.height;
    const usableDevice = Math.round(usableHeightCss * SCALE);
    const pageCount = Math.max(1, Math.ceil(srcH / usableDevice));

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdfW = pdf.internal.pageSize.getWidth();
    const imgW = pdfW;
    const imgH = (PAGE_HEIGHT_PX * imgW) / PAGE_WIDTH_PX;

    for (let p = 0; p < pageCount; p++) {
      const page = document.createElement('canvas');
      page.width = PAGE_WIDTH_PX * SCALE;
      page.height = PAGE_HEIGHT_PX * SCALE;
      const ctx = page.getContext('2d');
      if (!ctx) return null;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, page.width, page.height);

      if (hasWatermark) {
        ctx.save();
        ctx.scale(SCALE, SCALE);
        drawWatermark(ctx, fontFamily);
        ctx.restore();
      }

      const sy = p * usableDevice;
      const chunkH = Math.min(usableDevice, srcH - sy);
      ctx.drawImage(
        src,
        0,
        sy,
        src.width,
        chunkH,
        PADDING_X * SCALE,
        PADDING_Y * SCALE,
        src.width,
        chunkH,
      );

      const imgData = page.toDataURL('image/jpeg', 0.92);
      if (p > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, 0, imgW, imgH);
    }

    return pdf.output('blob');
  } catch (err) {
    console.error('[pdf] Rich HTML to PDF failed.', err);
    return null;
  } finally {
    document.body.removeChild(holder);
  }
}
