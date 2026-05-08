#!/usr/bin/env node
/**
 * process-apify-output.mjs
 *
 * Reads the Apify web-scraper dataset, fuzzy-matches each scraped image's alt text
 * against the catalogue card names, downloads matches to public/cards/<slug>.<ext>,
 * and updates manifest.json. Idempotent — won't overwrite existing files unless --force.
 *
 * Usage:
 *   APIFY_TOKEN=... DATASET_ID=... node tools/scripts/process-apify-output.mjs
 *   APIFY_TOKEN=... DATASET_ID=... node tools/scripts/process-apify-output.mjs --force
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "public", "cards");
const MANIFEST = path.join(OUT, "manifest.json");
const TOKEN = process.env.APIFY_TOKEN;
const DATASET = process.env.DATASET_ID;
const FORCE = process.argv.includes("--force");
if (!TOKEN || !DATASET) { console.error("Need APIFY_TOKEN and DATASET_ID env vars"); process.exit(1); }

/* Catalogue card names that need art (the 32 still-gap cards). Generated from the
 * gap-resolution analysis. Each maps to its lib/card-images.ts slug. */
const TARGETS = [
  { name: "American Express Aeroplan No Fee Card",                   slug: "american-express-aeroplan-no-fee-card",                   keywords: ["aeroplan", "no fee"] },
  { name: "BMO Air Miles Mastercard",                                slug: "bmo-air-miles-mastercard",                                keywords: ["bmo", "air miles", "mastercard"] },
  { name: "BMO Air Miles World Elite Mastercard",                    slug: "bmo-air-miles-world-elite-mastercard",                    keywords: ["bmo", "air miles", "world elite"] },
  { name: "BMO Rewards Mastercard",                                  slug: "bmo-rewards-mastercard",                                  keywords: ["bmo", "rewards", "mastercard"] },
  { name: "BMO World Elite Mastercard",                              slug: "bmo-world-elite-mastercard",                              keywords: ["bmo", "world elite"] },
  { name: "Capital One Aspire Travel Platinum Mastercard",           slug: "capital-one-aspire-travel-platinum-mastercard",           keywords: ["aspire", "platinum"] },
  { name: "Capital One Aspire Travel World Elite Mastercard",        slug: "capital-one-aspire-travel-world-elite-mastercard",        keywords: ["aspire", "world elite"] },
  { name: "Capital One Costco Mastercard",                           slug: "capital-one-costco-mastercard",                           keywords: ["capital one", "costco"] },
  { name: "CIBC Tim Hortons Visa",                                   slug: "cibc-tim-hortons-visa",                                   keywords: ["tim hortons"] },
  { name: "Desjardins Cash Back Visa",                               slug: "desjardins-cash-back-visa",                               keywords: ["desjardins", "cash back"] },
  { name: "Desjardins Cash Back World Elite Visa",                   slug: "desjardins-cash-back-world-elite-visa",                   keywords: ["desjardins", "world elite"] },
  { name: "Desjardins Odyssey Visa Gold",                            slug: "desjardins-odyssey-visa-gold",                            keywords: ["odyssey", "gold"] },
  { name: "Desjardins Remises Visa",                                 slug: "desjardins-remises-visa",                                 keywords: ["desjardins", "remises"] },
  { name: "HSBC +Rewards Mastercard",                                slug: "hsbc-rewards-mastercard",                                 keywords: ["hsbc", "rewards"] },
  { name: "HSBC Cashback Mastercard",                                slug: "hsbc-cashback-mastercard",                                keywords: ["hsbc", "cashback"] },
  { name: "HSBC World Elite Mastercard",                             slug: "hsbc-world-elite-mastercard",                             keywords: ["hsbc", "world elite"] },
  { name: "MBNA Alaska Airlines World Elite Mastercard",             slug: "mbna-alaska-airlines-world-elite-mastercard",             keywords: ["alaska", "mbna"] },
  { name: "National Bank Allure Mastercard",                         slug: "national-bank-allure-mastercard",                         keywords: ["allure"] },
  { name: "National Bank Mastercard",                                slug: "national-bank-mastercard",                                keywords: ["national bank", "mastercard"] },
  { name: "National Bank Syncro Mastercard",                         slug: "national-bank-syncro-mastercard",                         keywords: ["syncro"] },
  { name: "Neo Secured Mastercard",                                  slug: "neo-secured-mastercard",                                  keywords: ["neo", "secured"] },
  { name: "PC Money Account",                                        slug: "pc-money-account",                                        keywords: ["pc", "money account"] },
  { name: "RBC Avion Visa Platinum",                                 slug: "rbc-avion-visa-platinum",                                 keywords: ["avion", "platinum"] },
  { name: "RBC ION+ Visa",                                           slug: "rbc-ion-visa",                                            keywords: ["ion+", "ion plus"] },
  { name: "RBC Rewards+ Visa",                                       slug: "rbc-rewards-visa",                                        keywords: ["rewards+", "rewards plus"] },
  { name: "RBC WestJet Mastercard",                                  slug: "rbc-westjet-mastercard",                                  keywords: ["westjet", "mastercard"] },
  { name: "Rogers Platinum Mastercard",                              slug: "rogers-platinum-mastercard",                              keywords: ["rogers", "platinum"] },
  { name: "Scotia Momentum Mastercard No Fee",                       slug: "scotia-momentum-mastercard-no-fee",                       keywords: ["momentum", "no fee", "mastercard"] },
  { name: "Simplii Financial Visa Card",                             slug: "simplii-financial-visa-card",                             keywords: ["simplii", "visa"] },
  { name: "TD Cash Back Visa Card",                                  slug: "td-cash-back-visa-card",                                  keywords: ["td", "cash back"] },
  { name: "TD First Class Travel Visa Infinite Privilege",           slug: "td-first-class-travel-visa-infinite-privilege",           keywords: ["first class", "privilege"] },
  { name: "TD Platinum Travel Visa",                                 slug: "td-platinum-travel-visa",                                 keywords: ["td", "platinum travel"] },
];

const HEADERS = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/121.0" };

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9 +]/g, " ").replace(/\s+/g, " ").trim();
}

function score(altRaw, target) {
  const alt = normalize(altRaw);
  if (!alt) return 0;
  let s = 0;
  for (const k of target.keywords) {
    if (alt.includes(normalize(k))) s += 10;
  }
  // Boost if all keyword tokens present
  const allPresent = target.keywords.every(k => alt.includes(normalize(k)));
  if (allPresent) s += 20;
  return s;
}

async function loadManifest() {
  try { return JSON.parse(await fs.readFile(MANIFEST, "utf8")); } catch { return {}; }
}

async function downloadOne(url, slug) {
  const ext = /\.jpe?g(\?|$)/i.test(url) ? "jpg" : /\.webp(\?|$)/i.test(url) ? "webp" : "png";
  const out = path.join(OUT, `${slug}.${ext}`);
  if (!FORCE) {
    try { await fs.access(out); return { skipped: true, ext }; } catch {}
  }
  const r = await fetch(url, { headers: HEADERS, redirect: "follow" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = r.headers.get("content-type") || "";
  if (!/image/i.test(ct)) throw new Error(`bad content-type: ${ct}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 1500) throw new Error(`too small: ${buf.length}b`);
  await fs.writeFile(out, buf);
  return { ok: true, ext, bytes: buf.length };
}

async function main() {
  console.log(`Fetching dataset ${DATASET}…`);
  const r = await fetch(`https://api.apify.com/v2/datasets/${DATASET}/items?token=${TOKEN}&clean=1&format=json`);
  const items = await r.json();
  console.log(`Got ${items.length} pages`);

  /* Flatten all images across all pages */
  const allImgs = [];
  for (const item of items) {
    for (const img of item.images || []) {
      allImgs.push({ alt: img.alt || "", src: img.src, w: img.w, h: img.h, fromUrl: item.url });
    }
  }
  console.log(`Total card-like images: ${allImgs.length}`);

  /* Match each target to the highest-scoring image */
  const manifest = await loadManifest();
  let made = 0, skipped = 0, failed = 0, unmatched = 0;
  for (const t of TARGETS) {
    const ranked = allImgs
      .map(img => ({ img, s: score(img.alt, t) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s);
    if (!ranked.length) {
      console.log(`  ✗ ${t.slug}: no match`);
      unmatched++;
      continue;
    }
    const top = ranked[0];
    try {
      const res = await downloadOne(top.img.src, t.slug);
      if (res.skipped) {
        console.log(`  ⊝ ${t.slug}: exists`);
        manifest[t.slug] = res.ext;
        skipped++;
      } else {
        console.log(`  ✓ ${t.slug}: ${(res.bytes / 1024).toFixed(1)}kB | alt="${top.img.alt.slice(0,50)}"`);
        manifest[t.slug] = res.ext;
        made++;
      }
    } catch (e) {
      console.log(`  ✗ ${t.slug}: ${e.message} | tried alt="${top.img.alt.slice(0,50)}"`);
      failed++;
    }
  }

  await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\n${made} downloaded, ${skipped} existed, ${failed} failed, ${unmatched} unmatched (gradient sprite fallback). Manifest: ${Object.keys(manifest).length} entries.`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
