// Renders the flagship-intro workflow output (.result.final) to styled print HTML.
// Usage: node flagship2html.mjs <workflow-output.json> <out.html>
import fs from 'fs';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';

const [, , inPath, outPath] = process.argv;
const f = JSON.parse(fs.readFileSync(inPath, 'utf8')).result.final;
const md = (s) => micromark(s || '', { allowDangerousHtml: true, extensions: [gfm()], htmlExtensions: [gfmHtml()] });

const CSS = `
@page { size: Letter; margin: 22mm 20mm; }
* { box-sizing: border-box; }
body { font-family: Georgia,'Times New Roman',serif; color:#1a1a1a; font-size:12pt; line-height:1.62; margin:0; }
.eyebrow { font-family: Menlo,monospace; font-size:8.5pt; letter-spacing:.18em; text-transform:uppercase; color:#A51F2D; margin-bottom:6px; }
h1.title { font-size:25pt; font-weight:600; line-height:1.14; margin:0 0 8px; color:#111; }
.deck { font-size:13.5pt; font-style:italic; color:#555; margin:0 0 4px; line-height:1.45; }
.meta { font-family: Menlo,monospace; font-size:8.5pt; color:#999; margin:8px 0 16px; letter-spacing:.05em; }
hr.rule { border:none; border-top:2px solid #A51F2D; margin:8px 0 20px; }
h2 { font-size:14.5pt; font-weight:600; margin:24px 0 8px; color:#A51F2D; page-break-after:avoid; }
p { margin:12px 0; }
strong { color:#111; }
.appendix { page-break-before:always; }
.appendix h2 { border-bottom:1px solid #e2e2e2; padding-bottom:6px; }
.box { background:#faf8f5; border-left:3px solid #A51F2D; padding:12px 16px; margin:10px 0; font-size:11pt; }
ol.alts { font-size:12pt; } ol.alts li { margin:7px 0; }
.note { font-size:10pt; color:#666; }
`;

const alts = (f.alt_titles || []).map(t => `<li>${t}</li>`).join('');
const appendix = `<div class="appendix">
<div class="eyebrow">Posting kit</div>
<h2>Alternate headlines (A/B these)</h2>
<ol class="alts"><li><strong>${f.title}</strong> &nbsp;<span class="note">(current)</span></li>${alts}</ol>
<h2>First comment (put the link here, not in the body)</h2>
<div class="box">${md(f.first_comment)}</div>
${f.judge_note ? `<h2>How this was built</h2><div class="box note">${md(f.judge_note)}</div>` : ''}
</div>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MapleRewards — Flagship LinkedIn Intro</title><style>${CSS}</style></head><body>
<div class="eyebrow">MapleRewards · Flagship LinkedIn intro (post #1) · 2026-06-14</div>
<h1 class="title">${f.title}</h1>
<p class="deck">${f.subtitle}</p>
<div class="meta">~${f.word_count} words · long-form article</div>
<hr class="rule">
${md(f.body_markdown)}
${appendix}
</body></html>`;
fs.writeFileSync(outPath, html);
console.log('wrote', outPath, html.length, 'bytes ·', f.word_count, 'words ·', (f.alt_titles||[]).length, 'alt titles');
