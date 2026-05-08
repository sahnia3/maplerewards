#!/usr/bin/env node
/* Direct downloads for cards where we identified specific good URLs. */
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(ROOT, "public", "cards");
const MANIFEST = path.join(OUT, "manifest.json");

/* Each entry has a fallback chain — try each url in order, accept first that yields a valid image. */
const FIXES = [
  { slug: "simplii-financial-cash-back-visa", urls: [
    /* frugalflyer's clean card-named asset — 500x316 ratio 1.58 — best card-only crop */
    "https://frugalflyer.ca/wp-content/uploads/2023/11/simplii-financial-cash-back-visa-card.png",
    "https://milesopedia.com/wp-content/uploads/2024/04/simplii-financial-cash-back-visa-card.png",
  ]},
  { slug: "tangerine-money-back-credit-card", urls: [
    /* lowestrates.ca + loanscanada.ca + media.creditcardgenius.ca with referer */
    "https://www.lowestrates.ca/sites/default/files/Card-of-the-month-Tangerine-Money-Back-Credit-Card.jpg",
    "https://loanscanada.ca/wp-content/uploads/2021/11/Tangerine-Money-Back-Card-Review.png",
    "https://media.creditcardgenius.ca/credit-card-images/lg/tangerine-moneyback-mastercard.png",
  ]},
  { slug: "tangerine-world-mastercard", urls: [
    "https://milesopedia.com/wp-content/uploads/2025/10/Tangerine-money-back-world.png",
    "https://www.tangerine.ca/adobe/dynamicmedia/deliver/dm-aid--1be10dc7-3f83-46ad-bf52-de64cb92ee77/world-hero-ver2-sm-md-lg-1x1-contain-en.jpg",
    "https://media.creditcardgenius.ca/credit-card-images/lg/tangerine-world-mastercard.png",
  ]},
];

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/121.0",
  "Accept": "image/avif,image/webp,*/*;q=0.8",
  "Referer": "https://www.google.com/",
};

async function tryDownload(url, refererOverride) {
  const headers = { ...HEADERS };
  if (refererOverride) headers.Referer = refererOverride;
  const r = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = r.headers.get("content-type") || "";
  if (!/image/i.test(ct)) throw new Error(`not image (${ct})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 5000) throw new Error(`tiny ${buf.length}b`);
  return { buf, ext: /\.jpe?g(\?|$)/i.test(url) ? "jpg" : /\.webp(\?|$)/i.test(url) ? "webp" : "png" };
}

const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
let made = 0, fail = 0;
for (const { slug, urls } of FIXES) {
  let saved = false;
  for (const url of urls) {
    /* Use the URL's own host as referer to defeat hotlink blocks */
    const refHost = new URL(url).origin + "/";
    try {
      const { buf, ext } = await tryDownload(url, refHost);
      for (const e of ["png", "jpg", "webp"]) {
        try { await fs.unlink(path.join(OUT, `${slug}.${e}`)); } catch {}
      }
      await fs.writeFile(path.join(OUT, `${slug}.${ext}`), buf);
      manifest[slug] = ext;
      console.log(`  ✓ ${slug}: ${(buf.length/1024).toFixed(0)}kB ← ${new URL(url).host}`);
      made++; saved = true; break;
    } catch (e) {
      console.log(`    [${new URL(url).host}] ${e.message}`);
    }
  }
  if (!saved) { console.log(`  ✗ ${slug}: all ${urls.length} candidates failed`); fail++; }
}
await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
console.log(`\n${made} downloaded, ${fail} failed.`);
