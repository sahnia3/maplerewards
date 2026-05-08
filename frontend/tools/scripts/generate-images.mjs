#!/usr/bin/env node
/**
 * generate-images.mjs
 *
 * Generates editorial cover photos (articles) and card art (50 missing cards)
 * via Google's Gemini image API ("nano banana" / gemini-2.5-flash-image-preview).
 *
 * Usage:
 *   GEMINI_API_KEY=... node tools/scripts/generate-images.mjs --articles
 *   GEMINI_API_KEY=... node tools/scripts/generate-images.mjs --cards
 *   GEMINI_API_KEY=... node tools/scripts/generate-images.mjs --cards --slug=bmo-air-miles-mastercard
 *   GEMINI_API_KEY=... node tools/scripts/generate-images.mjs --cards --force
 *
 * Output:
 *   articles → frontend/public/articles/<slug>.png
 *   cards    → frontend/public/cards/<slug>.png + manifest.json (auto-updated)
 *
 * The card manifest is consumed by lib/card-images.ts to override the
 * RewardsCanada CDN URL with the local sprite when present.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const ARTICLES_DIR = path.join(ROOT, "public", "articles");
const CARDS_DIR = path.join(ROOT, "public", "cards");
const CARDS_MANIFEST = path.join(CARDS_DIR, "manifest.json");

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error("ERR: GEMINI_API_KEY missing.");
  console.error("  Add `GEMINI_API_KEY=...` to frontend/.env.local, then run with");
  console.error("  `set -a && source .env.local && set +a && node tools/scripts/generate-images.mjs --cards`");
  process.exit(1);
}

const ARGS = new Map(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? true];
}));
const FORCE = !!ARGS.get("force");
const ONLY_SLUG = ARGS.get("slug");
const MODE_ARTICLES = !!ARGS.get("articles");
const MODE_CARDS = !!ARGS.get("cards");
const MODE = MODE_CARDS ? "cards" : MODE_ARTICLES ? "articles" : null;
if (!MODE) {
  console.error("ERR: pass either --articles or --cards");
  process.exit(1);
}

/* ── Article cover prompts (12) ─────────────────────────────────────── */
const ARTICLE_PROMPTS = {
  "amex-cobalt-best-grocery-card":
    "Top-down editorial photograph of fresh Canadian groceries spread on a warm matte paper surface — produce, a baguette, a glass jar of preserves, soft daylight, muted forest-green and bone tones with subtle maple-red accents, shallow depth of field, no people, no text, no logos, magazine-style food photography",
  "aeroplan-sweet-spots-2025":
    "Cinematic photograph of an Air-Canada-style Dreamliner wing tip cutting through golden-hour cloud cover above the Pacific, view from a window seat, warm coffee-paper grain, restrained editorial composition, no text, no logos, evocative travel-magazine aesthetic",
  "transfer-partners-explained":
    "Editorial flat-lay of an open passport, three different airline boarding-pass-style cards arranged at angles, brass paperclip, on warm bone-colored paper, soft natural light, muted forest and maple palette, no people, no readable text, no logos",
  "no-fee-cards-2025":
    "Minimalist still life of a folded leather wallet on warm linen, subtle paper-grain texture, single brass coin catching diagonal light, restrained editorial palette of bone, forest green, and faint maple red, no people, no text, no card art",
  "cpp-explained":
    "Overhead editorial shot of a wooden desk with a moleskine notebook, brass calculator, scattered Canadian coins, fountain pen, warm paper-grain texture, muted maple and forest accents, soft daylight, no people, no readable text, no logos",
  "two-card-stack-canada":
    "Macro photograph of two physical credit cards in a slight fan, abstract embossed surfaces no logos visible, warm brass tones on one and matte forest green on the other, on warm paper-grain background, soft directional light, magazine-style commercial photography",
  "welcome-bonus-strategy":
    "Editorial still life of a small folded paper crane on a stack of warm-toned envelopes, single maple leaf accent, daylight, bone palette with warm forest-green undertones, no people, no readable text, restrained Canadian magazine aesthetic",
  "scotiabank-passport-foreign-travel":
    "Top-down editorial flat-lay of a vintage navy passport, a folded paper map of Europe, a brass compass, a small souvenir coin, on warm paper-grain background, soft golden hour light, muted bone and maple palette, no people, no readable text, no logos",
  "hotel-points-maximization":
    "Editorial photograph of a luxury hotel room corner — a single linen-upholstered armchair, a brass floor lamp, a folded throw on a side table, warm afternoon light through gauzy curtains, muted forest green and bone palette, magazine interiors aesthetic, no people, no logos",
  "credit-score-myths":
    "Editorial overhead shot of a stack of unopened paper envelopes tied with twine on a wood desk, fountain pen alongside, brass paperclip, warm daylight, muted bone and forest palette with subtle maple accents, no people, no readable text, restrained magazine aesthetic",
  "best-cards-for-gas":
    "Editorial photograph of an empty Canadian highway at dawn, weathered fuel pump in the foreground, golden hour mist, muted maple and bone tones, restrained magazine composition, no people, no logos, no readable text, atmospheric travel-photography aesthetic",
  "amex-vs-visa-acceptance":
    "Macro photograph of a vintage payment terminal on a warm wooden countertop, brass fixtures, a single folded receipt, paper-grain texture, muted bone and forest palette, soft directional daylight, magazine-style commercial photography, no people, no readable text, no logos",
};

/* ── Card art prompts — 50 missing cards from the audit ─────────────── */
/* Each prompt: editorial product photography of an abstract credit card matching
 * the issuer's brand palette. NO REAL LOGOS — Gemini will refuse anyway, and we don't
 * want trademark issues. Each card gets a distinct color/texture so they don't all
 * look identical when rendered side-by-side in the wallet picker. */
function cardPrompt(name, issuer, palette, accent) {
  return `Editorial product photograph of an abstract credit card lying flat on warm cream paper, slight three-quarter angle, soft directional daylight, premium magazine aesthetic. Card surface: ${palette}, with a subtle ${accent} foil accent stripe, a small brushed-metal chip, no readable text, no logos, no numbers visible. Restrained, premium fintech photography. 16:10 horizontal aspect ratio, sharp focus on card, soft shadow beneath. Card represents ${name} from ${issuer}.`;
}

const CARD_PROMPTS = {
  // ── BMO (8 cards, blue/silver palette) ──
  "bmo-air-miles-mastercard":              cardPrompt("Air Miles Mastercard", "BMO", "matte navy blue with silver embossing", "silver"),
  "bmo-air-miles-world-elite-mastercard":  cardPrompt("Air Miles World Elite Mastercard", "BMO", "deep midnight blue with brushed-aluminium tone", "silver"),
  "bmo-ascend-world-elite-mastercard":     cardPrompt("Ascend World Elite Mastercard", "BMO", "graphite charcoal with subtle blue gradient", "silver"),
  "bmo-cash-back-mastercard":              cardPrompt("Cash Back Mastercard", "BMO", "warm royal blue matte", "white"),
  "bmo-preferred-rate-mastercard":         cardPrompt("Preferred Rate Mastercard", "BMO", "soft slate-blue matte", "white"),
  "bmo-rewards-mastercard":                cardPrompt("Rewards Mastercard", "BMO", "muted denim blue", "silver"),
  "bmo-rewards-world-elite-mastercard":    cardPrompt("Rewards World Elite Mastercard", "BMO", "rich navy with subtle silver gradient", "silver"),
  "bmo-world-elite-mastercard":            cardPrompt("World Elite Mastercard", "BMO", "deep navy with metallic finish", "silver"),

  // ── CIBC (7 cards, deep red palette) ──
  "cibc-aeroplan-visa-infinite":           cardPrompt("Aeroplan Visa Infinite", "CIBC", "deep crimson with subtle red gradient", "white"),
  "cibc-aeroplan-visa-infinite-privilege": cardPrompt("Aeroplan Visa Infinite Privilege", "CIBC", "very dark burgundy almost black", "rose-gold"),
  "cibc-aventura-visa-infinite-privilege": cardPrompt("Aventura Visa Infinite Privilege", "CIBC", "obsidian black with red emboss", "rose-gold"),
  "cibc-costco-mastercard":                cardPrompt("Costco Mastercard", "CIBC", "muted red with cream stripe", "silver"),
  "cibc-dividend-visa-card":               cardPrompt("Dividend Visa Card", "CIBC", "soft warm red matte", "white"),
  "cibc-select-visa-card":                 cardPrompt("Select Visa Card", "CIBC", "neutral grey with warm red accent", "white"),
  "cibc-tim-hortons-visa":                 cardPrompt("Tim Hortons Visa", "CIBC", "deep coffee brown matte", "warm gold"),

  // ── Canadian Tire / Triangle (2 cards, red/black) ──
  "triangle-mastercard":                    cardPrompt("Triangle Mastercard", "Canadian Tire", "matte black with red triangle accent", "red"),
  "triangle-world-elite-mastercard":        cardPrompt("Triangle World Elite Mastercard", "Canadian Tire", "matte black brushed metal with bright red foil", "red"),

  // ── Capital One (4 cards, charcoal/aspirational palette) ──
  "capital-one-aspire-travel-platinum-mastercard":  cardPrompt("Aspire Travel Platinum Mastercard", "Capital One", "warm charcoal with platinum gradient", "platinum"),
  "capital-one-aspire-travel-world-elite-mastercard": cardPrompt("Aspire Travel World Elite Mastercard", "Capital One", "deep slate with platinum foil", "platinum"),
  "capital-one-costco-mastercard":          cardPrompt("Costco Mastercard", "Capital One", "muted slate grey with subtle accent stripe", "white"),
  "capital-one-guaranteed-mastercard":      cardPrompt("Guaranteed Mastercard", "Capital One", "soft warm grey", "white"),

  // ── Desjardins (4 cards, green palette) ──
  "desjardins-cash-back-visa":              cardPrompt("Cash Back Visa", "Desjardins", "deep forest green matte", "white"),
  "desjardins-cash-back-world-elite-visa":  cardPrompt("Cash Back World Elite Visa", "Desjardins", "very dark forest green with brushed metal", "silver"),
  "desjardins-odyssey-visa-gold":           cardPrompt("Odyssey Visa Gold", "Desjardins", "warm gold matte with subtle green accent", "warm gold"),
  "desjardins-remises-visa":                cardPrompt("Remises Visa", "Desjardins", "soft sage green matte", "white"),

  // ── HSBC (3 cards, red/white palette) ──
  "hsbc-rewards-mastercard":                cardPrompt("+Rewards Mastercard", "HSBC", "matte black with hexagonal red emboss", "red"),
  "hsbc-cashback-mastercard":               cardPrompt("Cashback Mastercard", "HSBC", "deep red matte", "white"),
  "hsbc-world-elite-mastercard":            cardPrompt("World Elite Mastercard", "HSBC", "obsidian black with subtle red foil", "red"),

  // ── MBNA (2 cards) ──
  "mbna-alaska-airlines-world-elite-mastercard": cardPrompt("Alaska Airlines World Elite Mastercard", "MBNA", "deep navy with arctic-blue accent stripe", "white"),
  "mbna-true-line-mastercard":              cardPrompt("True Line Mastercard", "MBNA", "soft warm grey matte", "white"),

  // ── Manulife (1 card) ──
  "manulife-visa-platinum":                 cardPrompt("Visa Platinum", "Manulife Bank", "deep teal-green with platinum foil", "platinum"),

  // ── National Bank (3 cards, red palette) ──
  "national-bank-allure-mastercard":        cardPrompt("Allure Mastercard", "National Bank", "rose-pink matte with subtle pearl finish", "rose-gold"),
  "national-bank-mastercard":               cardPrompt("Mastercard", "National Bank", "soft warm red matte", "white"),
  "national-bank-syncro-mastercard":        cardPrompt("Syncro Mastercard", "National Bank", "vibrant red gradient", "white"),

  // ── Neo Financial (1 card) ──
  "neo-secured-mastercard":                 cardPrompt("Secured Mastercard", "Neo Financial", "matte mint-green with subtle purple gradient", "white"),

  // ── PC Financial (2 cards) ──
  "pc-mastercard":                          cardPrompt("PC Mastercard", "PC Financial", "deep red with optimum-yellow accent stripe", "yellow"),
  "pc-money-account":                       cardPrompt("PC Money Account", "PC Financial", "matte cream with red and yellow accent", "red"),

  // ── Rogers Bank (1 card) ──
  "rogers-platinum-mastercard":             cardPrompt("Platinum Mastercard", "Rogers Bank", "matte black with platinum foil", "platinum"),

  // ── RBC (4 cards, blue palette) ──
  "rbc-avion-visa-platinum":                cardPrompt("Avion Visa Platinum", "RBC", "deep royal blue with platinum foil", "platinum"),
  /* Slugs match nameToSlug() output from lib/card-images.ts (the + char is stripped). */
  "rbc-ion-visa":                           cardPrompt("ION+ Visa", "RBC", "vibrant electric blue matte", "white"),
  "rbc-rewards-visa":                       cardPrompt("Rewards+ Visa", "RBC", "soft sky-blue matte", "white"),
  "american-express-aeroplan-no-fee-card":  cardPrompt("Aeroplan No Fee Card", "American Express", "soft warm cream with red Aeroplan accent", "red"),
  "rbc-westjet-mastercard":                 cardPrompt("WestJet Mastercard", "RBC", "deep aviation blue with teal accent stripe", "white"),

  /* Wrong-image holdouts (RC mappings were inaccurate per user). */
  "bmo-eclipse-visa-infinite":              cardPrompt("eclipse Visa Infinite", "BMO", "obsidian black brushed metal with red eclipse accent", "red"),
  "bmo-eclipse-visa-infinite-privilege":    cardPrompt("eclipse Visa Infinite Privilege", "BMO", "deep midnight black with rose-gold eclipse accent", "rose-gold"),
  "brim-world-elite-mastercard":            cardPrompt("World Elite Mastercard", "Brim", "rich deep teal-green with subtle silver foil accent", "silver"),
  "rogers-world-elite-mastercard":          cardPrompt("World Elite Mastercard", "Rogers Bank", "matte black with rich Rogers-red accent stripe", "red"),
  "rogers-red-world-elite-mastercard":      cardPrompt("Red World Elite Mastercard", "Rogers Bank", "vibrant Rogers-red matte with brushed silver foil", "silver"),

  // ── Scotiabank (3 cards) ──
  "scotia-momentum-mastercard-no-fee":      cardPrompt("Momentum Mastercard No Fee", "Scotiabank", "matte red with cream accent stripe", "white"),
  "scotiabank-no-fee-visa-card":            cardPrompt("No-Fee Visa Card", "Scotiabank", "soft warm red", "white"),
  "scotiabank-value-visa-card":             cardPrompt("Value Visa Card", "Scotiabank", "muted slate grey with red accent", "white"),

  // ── Simplii Financial (1 card) ──
  "simplii-financial-visa-card":            cardPrompt("Visa Card", "Simplii Financial", "soft sky-blue matte with white emboss", "white"),

  // ── TD Bank (4 cards, green palette) ──
  "td-cash-back-visa-card":                 cardPrompt("Cash Back Visa Card", "TD Bank", "matte forest green", "white"),
  "td-first-class-travel-visa-infinite-privilege": cardPrompt("First Class Travel Visa Infinite Privilege", "TD Bank", "obsidian black with subtle green foil", "warm gold"),
  "td-platinum-travel-visa":                cardPrompt("Platinum Travel Visa", "TD Bank", "deep emerald green with platinum foil", "platinum"),
  "td-rewards-visa-card":                   cardPrompt("Rewards Visa Card", "TD Bank", "soft sage green matte", "white"),
};

/* ── Generation core ──────────────────────────────────────────────── */

async function generate(slug, prompt, outDir) {
  /* gemini-2.5-flash-image-preview was retired. Use the current 3.1 flash image model
   * (a.k.a. "nano banana 2"). Method: generateContent with responseModalities=IMAGE. */
  const MODEL = "gemini-3.1-flash-image-preview";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(KEY)}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["IMAGE"] },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  const part = json?.candidates?.[0]?.content?.parts?.find((p) => p?.inlineData?.data);
  if (!part) throw new Error(`No image returned. Keys: ${Object.keys(json).join(", ")}`);
  const buf = Buffer.from(part.inlineData.data, "base64");
  const out = path.join(outDir, `${slug}.png`);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(out, buf);
  return { out, bytes: buf.length };
}

async function loadManifest() {
  try {
    const txt = await fs.readFile(CARDS_MANIFEST, "utf8");
    return JSON.parse(txt);
  } catch { return {}; }
}

async function saveManifest(m) {
  await fs.mkdir(CARDS_DIR, { recursive: true });
  await fs.writeFile(CARDS_MANIFEST, JSON.stringify(m, null, 2) + "\n");
}

async function main() {
  const prompts = MODE === "cards" ? CARD_PROMPTS : ARTICLE_PROMPTS;
  const outDir = MODE === "cards" ? CARDS_DIR : ARTICLES_DIR;
  const manifest = MODE === "cards" ? await loadManifest() : null;

  const slugs = ONLY_SLUG && typeof ONLY_SLUG === "string" ? [ONLY_SLUG] : Object.keys(prompts);
  console.log(`[${MODE}] generating ${slugs.length} image(s) → ${path.relative(ROOT, outDir)}/`);
  let made = 0, skipped = 0, failed = 0;
  for (const slug of slugs) {
    const prompt = prompts[slug];
    if (!prompt) { console.warn(`  ${slug}: no prompt configured, skipping`); continue; }
    const out = path.join(outDir, `${slug}.png`);
    if (!FORCE) {
      try { await fs.access(out); console.log(`  ${slug}: exists, skip`); skipped++;
        if (manifest) manifest[slug] = "png";
        continue;
      } catch {}
    }
    process.stdout.write(`  ${slug}: generating… `);
    try {
      const { bytes } = await generate(slug, prompt, outDir);
      console.log(`✓ ${(bytes / 1024).toFixed(1)} kB`);
      if (manifest) manifest[slug] = "png";
      made++;
    } catch (e) {
      console.log(`✗ ${e.message}`);
      failed++;
    }
  }
  if (manifest) {
    await saveManifest(manifest);
    console.log(`Manifest updated: ${path.relative(ROOT, CARDS_MANIFEST)}`);
  }
  console.log(`\nDone. ${made} generated, ${skipped} skipped, ${failed} failed.`);
  if (failed) process.exit(1);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
