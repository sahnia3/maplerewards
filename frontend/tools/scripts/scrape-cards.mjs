#!/usr/bin/env node
/**
 * scrape-cards.mjs
 *
 * Downloads real Canadian credit card art from Ratehub's CDN — the broadest
 * single source we have for cards not on RewardsCanada. Each entry has a manual
 * (slug, url) mapping confirmed against the alt text on the source pages.
 *
 * Usage: node tools/scripts/scrape-cards.mjs
 *
 * Idempotent: skips files that already exist. Updates manifest.json so
 * lib/card-images.ts will resolve the local path on next request.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "public", "cards");
const MANIFEST = path.join(OUT, "manifest.json");

/* slug = lib/card-images.ts nameToSlug() applied to the catalogue card name. */
const MAP = [
  // ── BMO ──────────────────────────────────────────────────────────
  { slug: "bmo-cashback-world-elite-mastercard",          url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/BMO-CashBack-World-Elite-Mastercard-RGB-Eng-for-online-250x159-1.png" },
  { slug: "bmo-cash-back-mastercard",                     url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/BMO-cashback-mastercard-EN-card-art.png" },
  { slug: "bmo-ascend-world-elite-mastercard",            url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/BMO-Ascend-World-Elite-Card-Art.png" },
  { slug: "bmo-preferred-rate-mastercard",                url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/bmo-preferred-rate-en-29-nov-2023-1.png" },
  // ── CIBC ─────────────────────────────────────────────────────────
  { slug: "cibc-aventura-visa-infinite",                  url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/CIBC_Aventura_Visa_Infinite_front_eng-1.png" },
  { slug: "cibc-dividend-visa-infinite",                  url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/CIBC_Dividend_Visa_infinite_front_eng-1.png" },
  { slug: "cibc-select-visa-card",                        url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/CIBC_Select_visa_front_ENG.png-copy.png" },
  // ── TD ───────────────────────────────────────────────────────────
  { slug: "td-aeroplan-visa-infinite",                    url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/card-277.png" },
  { slug: "td-aeroplan-visa-infinite-privilege",          url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/APIP_A-Banner_286x180_EN_FR.jpg" },
  { slug: "td-first-class-travel-visa-infinite",          url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/FirstClassTravel_VISA_MKT_EN_1200x1200.png" },
  { slug: "td-rewards-visa-card",                         url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/Rewards_VISA_MKT_EN_1200x1200.png" },
  { slug: "td-cash-back-visa-infinite",                   url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/InfiniteCashBack_VISA_MKT_EN_1200x1200-1.png" },
  // ── Amex ─────────────────────────────────────────────────────────
  { slug: "amex-cobalt",                                  url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/card-262.png" },
  { slug: "amex-gold-rewards",                            url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/chg_gold_metal_ca_di_960x608.png" },
  { slug: "amex-platinum",                                url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/Screen-Shot-2022-01-26-at-12.06.05-PM.png" },
  { slug: "american-express-green-card",                  url: "https://cms.ratehub.ca/wp-content/uploads/2022/02/Screen-Shot-2022-02-15-at-2.40.05-PM.png" },
  { slug: "american-express-business-edge",               url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/sbs_gold_2018_ca_no_cm_480x304.png" },
  { slug: "simplycash-card-from-american-express",        url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/simplycash_can_no_cm_480x304.png" },
  // ── Scotiabank ───────────────────────────────────────────────────
  { slug: "scotiabank-passport-visa-infinite",            url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/Visa-Infinite_E_R6_Gradient_Front_250x157.png" },
  { slug: "scotiabank-value-visa-card",                   url: "https://cms.ratehub.ca/wp-content/uploads/2025/08/Scotiabank-Value-Visa-1.png" },
  { slug: "scotia-momentum-visa",                         url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/Momentum-Visa-1.png" },
  // ── MBNA ─────────────────────────────────────────────────────────
  { slug: "mbna-true-line-mastercard",                    url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/1429-22084-6262-EN-Front-TrueLine-250.png" },
  { slug: "mbna-rewards-platinum-mastercard",             url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/1429-22084-6262-EN-Front-Rewards-250.png" },
  { slug: "mbna-smart-cash-platinum-mastercard",          url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/card-249.png" },
  // ── Capital One ──────────────────────────────────────────────────
  { slug: "capital-one-guaranteed-mastercard",            url: "https://cms.ratehub.ca/wp-content/uploads/2025/03/Guaranteed-MC-Gold_Card_2023_Front_Straight_RGB_FINAL_1280x807-1.png" },
  // ── RBC ──────────────────────────────────────────────────────────
  { slug: "rbc-westjet-world-elite-mastercard",           url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/card-58.png" },
  { slug: "rbc-cash-back-preferred-world-elite-mastercard", url: "https://cms.ratehub.ca/wp-content/uploads/2023/10/MCP_REV_CashBackMCPreferred_E_4c_300dpi-Copy-250x158-1.png" },
  // ── PC Financial ─────────────────────────────────────────────────
  { slug: "pc-financial-world-elite-mastercard",          url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/pcf_mastercard_flatcard_small-f_worldelite_rgb_250x160.png" },
  { slug: "pc-mastercard",                                url: "https://cms.ratehub.ca/wp-content/uploads/2020/09/PCF_MasterCard_FlatCard_small-f_Silver_RGB-250x158-1.png" },
  // ── CIBC additional (sourced from cibc.com/content/dam/global-assets/card-art/) ──
  { slug: "cibc-aeroplan-visa-infinite",                  url: "https://www.cibc.com/content/dam/global-assets/card-art/credit-cards/aeroplan-cards/cibc-aeroplan-visa-infinite-card/cibc-aeroplan-infinite-en.png/_jcr_content/renditions/cq5dam.web.1280.1280.png" },
  { slug: "cibc-aeroplan-visa-infinite-privilege",        url: "https://www.cibc.com/content/dam/global-assets/card-art/credit-cards/aeroplan-cards/cibc-aeroplan-visa-infinite-privilege-card/cibc-aeroplan-infinite-privilege-en.png/_jcr_content/renditions/cq5dam.web.1280.1280.png" },
  { slug: "cibc-aventura-visa-infinite-privilege",        url: "https://www.cibc.com/content/dam/global-assets/card-art/credit-cards/aventura-cards/cibc-aventura-visa-infinite-privilege-card/cibc-visa-aventura-infinite-privilege-en.png/_jcr_content/renditions/cq5dam.web.1280.1280.png" },
  { slug: "cibc-costco-mastercard",                       url: "https://www.cibc.com/content/dam/global-assets/card-art/credit-cards/costco-card/cibc-mastercard-costco.png/_jcr_content/renditions/cq5dam.web.1280.1280.png" },
  { slug: "cibc-dividend-visa-card",                      url: "https://www.cibc.com/content/dam/global-assets/card-art/credit-cards/dividend-cards/cibc-dividend-visa-card-for-students/cibc-dividend-visa-card-for-students-en.png/_jcr_content/renditions/cq5dam.web.1280.1280.png" },
  // ── Canadian Tire / Triangle (correct card art, not banner) ────
  { slug: "triangle-mastercard",                          url: "https://media-triangle.canadiantire.ca/category-content/2023/triangle-ca-odp-2022-/triangle-world-credit-card.png" },
  { slug: "triangle-world-elite-mastercard",              url: "https://media-triangle.canadiantire.ca/category-content/2023/triangle-ca-odp-2022-/triangle-world-elite-credit-card.png" },
  // ── Manulife ─────────────────────────────────────────────────────
  { slug: "manulife-visa-platinum",                       url: "https://www.manulifebank.ca/content/dam/manulife-bank/en_ca/images/personal-banking/credit-cards/Visa_Platinum_EN.png" },
  // ── Scotia (no-fee Visa from experience-fragments) ──────────────
  { slug: "scotiabank-no-fee-visa-card",                  url: "https://www.scotiabank.com/content/experience-fragments/scotiabank/ca/en/Credit-Cards/category_pages_tiles/redesign_category_ti/momentum-no-fee-visa/master/_jcr_content/root/image_copy_copy.img.png/1765813033741.png" },
];

const HEADERS = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36" };

async function loadManifest() {
  try { return JSON.parse(await fs.readFile(MANIFEST, "utf8")); } catch { return {}; }
}

async function main() {
  const force = process.argv.includes("--force");
  await fs.mkdir(OUT, { recursive: true });
  const manifest = await loadManifest();
  let ok = 0, skip = 0, fail = 0;

  for (const { slug, url } of MAP) {
    const ext = /\.jpe?g(\?|$)/i.test(url) ? "jpg" : "png";
    const out = path.join(OUT, `${slug}.${ext}`);
    if (!force) {
      try { await fs.access(out); manifest[slug] = ext; console.log(`  ${slug}: exists`); skip++; continue; } catch {}
    }
    try {
      const r = await fetch(url, { headers: HEADERS, redirect: "follow" });
      if (!r.ok) { console.log(`  ${slug}: HTTP ${r.status}`); fail++; continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      await fs.writeFile(out, buf);
      manifest[slug] = ext;
      console.log(`  ${slug}: ✓ ${(buf.length / 1024).toFixed(1)} kB`);
      ok++;
    } catch (e) { console.log(`  ${slug}: ${e.message}`); fail++; }
  }

  await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\n${ok} downloaded, ${skip} skipped, ${fail} failed. Manifest entries: ${Object.keys(manifest).length}`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
