#!/usr/bin/env node
/**
 * Fix the 15 bad card images from previous Apify runs.
 *
 * Strategy per card:
 *   1. Pull all candidates for the relevant query from the new dataset.
 *   2. Apply STRICT filters: title gates (must/mustNot), aspect ratio 1.40-1.80,
 *      width >= 400, file size after download >= 30KB.
 *   3. Bias trust score toward issuer official domains + known card-art CDNs.
 *   4. Heavily penalize "review/comparison/vs/best/guide/roundup" titles.
 *   5. Try top 8 ranked candidates in order, accept first that passes
 *      post-download checks (real image, right size, right aspect).
 *
 * Cross-check: title must literally contain the card-defining keyword.
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
if (!TOKEN || !DATASET) { console.error("Need APIFY_TOKEN + DATASET_ID"); process.exit(1); }

const RULES = [
  { q: 'American Express Aeroplan No Fee Canada credit card art ratehub',  slug: 'american-express-aeroplan-no-fee-card',          must: ['aeroplan'],            optional: ['no fee', 'no-fee'], not: ['reserve', 'business', 'cibc', 'tim hortons'] },
  { q: 'BMO eclipse Visa Infinite card front ratehub',                     slug: 'bmo-eclipse-visa-infinite',                      must: ['eclipse'],             optional: ['infinite'], not: ['privilege', 'business', 'review'] },
  { q: 'BMO eclipse Visa Infinite Privilege card front ratehub',           slug: 'bmo-eclipse-visa-infinite-privilege',            must: ['eclipse', 'privilege'], optional: [], not: ['business', 'review'] },
  { q: 'BMO Rewards Mastercard Canada card art front',                     slug: 'bmo-rewards-mastercard',                         must: ['bmo', 'rewards'],      optional: [], not: ['world elite', 'cashback', 'cash back', 'air miles', 'eclipse', 'ascend', 'business', 'review', 'student'] },
  { q: 'Canadian Tire Triangle Mastercard card front art',                 slug: 'triangle-mastercard',                            must: ['triangle'],            optional: ['mastercard'], not: ['world elite', 'review'] },
  { q: 'Capital One Aspire Travel World Elite Mastercard front art Canada', slug: 'capital-one-aspire-travel-world-elite-mastercard', must: ['aspire', 'world elite'], optional: [], not: ['review', 'comparison', ' vs ', 'cash'] },
  { q: 'Capital One Costco Mastercard Canada card front',                  slug: 'capital-one-costco-mastercard',                  must: ['capital one', 'costco'], optional: [], not: ['cibc', 'review', ' vs '] },
  { q: 'CIBC Tim Hortons Double Double Visa front ratehub',                slug: 'cibc-tim-hortons-visa',                          must: ['tim hortons'],         optional: ['visa'], not: ['review', 'youtube'] },
  { q: 'Desjardins Odyssey World Elite Mastercard front art',              slug: 'desjardins-odyssey-world-elite-mastercard',      must: ['odyssey', 'world elite'], optional: [], not: ['review', 'gold', 'platinum', 'visa'] },
  { q: 'Scotiabank Momentum Mastercard No Fee front card',                 slug: 'scotia-momentum-mastercard-no-fee',              must: ['momentum'],            optional: ['no fee', 'no-fee'], not: ['visa infinite', 'world elite', 'review'] },
  { q: 'RBC Avion Visa Platinum front art card ratehub',                   slug: 'rbc-avion-visa-platinum',                        must: ['avion', 'platinum'],   optional: [], not: ['world elite', 'infinite', 'business', 'rewards', 'review'] },
  { q: 'Tangerine Money-Back Credit Card front art',                       slug: 'tangerine-money-back-credit-card',               must: ['tangerine'],           optional: ['money-back', 'money back', 'moneyback'], not: ['world', 'review'] },
  { q: 'Tangerine World Mastercard front art Canada',                      slug: 'tangerine-world-mastercard',                     must: ['tangerine', 'world'],  optional: [], not: ['review'] },
  { q: 'Simplii Financial Cash Back Visa front art',                       slug: 'simplii-financial-cash-back-visa',               must: ['simplii', 'cash back'], optional: [], not: ['world elite', 'mastercard', 'review'] },
  { q: 'Simplii Financial Visa Card front art',                            slug: 'simplii-financial-visa-card',                    must: ['simplii'],             optional: ['visa card'], not: ['cash back', 'cashback', 'mastercard', 'review'] },
];

/* Title gate */
function gates(title, must, not) {
  const t = (title || '').toLowerCase();
  for (const k of must) if (!t.includes(k.toLowerCase())) return false;
  for (const k of not) if (t.includes(k.toLowerCase())) return false;
  return true;
}

/* Trust score by origin */
const TRUST = (o) => {
  o = (o || '').toLowerCase();
  if (/(rbcroyalbank|bmo\.com|td\.com|cibc\.com|scotiabank|nbc\.ca|capitalone\.ca|hsbc\.ca|desjardins\.com|manulifebank|neofinancial|pcfinancial|rogersbank|simplii\.com|tangerine|americanexpress\.com|brimfinancial|mbna\.ca|canadiantire|triangle|costco)/.test(o)) return 100;
  if (/(rewardscanada|cms\.ratehub|ratehub\.ca|milesopedia|creditcardgenius|hellosafe|moneygenius)/.test(o)) return 80;
  if (/(princeoftravel|frugalflyer|hardbacon|moneywehave|youngandthrifty|finder|nerdwallet)/.test(o)) return 50;
  return 20;
};

const dimsScore = (w, h) => {
  if (!w || !h) return -50;
  const r = w / h;
  if (r < 1.40 || r > 1.80) return -100;
  if (w < 400) return -30;
  let s = 30;
  if (w >= 600 && w <= 2000) s += 20;
  if (r >= 1.50 && r <= 1.70) s += 25;
  return s;
};

const filenameScore = (url, title) => {
  url = (url || '').toLowerCase();
  title = (title || '').toLowerCase();
  let s = 0;
  if (/(card[-_]?art|cardart|card_image|card[-_]front|cardfront|_en\.|_en_|hero[-_]card|card[-_]hero)/.test(url)) s += 50;
  if (/\/cards?\/|\/credit[-_]cards?\//.test(url)) s += 10;
  if (/(thumb|tbn|small|favicon|sprite|icon-|logo)/.test(url)) s -= 80;
  /* Heavy penalty for review/comparison/article hero images */
  if (/(\breview\b|\bcomparison\b|\bvs\b|\broundup\b|\bbest\b|\bguide\b|how[- ]to|backed by)/.test(title)) s -= 60;
  if (/(holding|hand[- ]on|wallet|in[- ]use|lifestyle|model)/.test(url)) s -= 40;
  return s;
};

const HEADERS = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/121.0" };

async function loadManifest() {
  try { return JSON.parse(await fs.readFile(MANIFEST, "utf8")); } catch { return {}; }
}

async function downloadAndVerify(url) {
  const r = await fetch(url, { headers: HEADERS, redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = r.headers.get("content-type") || "";
  if (!/image/i.test(ct)) throw new Error(`bad ct: ${ct}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 30000) throw new Error(`small ${buf.length}b`);
  return buf;
}

async function main() {
  const r = await fetch(`https://api.apify.com/v2/datasets/${DATASET}/items?token=${TOKEN}&clean=1&format=json`);
  const items = await r.json();
  console.log(`Dataset: ${items.length} items`);

  const byQ = new Map();
  for (const it of items) {
    if (!byQ.has(it.query)) byQ.set(it.query, []);
    byQ.get(it.query).push(it);
  }

  const manifest = await loadManifest();
  let made = 0, fail = 0;

  for (const rule of RULES) {
    const cands = (byQ.get(rule.q) || []).filter(c =>
      c.imageUrl && c.imageWidth && c.imageHeight && gates(c.title, rule.must, rule.not)
    );
    if (!cands.length) {
      console.log(`  ✗ ${rule.slug}: 0 cands pass gates (had ${(byQ.get(rule.q)||[]).length})`);
      fail++;
      continue;
    }
    const ranked = cands
      .map(c => ({ it: c, s: TRUST(c.origin) + dimsScore(c.imageWidth, c.imageHeight) + filenameScore(c.imageUrl, c.title) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s);

    if (!ranked.length) {
      console.log(`  ✗ ${rule.slug}: ${cands.length} cands but all scored ≤0`);
      fail++;
      continue;
    }

    let saved = false;
    for (let i = 0; i < Math.min(ranked.length, 8); i++) {
      const top = ranked[i];
      try {
        const buf = await downloadAndVerify(top.it.imageUrl);
        /* Replace any existing file (could be png or jpg) */
        for (const ext of ["png", "jpg", "webp"]) {
          try { await fs.unlink(path.join(OUT, `${rule.slug}.${ext}`)); } catch {}
        }
        const ext = /\.jpe?g(\?|$)/i.test(top.it.imageUrl) ? "jpg" : /\.webp(\?|$)/i.test(top.it.imageUrl) ? "webp" : "png";
        await fs.writeFile(path.join(OUT, `${rule.slug}.${ext}`), buf);
        manifest[rule.slug] = ext;
        const ratio = (top.it.imageWidth / top.it.imageHeight).toFixed(2);
        console.log(`  ✓ ${rule.slug}: ${(buf.length/1024).toFixed(0)}kB ${top.it.imageWidth}x${top.it.imageHeight} r=${ratio} | s=${top.s} | ${(top.it.origin||'').slice(0,28)} | ${(top.it.title||'').slice(0,55)}`);
        made++;
        saved = true;
        break;
      } catch (e) {
        if (i === 0) console.log(`    [#${i+1}] ${(top.it.origin||'').slice(0,25)}: ${e.message}`);
      }
    }
    if (!saved) { console.log(`  ✗ ${rule.slug}: ${ranked.length} ranked but none verified`); fail++; }
  }

  await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\n${made} replaced, ${fail} failed.`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
