import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = "/Users/adityasahni/Desktop/Claudecode/maplerewards/maplerewards-main/frontend";
const OUT = path.join(ROOT, "public", "cards");
const MANIFEST = path.join(OUT, "manifest.json");
const HEADERS = { "User-Agent": "Mozilla/5.0 Chrome/121.0", "Accept": "image/avif,image/webp,*/*;q=0.8" };

async function dl(url, ref) {
  const headers = { ...HEADERS, Referer: ref };
  const r = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 5000) throw new Error("tiny");
  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
  const isWebp = buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57;
  if (!isPng && !isJpg && !isWebp) throw new Error("not image");
  return buf;
}

const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));

/* Triangle MC: try blog.rewardscanada and finlywealth */
console.log("→ Triangle MC");
for (const url of [
  "https://blog.rewardscanada.ca/wp-content/uploads/2024/09/triangle-mastercard.jpg",
  "https://media-triangle.canadiantire.ca/category-content/2023/triangle-ca-odp-2022-/triangle-world-credit-card.png",
]) {
  try {
    const buf = await dl(url, new URL(url).origin + "/");
    for (const e of ["png","jpg","webp"]) { try { await fs.unlink(path.join(OUT, `triangle-mastercard.${e}`)); } catch {} }
    const ext = /\.jpe?g(\?|$)/i.test(url) ? "jpg" : "png";
    await fs.writeFile(path.join(OUT, `triangle-mastercard.${ext}`), buf);
    manifest["triangle-mastercard"] = ext;
    const m = await sharp(path.join(OUT, `triangle-mastercard.${ext}`)).metadata();
    console.log(`  ✓ ${m.width}x${m.height} ${(buf.length/1024).toFixed(0)}kB ← ${new URL(url).host}`);
    break;
  } catch (e) { console.log(`    [${new URL(url).host}] ${e.message}`); }
}

/* Tangerine World: extract+rotate the prnewswire portrait */
console.log("→ Tangerine World: replace with frugalflyer landscape");
for (const url of [
  "https://frugalflyer.ca/wp-content/uploads/2025/10/tangerine-money-back-world-mastercard.png",
  "https://hardbacon.ca/wp-content/uploads/2023/08/tangerine-world-mastercard-vs-money-back-1024x683.png",
]) {
  try {
    const buf = await dl(url, new URL(url).origin + "/");
    for (const e of ["png","jpg","webp"]) { try { await fs.unlink(path.join(OUT, `tangerine-world-mastercard.${e}`)); } catch {} }
    const ext = /\.jpe?g(\?|$)/i.test(url) ? "jpg" : "png";
    await fs.writeFile(path.join(OUT, `tangerine-world-mastercard.${ext}`), buf);
    manifest["tangerine-world-mastercard"] = ext;
    const m = await sharp(path.join(OUT, `tangerine-world-mastercard.${ext}`)).metadata();
    console.log(`  ✓ ${m.width}x${m.height} ${(buf.length/1024).toFixed(0)}kB ← ${new URL(url).host}`);
    break;
  } catch (e) { console.log(`    [${new URL(url).host}] ${e.message}`); }
}

/* Tangerine MoneyBack: replace with frugalflyer 500x316 */
console.log("→ Tangerine MoneyBack: frugalflyer clean source");
for (const url of [
  "https://frugalflyer.ca/wp-content/uploads/2026/04/tangerine-rewards-world-elite-on-stack-of-credit-cards.jpg",
  "https://www.lowestrates.ca/sites/default/files/Card-of-the-month-Tangerine-Money-Back-Credit-Card.jpg",
]) {
  try {
    const buf = await dl(url, new URL(url).origin + "/");
    for (const e of ["png","jpg","webp"]) { try { await fs.unlink(path.join(OUT, `tangerine-money-back-credit-card.${e}`)); } catch {} }
    const ext = /\.jpe?g(\?|$)/i.test(url) ? "jpg" : "png";
    await fs.writeFile(path.join(OUT, `tangerine-money-back-credit-card.${ext}`), buf);
    manifest["tangerine-money-back-credit-card"] = ext;
    const m = await sharp(path.join(OUT, `tangerine-money-back-credit-card.${ext}`)).metadata();
    console.log(`  ✓ ${m.width}x${m.height} ${(buf.length/1024).toFixed(0)}kB ← ${new URL(url).host}`);
    break;
  } catch (e) { console.log(`    [${new URL(url).host}] ${e.message}`); }
}

await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
