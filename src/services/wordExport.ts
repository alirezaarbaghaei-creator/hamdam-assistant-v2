import { looksLikeHtml, sanitizeLetterHtml } from '@/lib/richtext';

export function exportToWord(content: string, fileName: string, title: string) {
  const isRich = looksLikeHtml(content);
  const bodyHtml = isRich
    ? sanitizeLetterHtml(content)
    : content.replace(/</g, '&lt;').replace(/\n/g, '<br/>');
  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  body {
    font-family: 'B Nazanin', 'Vazirmatn', 'Tahoma', 'Segoe UI', sans-serif;
    color: #1e293b;
    line-height: 2.2;
    font-size: 14pt;
    margin: 2cm;
    text-align: justify;
  }
  .letter-title {
    font-size: 16pt;
    font-weight: bold;
    text-align: center;
    margin-bottom: 1.5rem;
    color: #0f172a;
  }
  .letter-body {
    ${isRich ? '' : 'white-space: pre-wrap;'}
    text-align: justify;
  }
</style>
</head>
<body>
  <div class="letter-title">${title}</div>
  <div class="letter-body">${bodyHtml}</div>
</body>
</html>`;

  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
