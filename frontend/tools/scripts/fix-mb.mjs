import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = "/Users/adityasahni/Desktop/Claudecode/maplerewards/maplerewards-main/frontend";
const OUT = path.join(ROOT, "public", "cards");
const MANIFEST = path.join(OUT, "manifest.json");
const HEADERS = { "User-Agent": "Mozilla/5.0 Chrome/121.0", "Accept": "image/avif,image/webp,*/*;q=0.8" };

async function dl(url) {
  const r = await fetch(url, { headers: { ...HEADERS, Referer: new URL(url).origin + "/" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return buf;
}

const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
const url = "https://hardbacon.ca/wp-content/uploads/2023/02/tangerine-money-back-credit-card-review-e1647445964544-1024x683.png";
const buf = await dl(url);
for (const e of ["png","jpg","webp"]) { try { await fs.unlink(path.join(OUT, `tangerine-money-back-credit-card.${e}`)); } catch {} }
await fs.writeFile(path.join(OUT, `tangerine-money-back-credit-card.png`), buf);
manifest["tangerine-money-back-credit-card"] = "png";
await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
const m = await sharp(path.join(OUT, "tangerine-money-back-credit-card.png")).metadata();
console.log(`✓ ${m.width}x${m.height} ${(buf.length/1024).toFixed(0)}kB ← hardbacon (kept full, no crop)`);
