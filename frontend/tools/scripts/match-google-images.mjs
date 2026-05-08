#!/usr/bin/env node
/**
 * Strict matcher: every slug has a (must-contain) and (must-NOT-contain) keyword
 * list applied against the result title to disambiguate similar cards
 * (e.g. RBC ION+ vs Rewards+, BMO Eclipse VI vs VIP, Rogers Platinum vs Red WE).
 *
 * Fall back through top-N candidates: download the first one whose title
 * passes the gates AND whose URL returns a valid image > 5KB.
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
if (!TOKEN || !DATASET) { console.error("Need APIFY_TOKEN + DATASET_ID env"); process.exit(1); }

/* { query, slug, must, mustNot } — gates against the result title */
const RULES = [
  { q: 'American Express Aeroplan No Fee Card png',                   slug: 'american-express-aeroplan-no-fee-card',          must: ['aeroplan'], mustNot: ['reserve', 'business', 'tim hortons'] },
  { q: 'BMO Air Miles Mastercard png',                                slug: 'bmo-air-miles-mastercard',                       must: ['air miles', 'bmo'], mustNot: ['world elite'] },
  { q: 'BMO Air Miles World Elite Mastercard png',                    slug: 'bmo-air-miles-world-elite-mastercard',           must: ['air miles', 'world elite'], mustNot: ['business', 'biz'] },
  { q: 'BMO eclipse Visa Infinite png',                               slug: 'bmo-eclipse-visa-infinite',                      must: ['eclipse', 'infinite'], mustNot: ['privilege'] },
  { q: 'BMO eclipse Visa Infinite Privilege png',                     slug: 'bmo-eclipse-visa-infinite-privilege',            must: ['eclipse', 'privilege'], mustNot: [] },
  { q: 'BMO Rewards Mastercard png',                                  slug: 'bmo-rewards-mastercard',                         must: ['bmo', 'rewards'], mustNot: ['world elite', 'cashback', 'cash back', 'air miles', 'eclipse', 'ascend'] },
  { q: 'BMO Rewards World Elite Mastercard png',                      slug: 'bmo-rewards-world-elite-mastercard',             must: ['bmo', 'rewards', 'world elite'], mustNot: ['cashback', 'cash back', 'air miles', 'eclipse', 'ascend'] },
  { q: 'BMO World Elite Mastercard png',                              slug: 'bmo-world-elite-mastercard',                     must: ['bmo', 'world elite'], mustNot: ['cashback', 'cash back', 'air miles', 'eclipse', 'ascend', 'rewards'] },
  { q: 'Brim World Elite Mastercard png',                             slug: 'brim-world-elite-mastercard',                    must: ['brim', 'world elite'], mustNot: [] },
  { q: 'Capital One Aspire Travel Platinum Mastercard png',           slug: 'capital-one-aspire-travel-platinum-mastercard',  must: ['aspire', 'platinum'], mustNot: ['world elite'] },
  { q: 'Capital One Aspire Travel World Elite Mastercard png',        slug: 'capital-one-aspire-travel-world-elite-mastercard', must: ['aspire', 'world elite'], mustNot: [] },
  { q: 'Capital One Costco Mastercard Canada png',                    slug: 'capital-one-costco-mastercard',                  must: ['capital one', 'costco'], mustNot: ['cibc'] },
  { q: 'CIBC Tim Hortons Visa png',                                   slug: 'cibc-tim-hortons-visa',                          must: ['tim hortons', 'visa'], mustNot: [] },
  { q: 'Desjardins Cash Back Visa png',                               slug: 'desjardins-cash-back-visa',                      must: ['desjardins', 'cash back'], mustNot: ['world elite', 'odyssey', 'remises'] },
  { q: 'Desjardins Cash Back World Elite Visa png',                   slug: 'desjardins-cash-back-world-elite-visa',          must: ['desjardins', 'cash back', 'world elite'], mustNot: ['odyssey', 'remises'] },
  { q: 'Desjardins Odyssey Visa Gold png',                            slug: 'desjardins-odyssey-visa-gold',                   must: ['odyssey', 'gold'], mustNot: ['cash back', 'remises', 'world elite'] },
  { q: 'Desjardins Remises Visa png',                                 slug: 'desjardins-remises-visa',                        must: ['remises'], mustNot: ['cash back', 'odyssey'] },
  { q: 'HSBC +Rewards Mastercard Canada png',                         slug: 'hsbc-rewards-mastercard',                        must: ['hsbc', 'rewards'], mustNot: ['world elite', 'cashback', 'cash back'] },
  { q: 'HSBC Cashback Mastercard Canada png',                         slug: 'hsbc-cashback-mastercard',                       must: ['hsbc'], mustNot: ['world elite', 'rewards', 'travel'] },
  { q: 'HSBC World Elite Mastercard Canada png',                      slug: 'hsbc-world-elite-mastercard',                    must: ['hsbc', 'world elite'], mustNot: ['cashback', 'cash back', 'rewards'] },
  { q: 'MBNA Alaska Airlines World Elite Mastercard png',             slug: 'mbna-alaska-airlines-world-elite-mastercard',    must: ['alaska', 'world elite'], mustNot: ['american', 'true line'] },
  { q: 'National Bank Allure Mastercard png',                         slug: 'national-bank-allure-mastercard',                must: ['allure'], mustNot: ['echo', 'platinum', 'world', 'syncro'] },
  { q: 'National Bank Mastercard Canada MC1 png',                     slug: 'national-bank-mastercard',                       must: ['national bank', 'mc1'], mustNot: [] },
  { q: 'National Bank Syncro Mastercard png',                         slug: 'national-bank-syncro-mastercard',                must: ['syncro'], mustNot: ['allure', 'echo', 'platinum'] },
  { q: 'Neo Secured Mastercard png',                                  slug: 'neo-secured-mastercard',                         must: ['neo', 'secured'], mustNot: ['world elite'] },
  { q: 'PC Money Account Mastercard png',                             slug: 'pc-money-account',                               must: ['pc money', 'money account'], mustNot: ['world elite'] },
  { q: 'RBC Avion Visa Platinum png',                                 slug: 'rbc-avion-visa-platinum',                        must: ['avion', 'platinum'], mustNot: ['world elite', 'infinite', 'business', 'rewards'] },
  { q: 'RBC ION+ Visa png',                                           slug: 'rbc-ion-visa',                                   must: ['ion'], mustNot: ['avion'] },
  { q: 'RBC Rewards+ Visa png',                                       slug: 'rbc-rewards-visa',                               must: ['rewards+'], mustNot: ['ion', 'avion', 'platinum', 'infinite'] },
  { q: 'RBC WestJet Mastercard png',                                  slug: 'rbc-westjet-mastercard',                         must: ['westjet'], mustNot: ['world elite'] },
  { q: 'Rogers Platinum Mastercard png',                              slug: 'rogers-platinum-mastercard',                     must: ['rogers', 'platinum'], mustNot: ['world elite', 'red'] },
  { q: 'Rogers Red World Elite Mastercard png',                       slug: 'rogers-red-world-elite-mastercard',              must: ['rogers'], mustNot: ['platinum'] },
  { q: 'Rogers World Elite Mastercard png',                           slug: 'rogers-world-elite-mastercard',                  must: ['rogers', 'world elite'], mustNot: ['platinum'] },
  { q: 'Scotia Momentum Mastercard No Fee png',                       slug: 'scotia-momentum-mastercard-no-fee',              must: ['momentum', 'no fee'], mustNot: ['visa infinite', 'world elite'] },
  { q: 'Simplii Financial Visa Card png',                             slug: 'simplii-financial-visa-card',                    must: ['simplii'], mustNot: ['cash back', 'cashback'] },
  { q: 'TD Cash Back Visa Card png',                                  slug: 'td-cash-back-visa-card',                         must: ['td', 'cash back'], mustNot: ['infinite'] },
  { q: 'TD First Class Travel Visa Infinite Privilege png',           slug: 'td-first-class-travel-visa-infinite-privilege',  must: ['first class', 'privilege'], mustNot: [] },
  { q: 'TD Platinum Travel Visa png',                                 slug: 'td-platinum-travel-visa',                        must: ['td', 'platinum travel'], mustNot: ['infinite', 'first class'] },
];

const TRUST = (origin) => {
  origin = (origin || '').toLowerCase();
  if (/(rbcroyalbank|bmo\.com|td\.com|cibc\.com|scotiabank|nbc\.ca|capitalone\.ca|hsbc\.ca|desjardins\.com|manulifebank|neofinancial|pcfinancial|rogersbank|simplii|tangerine|americanexpress\.com|brimfinancial|mbna\.ca|canadiantire)/.test(origin)) return 100;
  if (/(rewardscanada|cms\.ratehub|ratehub\.ca|milesopedia|creditcardgenius|hellosafe|moneygenius|moneywise|princeoftravel)/.test(origin)) return 80;
  if (/(forbes|nerdwallet|finder|wallethub|lowestrates|youngandthrifty|theinformr)/.test(origin)) return 60;
  return 30;
};
const dimsScore = (w, h) => {
  if (!w || !h) return -20;
  if (w < 150 || h < 90) return -50;
  const r = w / h;
  if (r < 1.2 || r > 2.0) return -30;
  let s = 0;
  if (r >= 1.4 && r <= 1.8) s += 30;
  if (w >= 250 && w <= 1500) s += 20;
  return s;
};
const filenameScore = (url) => {
  url = (url || '').toLowerCase();
  let s = 0;
  if (/(card[-_]?art|cardart|card_image|card[-_]front|cardfront)/.test(url)) s += 40;
  if (/\/cards?\/|\/credit[-_]cards?\//.test(url)) s += 10;
  if (/(thumb|thumbnail|tbn|small|favicon|sprite|logo)/.test(url)) s -= 50;
  if (/(banner|hero|spot[-_]image|category|advertorial)/.test(url)) s -= 25;
  return s;
};
function passesGates(title, must, mustNot) {
  const t = (title || '').toLowerCase();
  for (const k of must) if (!t.includes(k.toLowerCase())) return false;
  for (const k of mustNot) if (t.includes(k.toLowerCase())) return false;
  return true;
}

const HEADERS = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/121.0" };
async function loadManifest() {
  try { return JSON.parse(await fs.readFile(MANIFEST, "utf8")); } catch { return {}; }
}
async function downloadOne(url, slug) {
  const ext = /\.jpe?g(\?|$)/i.test(url) ? "jpg" : /\.webp(\?|$)/i.test(url) ? "webp" : "png";
  const out = path.join(OUT, `${slug}.${ext}`);
  const r = await fetch(url, { headers: HEADERS, redirect: "follow" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = r.headers.get("content-type") || "";
  if (!/image/i.test(ct)) throw new Error(`bad content-type: ${ct}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 5000) throw new Error(`tiny: ${buf.length}b`);
  await fs.writeFile(out, buf);
  return { ext, bytes: buf.length };
}

async function main() {
  const r = await fetch(`https://api.apify.com/v2/datasets/${DATASET}/items?token=${TOKEN}&clean=1&format=json`);
  const items = await r.json();
  console.log(`Dataset: ${items.length} items`);
  const byQuery = new Map();
  for (const it of items) {
    if (!byQuery.has(it.query)) byQuery.set(it.query, []);
    byQuery.get(it.query).push(it);
  }
  const manifest = await loadManifest();
  let made = 0, fail = 0, pruned = 0;

  for (const rule of RULES) {
    const cands = (byQuery.get(rule.q) ?? []).filter(c =>
      passesGates(c.title, rule.must, rule.mustNot) && c.imageUrl
    );
    pruned += (byQuery.get(rule.q)?.length ?? 0) - cands.length;
    if (!cands.length) {
      console.log(`  ✗ ${rule.slug}: 0 pass gates`);
      fail++;
      /* delete the bad file from previous run if it exists */
      try { await fs.unlink(path.join(OUT, `${rule.slug}.png`)); delete manifest[rule.slug]; } catch {}
      try { await fs.unlink(path.join(OUT, `${rule.slug}.jpg`)); delete manifest[rule.slug]; } catch {}
      continue;
    }
    /* Rank survivors */
    const ranked = cands.map(c => ({
      it: c,
      score: TRUST(c.origin) + dimsScore(c.imageWidth, c.imageHeight) + filenameScore(c.imageUrl),
    })).sort((a, b) => b.score - a.score);

    let saved = false;
    for (let i = 0; i < Math.min(ranked.length, 6); i++) {
      const top = ranked[i];
      try {
        const res = await downloadOne(top.it.imageUrl, rule.slug);
        console.log(`  ✓ ${rule.slug}: ${(res.bytes/1024).toFixed(1)}kB | s=${top.score} | ${(top.it.origin||'').slice(0,30)} | ${(top.it.title||'').slice(0,55)}`);
        manifest[rule.slug] = res.ext;
        made++;
        saved = true;
        break;
      } catch {}
    }
    if (!saved) { console.log(`  ✗ ${rule.slug}: ${ranked.length} candidates passed gates but all dl failed`); fail++; }
  }

  await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\n${made} downloaded, ${fail} failed (${pruned} candidates pruned by gates). Manifest: ${Object.keys(manifest).length} entries.`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
