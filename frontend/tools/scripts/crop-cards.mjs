#!/usr/bin/env node
/**
 * Crop card art using Gemini Vision bbox detection.
 *
 * For each input slug:
 *   1. Load the existing card image.
 *   2. Send to gemini-2.5-flash with a bbox-detection prompt.
 *   3. Parse [ymin, xmin, ymax, xmax] from the model's JSON response (Gemini's
 *      documented spatial format, normalized to 1000).
 *   4. Crop with sharp (lossless, fast, native).
 *   5. Verify cropped result has card-aspect ratio (1.45-1.75); reject if not.
 *   6. Overwrite the file in public/cards/.
 *
 * Backs up originals to public/cards/_orig_backup/ first time we touch them.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "public", "cards");
const BACKUP = path.join(OUT, "_orig_backup");
const MANIFEST = path.join(OUT, "manifest.json");
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("Need GEMINI_API_KEY"); process.exit(1); }

/* The list of slugs whose existing image has too-much-background and needs cropping. */
const TARGETS = process.argv.slice(2).filter(a => !a.startsWith("--"));
if (!TARGETS.length) {
  console.error("Usage: node crop-cards.mjs <slug1> <slug2> ...");
  process.exit(1);
}

async function detectBbox(imagePath) {
  const buf = await fs.readFile(imagePath);
  const b64 = buf.toString("base64");
  const ext = path.extname(imagePath).slice(1).toLowerCase();
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";

  const body = {
    contents: [{
      parts: [
        { text: 'Detect the credit card in the image. Return ONLY a JSON object with the bounding box of the most prominent credit card as normalized coordinates [0-1000]: {"ymin":int,"xmin":int,"ymax":int,"xmax":int}. If multiple cards are visible, pick the largest/clearest single card. No explanation, no markdown, no extra text.' },
        { inlineData: { mimeType: mime, data: b64 } },
      ],
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 1500, thinkingConfig: { thinkingBudget: 0 } },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(KEY)}`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Gemini HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  /* Gemini response may have newlines, code fences, or extra prose. Strip + parse. */
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  const m = cleaned.match(/\{[\s\S]*?\}/);
  if (!m) throw new Error(`no json: ${text.slice(0, 200)}`);
  const bbox = JSON.parse(m[0]);
  if (typeof bbox.ymin !== "number" || typeof bbox.xmin !== "number" || typeof bbox.ymax !== "number" || typeof bbox.xmax !== "number") {
    throw new Error(`bad bbox: ${JSON.stringify(bbox)}`);
  }
  return bbox;
}

async function cropOne(slug) {
  const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
  const ext = manifest[slug];
  if (!ext) { console.log(`  ✗ ${slug}: not in manifest`); return; }
  const inPath = path.join(OUT, `${slug}.${ext}`);

  /* Backup original if not already */
  await fs.mkdir(BACKUP, { recursive: true });
  const backupPath = path.join(BACKUP, `${slug}.${ext}`);
  try {
    await fs.access(backupPath);
  } catch {
    await fs.copyFile(inPath, backupPath);
  }

  const meta = await sharp(inPath).metadata();
  const W = meta.width, H = meta.height;
  console.log(`  ${slug}: original ${W}x${H}, asking Gemini for bbox…`);
  const bbox = await detectBbox(inPath);

  /* Convert from 0-1000 normalized to pixels */
  const left = Math.round((bbox.xmin / 1000) * W);
  const top = Math.round((bbox.ymin / 1000) * H);
  const right = Math.round((bbox.xmax / 1000) * W);
  const bottom = Math.round((bbox.ymax / 1000) * H);
  const cw = right - left, ch = bottom - top;
  if (cw < 100 || ch < 60) {
    console.log(`  ✗ ${slug}: bbox too small (${cw}x${ch}) — skipping`);
    return;
  }
  const ratio = cw / ch;
  if (ratio < 1.30 || ratio > 1.85) {
    console.log(`  ⚠ ${slug}: cropped ratio ${ratio.toFixed(2)} not card-shape (${cw}x${ch}) — saving anyway`);
  }

  /* Add a tiny pad (2% of dim) so we don't shave the card edges */
  const padX = Math.round(cw * 0.02);
  const padY = Math.round(ch * 0.02);
  const finalLeft = Math.max(0, left - padX);
  const finalTop = Math.max(0, top - padY);
  const finalW = Math.min(W - finalLeft, cw + 2 * padX);
  const finalH = Math.min(H - finalTop, ch + 2 * padY);

  await sharp(inPath)
    .extract({ left: finalLeft, top: finalTop, width: finalW, height: finalH })
    .toFile(inPath + ".tmp");
  await fs.rename(inPath + ".tmp", inPath);
  console.log(`  ✓ ${slug}: cropped to ${finalW}x${finalH} (ratio ${(finalW/finalH).toFixed(2)})`);
}

for (const slug of TARGETS) {
  try { await cropOne(slug); }
  catch (e) { console.log(`  ✗ ${slug}: ${e.message}`); }
}
