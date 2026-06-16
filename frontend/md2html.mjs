// Markdown (GFM) -> styled, print-ready HTML. Usage: node md2html.mjs <in.md> <out.html> "<Title>"
import fs from 'fs';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';

const [, , inPath, outPath, title = 'Document'] = process.argv;
const md = fs.readFileSync(inPath, 'utf8');
const body = micromark(md, { allowDangerousHtml: true, extensions: [gfm()], htmlExtensions: [gfmHtml()] });

const CSS = `
@page { size: Letter; margin: 22mm 18mm; }
* { box-sizing: border-box; }
body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; font-size: 11pt; line-height: 1.55; margin: 0; }
h1 { font-size: 26pt; font-weight: 400; line-height: 1.1; margin: 0 0 4px; color: #1a1a1a; }
h1 + p { color: #555; font-size: 11pt; margin-top: 0; }
h2 { font-size: 16pt; font-weight: 600; margin: 26px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #A51F2D; color: #1a1a1a; page-break-after: avoid; }
h3 { font-size: 12.5pt; font-weight: 600; margin: 18px 0 6px; color: #A51F2D; page-break-after: avoid; }
p { margin: 8px 0; }
a { color: #A51F2D; text-decoration: none; word-break: break-all; }
strong { color: #111; }
ul, ol { margin: 8px 0; padding-left: 22px; }
li { margin: 4px 0; }
li::marker { color: #A51F2D; }
code { font-family: Menlo, Consolas, monospace; font-size: 9.5pt; background: #f2efea; padding: 1px 5px; border-radius: 4px; color: #7a1420; }
pre { background: #f7f5f1; border: 1px solid #e2ddd4; border-radius: 8px; padding: 12px 14px; overflow-x: auto; }
pre code { background: none; padding: 0; color: #1a1a1a; }
blockquote { margin: 12px 0; padding: 10px 16px; background: #faf8f5; border-left: 3px solid #A51F2D; color: #333; font-style: italic; }
hr { border: none; border-top: 1px solid #e2e2e2; margin: 22px 0; }
table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 9.7pt; page-break-inside: avoid; }
th { background: #A51F2D; color: #fff; text-align: left; padding: 7px 9px; font-weight: 600; }
td { padding: 7px 9px; border-bottom: 1px solid #e6e2da; vertical-align: top; }
tr:nth-child(even) td { background: #faf8f5; }
table code { font-size: 9pt; }
/* GFM task-list checkboxes */
input[type=checkbox] { accent-color: #A51F2D; margin-right: 6px; transform: scale(1.05); }
ul:has(input[type=checkbox]) { list-style: none; padding-left: 4px; }
li:has(input[type=checkbox]) { margin: 6px 0; }
`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>${CSS}</style></head><body>${body}</body></html>`;
fs.writeFileSync(outPath, html);
console.log('wrote', outPath, html.length, 'bytes', body.includes('<table>') ? '(tables ok)' : '(no tables)');
