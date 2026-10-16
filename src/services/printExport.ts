import { looksLikeHtml, sanitizeLetterHtml } from '@/lib/richtext';

export type HeaderTemplateId = 'classic' | 'modern' | 'minimal' | 'elegant';


export interface HeaderTemplate {
  id: HeaderTemplateId;
  name: string;
  description: string;
}

export const headerTemplates: HeaderTemplate[] = [
  { id: 'classic', name: 'کلاسیک', description: 'سربرگ سنتی با خطوط و نام سازمان' },
  { id: 'modern', name: 'مدرن', description: 'طراحی مدرن با نوار رنگی' },
  { id: 'minimal', name: 'مینیمال', description: 'ساده و تمیز بدون عناصر اضافی' },
  { id: 'elegant', name: 'شیک', description: 'حاشیه‌های دکوراتیو و فونت بزرگ' },
];

function buildHeaderHtml(template: HeaderTemplateId, orgName: string): string {
  const safeOrg = orgName || 'سازمان';
  switch (template) {
    case 'classic':
      return `
        <div class="hdr-classic">
          <div class="hdr-classic-line"></div>
          <h1>${safeOrg}</h1>
          <div class="hdr-classic-sub">مکتوب رسمی</div>
          <div class="hdr-classic-line"></div>
        </div>`;
    case 'modern':
      return `
        <div class="hdr-modern">
          <div class="hdr-modern-bar"></div>
          <h1>${safeOrg}</h1>
          <span class="hdr-modern-date">تاریخ: ${new Date().toLocaleDateString('fa-IR')}</span>
        </div>`;
    case 'minimal':
      return `
        <div class="hdr-minimal">
          <h1>${safeOrg}</h1>
        </div>`;
    case 'elegant':
      return `
        <div class="hdr-elegant">
          <div class="hdr-elegant-border"></div>
          <h1>${safeOrg}</h1>
          <div class="hdr-elegant-sub">مرکز نگارش رسمی</div>
          <div class="hdr-elegant-border"></div>
        </div>`;
  }
}

function buildPrintHtml(content: string, title: string, template: HeaderTemplateId, orgName: string): string {
  const header = buildHeaderHtml(template, orgName);
  const isRich = looksLikeHtml(content);
  const bodyHtml = isRich ? sanitizeLetterHtml(content) : content.replace(/</g, '&lt;');
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  @page { margin: 2cm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Vazirmatn', 'Tahoma', 'Segoe UI', sans-serif;
    color: #1e293b;
    line-height: 2;
    font-size: 14px;
    margin: 0;
    padding: 0;
  }
  .letter-body {
    ${isRich ? '' : 'white-space: pre-wrap;'}
    text-align: justify;
    margin-top: 2rem;
    line-height: 2.2;
    font-size: 14px;
  }

  /* Classic */
  .hdr-classic { text-align: center; margin-bottom: 2rem; }
  .hdr-classic h1 { font-size: 22px; font-weight: 700; color: #0f172a; margin: 0.5rem 0; }
  .hdr-classic-sub { font-size: 12px; color: #64748b; margin-bottom: 0.5rem; }
  .hdr-classic-line { border-top: 2px solid #0f172a; margin: 0.5rem 0; }

  /* Modern */
  .hdr-modern { display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid #e2e8f0; }
  .hdr-modern-bar { width: 6px; height: 48px; background: linear-gradient(to bottom, #6366f1, #4f46e5); border-radius: 3px; }
  .hdr-modern h1 { font-size: 20px; font-weight: 700; color: #1e293b; margin: 0; flex: 1; }
  .hdr-modern-date { font-size: 11px; color: #94a3b8; }

  /* Minimal */
  .hdr-minimal { text-align: center; margin-bottom: 2.5rem; }
  .hdr-minimal h1 { font-size: 18px; font-weight: 600; color: #334155; letter-spacing: 0.05em; }

  /* Elegant */
  .hdr-elegant { text-align: center; margin-bottom: 2rem; padding: 1rem 0; }
  .hdr-elegant h1 { font-size: 24px; font-weight: 700; color: #0f172a; margin: 0.5rem 0; letter-spacing: 0.03em; }
  .hdr-elegant-sub { font-size: 11px; color: #94a3b8; letter-spacing: 0.1em; text-transform: uppercase; }
  .hdr-elegant-border { border-top: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; padding: 0; height: 3px; }
</style>
</head>
<body>
  ${header}
  <div class="letter-body">${bodyHtml}</div>
  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`;
}

export function printLetter(
  content: string,
  title: string,
  template: HeaderTemplateId,
  orgName: string,
) {
  const html = buildPrintHtml(content, title, template, orgName);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();

  // Give the iframe a moment to render before printing
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => document.body.removeChild(iframe), 1000);
  }, 500);
}
