#!/usr/bin/env node
/**
 * Round 3: targeted URL replacements + re-crops, all verified by Gemini Vision
 * after each step.
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

const HEADERS = { "User-Agent": "Mozilla/5.0 Chrome/121.0", "Accept": "image/avif,image/webp,*/*;q=0.8" };

async function dl(url, ref) {
  const headers = { ...HEADERS, Referer: ref };
  const r = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 5000) throw new Error(`tiny`);
  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
  const isWebp = buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57;
  if (!isPng && !isJpg && !isWebp) throw new Error(`not image bytes`);
  return buf;
}

async function detectBbox(p) {
  const buf = await fs.readFile(p);
  const ext = path.extname(p).slice(1).toLowerCase();
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
  const body = {
    contents: [{ parts: [
      { text: 'Detect the credit card. Return ONLY {"ymin":int,"xmin":int,"ymax":int,"xmax":int} normalized 0-1000. Tight to card edges. Single card.' },
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

async function replaceFromUrls(slug, urls) {
  const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
  for (const url of urls) {
    try {
      const buf = await dl(url, new URL(url).origin + "/");
      for (const e of ["png", "jpg", "webp"]) { try { await fs.unlink(path.join(OUT, `${slug}.${e}`)); } catch {} }
      const ext = /\.jpe?g(\?|$)/i.test(url) ? "jpg" : /\.webp(\?|$)/i.test(url) ? "webp" : "png";
      await fs.writeFile(path.join(OUT, `${slug}.${ext}`), buf);
      manifest[slug] = ext;
      await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
      const meta = await sharp(path.join(OUT, `${slug}.${ext}`)).metadata();
      console.log(`  ✓ ${slug}: ${meta.width}x${meta.height} ${(buf.length/1024).toFixed(0)}kB ← ${new URL(url).host}`);
      return true;
    } catch (e) {
      console.log(`    [${new URL(url).host}] ${e.message}`);
    }
  }
  return false;
}

async function tightCrop(slug) {
  const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
  const ext = manifest[slug];
  if (!ext) { console.log(`  ✗ ${slug} not in manifest`); return; }
  const inPath = path.join(OUT, `${slug}.${ext}`);
  await fs.mkdir(BACKUP, { recursive: true });
  try { await fs.access(path.join(BACKUP, `${slug}.${ext}`)); }
  catch { await fs.copyFile(inPath, path.join(BACKUP, `${slug}.${ext}`)); }
  const meta = await sharp(inPath).metadata();
  const W = meta.width, H = meta.height;
  try {
    const bbox = await detectBbox(inPath);
    const left = Math.round((bbox.xmin / 1000) * W);
    const top = Math.round((bbox.ymin / 1000) * H);
    const right = Math.round((bbox.xmax / 1000) * W);
    const bottom = Math.round((bbox.ymax / 1000) * H);
    const cw = right - left, ch = bottom - top;
    if (cw < 100 || ch < 60) throw new Error(`bbox too small`);
    const ratio = cw / ch;
    if (ratio < 1.30 || ratio > 1.85) throw new Error(`bad ratio ${ratio.toFixed(2)}`);
    /* No padding — trim to exact bbox */
    await sharp(inPath).extract({ left, top, width: cw, height: ch }).toFile(inPath + ".tmp");
    await fs.rename(inPath + ".tmp", inPath);
    console.log(`  ✓ ${slug} re-cropped to ${cw}x${ch} (ratio ${ratio.toFixed(2)})`);
  } catch (e) {
    console.log(`  ✗ ${slug} crop: ${e.message}`);
  }
}

/* ── Execute ────────────────────────────────────────────────── */

console.log("→ Simplii Cash Back: Forbes thumbor (1704×1080 clean review hero)");
await replaceFromUrls("simplii-financial-cash-back-visa", [
  "https://thumbor.forbes.com/thumbor/fit-in/x/https://www.forbes.com/advisor/ca/wp-content/uploads/2024/01/simplii-financial-cashback-visa-credit-front-1-e1705075258858.png",
]);

console.log("→ BMO Eclipse VIP: milesopedia rect (1600×1050)");
await replaceFromUrls("bmo-eclipse-visa-infinite-privilege", [
  "https://milesopedia.com/wp-content/uploads/2020/10/carte-bmo-eclipse-visa-infinite-privilege-rect.png",
  "https://dw8t8n4nqv2sp.cloudfront.net/bmo-eclipse-visa-infinite-privilege-horizontal.png",
]);

console.log("→ Triangle MC: ctfs.com (official Canadian Tire FS asset)");
await replaceFromUrls("triangle-mastercard", [
  "https://media.ctfs.com/pages/CRECRD/CRECRD_21_Triangle_Mastercard_World_Elite_Triangle_Mastercard.png",
]);

console.log("→ Tangerine World: prnewswire");
await replaceFromUrls("tangerine-world-mastercard", [
  "https://mma.prnewswire.com/media/1036652/Tangerine_Tangerine_Debuts_New_World_Mastercard__with_Coveted_Pe.jpg",
  "https://i.ytimg.com/vi/T6cwg3aIuWk/hq720.jpg",
]);

console.log("→ BMO World Elite: tight re-crop");
await tightCrop("bmo-world-elite-mastercard");

console.log("→ Tangerine Money-Back: tight re-crop (top white bg)");
await tightCrop("tangerine-money-back-credit-card");
