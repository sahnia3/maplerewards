#!/usr/bin/env node
/**
 * Extract the card region (Gemini bbox) then rotate to landscape if portrait.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "public", "cards");
const MANIFEST = path.join(OUT, "manifest.json");
const KEY = process.env.GEMINI_API_KEY;
const slug = process.argv[2];
if (!slug) { console.error("usage: extract-rotate.mjs <slug>"); process.exit(1); }

async function detectBbox(p) {
  const buf = await fs.readFile(p);
  const e = path.extname(p).slice(1).toLowerCase();
  const mime = e === "jpg" || e === "jpeg" ? "image/jpeg" : "image/png";
  const body = {
    contents: [{ parts: [
      { text: 'Detect the credit card in the image. Return ONLY {"ymin":int,"xmin":int,"ymax":int,"xmax":int} normalized 0-1000. Tight to the card edges. Single card.' },
      { inlineData: { mimeType: mime, data: buf.toString("base64") } }
    ]}],
    generationConfig: { temperature: 0, maxOutputTokens: 800, thinkingConfig: { thinkingBudget: 0 } }
  };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  const text = (j?.candidates?.[0]?.content?.parts?.[0]?.text || "").replace(/```(?:json)?/g, "").trim();
  const m = text.match(/\{[\s\S]*?\}/);
  return JSON.parse(m[0]);
}

const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
const ext = manifest[slug];
const fp = path.join(OUT, `${slug}.${ext}`);
const meta = await sharp(fp).metadata();
console.log(`source: ${meta.width}x${meta.height}`);

const bbox = await detectBbox(fp);
const left = Math.round((bbox.xmin / 1000) * meta.width);
const top = Math.round((bbox.ymin / 1000) * meta.height);
const w = Math.round((bbox.xmax / 1000) * meta.width) - left;
const h = Math.round((bbox.ymax / 1000) * meta.height) - top;
console.log(`bbox: ${w}x${h} ratio ${(w/h).toFixed(2)}`);

let pipeline = sharp(fp).extract({ left, top, width: w, height: h });
/* If extracted region is portrait (h > w), rotate 90° to landscape */
if (h > w) {
  pipeline = pipeline.rotate(-90);  /* CCW so the right edge of card becomes the top */
  console.log(`rotating 90° CCW (was portrait ${w}x${h})`);
}
await pipeline.toFile(fp + ".tmp");
await fs.rename(fp + ".tmp", fp);

const newMeta = await sharp(fp).metadata();
console.log(`✓ final: ${newMeta.width}x${newMeta.height} ratio ${(newMeta.width/newMeta.height).toFixed(2)}`);
