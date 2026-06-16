// Reads the LinkedIn-articles workflow output JSON and renders a styled, print-ready HTML.
// Usage: node articles2html.mjs <workflow-output.json> <out.html>
import fs from 'fs';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';

const [, , inPath, outPath] = process.argv;
const top = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const articles = top.result.edited.articles;
const editorNote = top.result.edited.editor_note || '';

const md = (s) => micromark(s || '', { allowDangerousHtml: true, extensions: [gfm()], htmlExtensions: [gfmHtml()] });

const CSS = `
@page { size: Letter; margin: 22mm 20mm; }
* { box-sizing: border-box; }
body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; font-size: 12pt; line-height: 1.6; margin: 0; }
.cover { text-align: center; padding-top: 40mm; page-break-after: always; }
.cover .kick { font-family: Menlo, monospace; font-size: 9pt; letter-spacing: .2em; text-transform: uppercase; color: #A51F2D; }
.cover h1 { font-size: 30pt; font-weight: 400; margin: 12px 0; }
.cover p { color: #555; font-size: 12pt; max-width: 460px; margin: 8px auto; }
.cover ol { display: inline-block; text-align: left; color: #333; font-size: 12pt; margin-top: 18px; }
.article { page-break-before: always; }
.eyebrow { font-family: Menlo, monospace; font-size: 8.5pt; letter-spacing: .18em; text-transform: uppercase; color: #A51F2D; margin-bottom: 6px; }
h1.title { font-size: 23pt; font-weight: 600; line-height: 1.15; margin: 0 0 6px; color: #111; }
.deck { font-size: 13pt; font-style: italic; color: #555; margin: 0 0 4px; line-height: 1.4; }
.meta { font-family: Menlo, monospace; font-size: 8.5pt; color: #999; margin: 6px 0 18px; letter-spacing: .05em; }
hr.rule { border: none; border-top: 2px solid #A51F2D; margin: 10px 0 18px; }
h2 { font-size: 14pt; font-weight: 600; margin: 22px 0 8px; color: #A51F2D; page-break-after: avoid; }
p { margin: 11px 0; }
strong { color: #111; }
.editor { page-break-before: always; font-size: 10.5pt; color: #444; }
.editor h2 { color: #A51F2D; }
.editor .box { background: #faf8f5; border-left: 3px solid #A51F2D; padding: 12px 16px; }
`;

const cover = `<div class="cover">
<div class="kick">MapleRewards · LinkedIn launch articles · 2026-06-14</div>
<h1>Three articles, one voice.</h1>
<p>Long-form launch pieces for your personal LinkedIn, in your established voice. Review here; paste into LinkedIn's article editor when you post.</p>
<ol>${articles.map(a => `<li><strong>${a.title}</strong></li>`).join('')}</ol>
</div>`;

const body = articles.map((a, i) => `<div class="article">
<div class="eyebrow">Article ${i + 1} · ${a.angle.replace(/-/g, ' ')}</div>
<h1 class="title">${a.title}</h1>
<p class="deck">${a.subtitle}</p>
<div class="meta">~${a.word_count} words</div>
<hr class="rule">
${md(a.body_markdown)}
</div>`).join('');

const editor = editorNote ? `<div class="editor"><h2>Editor's note (what was changed)</h2><div class="box">${md(editorNote)}</div></div>` : '';

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MapleRewards — LinkedIn Launch Articles</title><style>${CSS}</style></head><body>${cover}${body}${editor}</body></html>`;
fs.writeFileSync(outPath, html);
console.log('wrote', outPath, html.length, 'bytes ·', articles.length, 'articles');
