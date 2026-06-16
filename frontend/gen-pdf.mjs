// Renders an HTML file to PDF via Playwright (run from frontend/ so playwright resolves).
// Usage: node gen-pdf.mjs <input.html> <output.pdf>
import { chromium } from 'playwright';
const [, , inPath, outPath] = process.argv;
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('file://' + inPath, { waitUntil: 'networkidle' });
await p.pdf({
  path: outPath,
  format: 'Letter',
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: 0, bottom: 0, left: 0, right: 0 },
});
await b.close();
console.log('PDF written:', outPath);
