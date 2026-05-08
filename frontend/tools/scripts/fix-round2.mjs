#!/usr/bin/env node
/**
 * Round-2 fixes for cards user flagged after Gemini Vision verification:
 *   - rbc-avion-visa-platinum: replace with RBC official Avion Platinum (not Infinite)
 *   - capital-one-aspire-travel-world-elite-mastercard: replace with single-card source
 *   - capital-one-costco-mastercard: DROP from manifest (Capital One Costco was
 *     discontinued in Canada in 2015 when CIBC took over Costco MC; no real card art)
 *   - tangerine-money-back-credit-card: replace with hardbacon clean review image
 *   - tangerine-world-mastercard: rotate 90° to landscape (current is portrait)
 *   - bmo-air-miles-mastercard, bmo-rewards-mastercard: re-crop tighter via Gemini Vision
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

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/121.0",
  "Accept": "image/avif,image/webp,*/*;q=0.8",
};

async function dl(url, refererHost) {
  const headers = { ...HEADERS };
  if (refererHost) headers.Referer = refererHost;
  const r = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  /* Verify the bytes look like a real image by magic-number, not Content-Type
   * (some CDNs like rbcroyalbank.com return text/plain for .webp). */
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isWebp = buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
                 buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
  if (!isPng && !isJpg && !isWebp) throw new Error(`not image bytes (head ${[...buf.slice(0,4)].map(b => b.toString(16)).join(' ')})`);
  return buf;
}

async function detectBbox(imagePath) {
  const buf = await fs.readFile(imagePath);
  const b64 = buf.toString("base64");
  const ext = path.extname(imagePath).slice(1).toLowerCase();
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
  const body = {
    contents: [{ parts: [
      { text: 'Detect ONLY the credit card in the image, ignoring background, accessories, and any other objects. Return ONLY a JSON object with the bounding box of the card edges as normalized coordinates 0-1000: {"ymin":int,"xmin":int,"ymax":int,"xmax":int}. The bbox should be tight to the card edges (no background pixels included). Single card only.' },
      { inlineData: { mimeType: mime, data: b64 } },
    ]}],
    generationConfig: { temperature: 0, maxOutputTokens: 1500, thinkingConfig: { thinkingBudget: 0 } },
  };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  const text = (j?.candidates?.[0]?.content?.parts?.[0]?.text || "").replace(/```(?:json)?/g, "").trim();
  const m = text.match(/\{[\s\S]*?\}/);
  if (!m) throw new Error(`no json: ${text.slice(0, 100)}`);
  return JSON.parse(m[0]);
}

async function tightCrop(slug) {
  const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
  const ext = manifest[slug];
  const inPath = path.join(OUT, `${slug}.${ext}`);
  await fs.mkdir(BACKUP, { recursive: true });
  const backupPath = path.join(BACKUP, `${slug}.${ext}`);
  try { await fs.access(backupPath); }
  catch { await fs.copyFile(inPath, backupPath); }

  const meta = await sharp(inPath).metadata();
  const W = meta.width, H = meta.height;
  const bbox = await detectBbox(inPath);
  const left = Math.round((bbox.xmin / 1000) * W);
  const top = Math.round((bbox.ymin / 1000) * H);
  const right = Math.round((bbox.xmax / 1000) * W);
  const bottom = Math.round((bbox.ymax / 1000) * H);
  const cw = right - left, ch = bottom - top;
  if (cw < 100 || ch < 60) throw new Error(`bbox too small`);
  const ratio = cw / ch;
  if (ratio < 1.30 || ratio > 1.85) throw new Error(`bad ratio ${ratio.toFixed(2)}`);
  /* NEGATIVE pad — trim a few pixels INSIDE the bbox to remove any edge sliver */
  const padX = -Math.round(cw * 0.005);
  const padY = -Math.round(ch * 0.005);
  const finalLeft = Math.max(0, left - padX);
  const finalTop = Math.max(0, top - padY);
  const finalW = Math.min(W - finalLeft, cw + 2 * padX);
  const finalH = Math.min(H - finalTop, ch + 2 * padY);
  await sharp(inPath).extract({ left: finalLeft, top: finalTop, width: finalW, height: finalH }).toFile(inPath + ".tmp");
  await fs.rename(inPath + ".tmp", inPath);
  console.log(`  ✓ ${slug} re-cropped to ${finalW}x${finalH} (ratio ${(finalW/finalH).toFixed(2)})`);
}

async function rotateHorizontal(slug) {
  const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
  const ext = manifest[slug];
  const inPath = path.join(OUT, `${slug}.${ext}`);
  await fs.mkdir(BACKUP, { recursive: true });
  const backupPath = path.join(BACKUP, `${slug}.${ext}`);
  try { await fs.access(backupPath); }
  catch { await fs.copyFile(inPath, backupPath); }
  /* Rotate 90° clockwise then crop to bbox via Gemini for tight fit */
  await sharp(inPath).rotate(90).toFile(inPath + ".rot");
  await fs.rename(inPath + ".rot", inPath);
  const meta = await sharp(inPath).metadata();
  console.log(`  ✓ ${slug} rotated 90° → ${meta.width}x${meta.height}`);
  /* Now crop tight to card */
  try { await tightCrop(slug); }
  catch (e) { console.log(`    crop after rotate failed: ${e.message} (rotation kept)`); }
}

async function replaceFromUrl(slug, urls) {
  const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
  for (const url of urls) {
    try {
      const buf = await dl(url, new URL(url).origin + "/");
      for (const e of ["png", "jpg", "webp"]) {
        try { await fs.unlink(path.join(OUT, `${slug}.${e}`)); } catch {}
      }
      const ext = /\.jpe?g(\?|$)/i.test(url) ? "jpg" : /\.webp(\?|$)/i.test(url) ? "webp" : "png";
      await fs.writeFile(path.join(OUT, `${slug}.${ext}`), buf);
      manifest[slug] = ext;
      await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
      console.log(`  ✓ ${slug}: ${(buf.length/1024).toFixed(0)}kB ← ${new URL(url).host}`);
      return true;
    } catch (e) {
      console.log(`    [${new URL(url).host}] ${e.message}`);
    }
  }
  return false;
}

async function dropFromManifest(slug) {
  const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
  if (manifest[slug]) {
    const ext = manifest[slug];
    try { await fs.unlink(path.join(OUT, `${slug}.${ext}`)); } catch {}
    delete manifest[slug];
    await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`  ⊝ ${slug} dropped (gradient sprite fallback)`);
  }
}

/* ── Execute the fixes ────────────────────────────────────────── */

console.log("→ RBC Avion Visa Platinum: replace with RBC official Avion Platinum image");
await replaceFromUrl("rbc-avion-visa-platinum", [
  /* Official RBC asset (URL contains "platinumavion") */
  "https://www.rbcroyalbank.com/credit-cards/_assets-custom/images/cards/gcp_platinumavion_en_sm.png",
  /* Higher-res RBC */
  "https://www.rbcroyalbank.com/credit-cards/canada/travel/images/rbc-visa-platinum-avion.webp",
]);

console.log("→ Capital One Aspire Travel WE: replace with single-card review image");
await replaceFromUrl("capital-one-aspire-travel-world-elite-mastercard", [
  "https://tawcan.b-cdn.net/wp-content/uploads/2020/07/capital-one-travel-aspire.jpg",
]);

console.log("→ Capital One Costco Mastercard: drop (discontinued in Canada 2015)");
await dropFromManifest("capital-one-costco-mastercard");

console.log("→ Tangerine Money-Back: replace with hardbacon clean image");
await replaceFromUrl("tangerine-money-back-credit-card", [
  "https://hardbacon.ca/wp-content/uploads/2023/02/tangerine-money-back-credit-card-review-e1647445964544-1024x683.png",
  "https://frugalflyer.ca/wp-content/uploads/2022/01/tangerine-card-review.png",
]);

console.log("→ Tangerine World Mastercard: rotate 90° to landscape + crop");
await rotateHorizontal("tangerine-world-mastercard");

console.log("→ BMO Air Miles Mastercard: tight re-crop");
try { await tightCrop("bmo-air-miles-mastercard"); }
catch (e) { console.log(`  ✗ ${e.message}`); }

console.log("→ BMO Rewards Mastercard: tight re-crop");
try { await tightCrop("bmo-rewards-mastercard"); }
catch (e) { console.log(`  ✗ ${e.message}`); }

console.log("\nAll fixes applied. Run verify-cards.mjs to confirm.");
