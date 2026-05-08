#!/usr/bin/env node
/**
 * Use Gemini Vision to verify each card image actually depicts the expected card,
 * is isolated (not a comparison), and detect orientation.
 *
 * Usage: GEMINI_API_KEY=... node tools/scripts/verify-cards.mjs <slug1> <slug2> ...
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "public", "cards");
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("Need GEMINI_API_KEY"); process.exit(1); }

const slugs = process.argv.slice(2);
if (!slugs.length) { console.error("usage: verify-cards.mjs <slug>..."); process.exit(1); }

const manifest = JSON.parse(await fs.readFile(path.join(OUT, "manifest.json"), "utf8"));

async function inspect(slug) {
  const ext = manifest[slug];
  if (!ext) return { slug, error: "not in manifest" };
  const fp = path.join(OUT, `${slug}.${ext}`);
  let buf;
  try { buf = await fs.readFile(fp); }
  catch (e) { return { slug, error: `read fail: ${e.message}` }; }
  const b64 = buf.toString("base64");
  const mime = ext === "jpg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
  const body = {
    contents: [{ parts: [
      { text: `Identify the credit card in this image. Expected slug is "${slug}". Return ONLY a JSON object:\n{\n  "card_name": string,\n  "issuer": string,\n  "card_orientation": "landscape" | "portrait" — orientation of the card DESIGN (a credit card is normally landscape; if shown rotated 90° in this image, mark portrait),\n  "card_fills_frame": boolean — true if the single card is the dominant element and fills the image with minimal background,\n  "multiple_cards_visible": boolean,\n  "matches_expected": boolean — true only if the visible card identifiably matches "${slug}"\n}\nBe strict. No prose, no markdown.` },
      { inlineData: { mimeType: mime, data: b64 } }
    ]}],
    generationConfig: { temperature: 0, maxOutputTokens: 1500, thinkingConfig: { thinkingBudget: 0 } }
  };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) return { slug, error: `HTTP ${r.status}` };
  const j = await r.json();
  const text = (j?.candidates?.[0]?.content?.parts?.[0]?.text || "").replace(/```(?:json)?/g, "").trim();
  const m = text.match(/\{[\s\S]*?\}/);
  if (!m) return { slug, error: `no json: ${text.slice(0, 100)}` };
  try { return { slug, ...JSON.parse(m[0]) }; }
  catch { return { slug, error: `parse fail: ${text.slice(0, 100)}` }; }
}

for (const slug of slugs) {
  const v = await inspect(slug);
  const label = v.matches_expected ? "✓" : v.multiple_cards_visible ? "✗ MULTI" : !v.card_fills_frame ? "⚠ TOO_SMALL" : "✗";
  console.log(`${label} ${slug}`);
  console.log(`    ${JSON.stringify(v)}`);
}
