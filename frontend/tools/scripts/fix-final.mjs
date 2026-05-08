#!/usr/bin/env node
/**
 * Final cleanup:
 *   - tangerine-world-mastercard: rotate didn't fix orientation. Restore from backup,
 *     try fetching milesopedia landscape variant. If that fails, accept square.
 *   - capital-one-aspire-travel-world-elite-mastercard: tawcan image Gemini can't
 *     ID. Try one more source, else drop to gradient sprite.
 *   - tangerine-money-back-credit-card: needs tighter crop (doesn't fill frame).
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
  const r = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 5000) throw new Error(`tiny`);
  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
  const isWebp = buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57;
  if (!isPng && !isJpg && !isWebp) throw new Error(`not image`);
  return buf;
}
async function detectBbox(p) {
  const buf = await fs.readFile(p);
  const ext = path.extname(p).slice(1).toLowerCase();
  const mime = ext === "jpg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
  const body = {
    contents: [{ parts: [
      { text: 'Detect the credit card in the image. Return ONLY {"ymin":int,"xmin":int,"ymax":int,"xmax":int} normalized 0-1000. Tight to card edges. Single card.' },
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

/* ── 1. Restore Tangerine World original; try milesopedia direct */
console.log("→ tangerine-world-mastercard");
{
  const slug = "tangerine-world-mastercard";
  /* Restore from backup */
  for (const e of ["png", "jpg", "webp"]) {
    try { await fs.unlink(path.join(OUT, `${slug}.${e}`)); } catch {}
  }
  try {
    await fs.copyFile(path.join(BACKUP, `${slug}.jpg`), path.join(OUT, `${slug}.jpg`));
    manifest[slug] = "jpg";
    console.log(`  ⊝ restored tangerine.ca original`);
  } catch {}
  /* Try milesopedia direct */
  try {
    const buf = await dl("https://milesopedia.com/wp-content/uploads/2025/10/Tangerine-money-back-world.png", "https://milesopedia.com/");
    for (const e of ["png", "jpg", "webp"]) {
      try { await fs.unlink(path.join(OUT, `${slug}.${e}`)); } catch {}
    }
    await fs.writeFile(path.join(OUT, `${slug}.png`), buf);
    manifest[slug] = "png";
    console.log(`  ✓ replaced with milesopedia 600×378 landscape (${(buf.length/1024).toFixed(0)}kB)`);
  } catch (e) {
    console.log(`  milesopedia failed: ${e.message} — keeping tangerine.ca square`);
  }
}

/* ── 2. Capital One Aspire WE — try other sources, else drop */
console.log("→ capital-one-aspire-travel-world-elite-mastercard");
{
  const slug = "capital-one-aspire-travel-world-elite-mastercard";
  const urls = [
    "https://media.creditcardgenius.ca/uploads/2020/07/capital-one-aspire-world-elite-mastercard-changes.jpg",
    "https://rewardscardscanada.com/wp-content/uploads/2015/02/Changes_to_Cap_One_Aspire_cards.png",
  ];
  let saved = false;
  for (const u of urls) {
    try {
      const buf = await dl(u, new URL(u).origin + "/");
      for (const e of ["png", "jpg", "webp"]) {
        try { await fs.unlink(path.join(OUT, `${slug}.${e}`)); } catch {}
      }
      const ext = /\.jpe?g(\?|$)/i.test(u) ? "jpg" : "png";
      await fs.writeFile(path.join(OUT, `${slug}.${ext}`), buf);
      manifest[slug] = ext;
      console.log(`  ✓ replaced via ${new URL(u).host} (${(buf.length/1024).toFixed(0)}kB)`);
      saved = true;
      break;
    } catch (e) {
      console.log(`    ${new URL(u).host}: ${e.message}`);
    }
  }
  if (!saved) {
    /* Drop — Capital One Aspire was discontinued in Canada around 2018-2020,
     * very limited clean card art exists publicly. */
    for (const e of ["png", "jpg", "webp"]) {
      try { await fs.unlink(path.join(OUT, `${slug}.${e}`)); } catch {}
    }
    delete manifest[slug];
    console.log(`  ⊝ dropped (gradient sprite fallback)`);
  }
}

/* ── 3. Tangerine MoneyBack — tight crop */
console.log("→ tangerine-money-back-credit-card: tight crop");
{
  const slug = "tangerine-money-back-credit-card";
  const ext = manifest[slug];
  if (ext) {
    const inPath = path.join(OUT, `${slug}.${ext}`);
    try {
      const meta = await sharp(inPath).metadata();
      const W = meta.width, H = meta.height;
      const bbox = await detectBbox(inPath);
      const left = Math.round((bbox.xmin / 1000) * W);
      const top = Math.round((bbox.ymin / 1000) * H);
      const right = Math.round((bbox.xmax / 1000) * W);
      const bottom = Math.round((bbox.ymax / 1000) * H);
      const cw = right - left, ch = bottom - top;
      if (cw >= 100 && ch >= 60 && (cw/ch) >= 1.30 && (cw/ch) <= 1.85) {
        await sharp(inPath).extract({ left, top, width: cw, height: ch }).toFile(inPath + ".tmp");
        await fs.rename(inPath + ".tmp", inPath);
        console.log(`  ✓ cropped to ${cw}x${ch} (ratio ${(cw/ch).toFixed(2)})`);
      } else {
        console.log(`  ⚠ bbox ratio ${(cw/ch).toFixed(2)} not card-shape — kept original`);
      }
    } catch (e) {
      console.log(`  ✗ crop failed: ${e.message}`);
    }
  }
}

await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
console.log(`\nDone. Manifest: ${Object.keys(manifest).length} entries.`);
