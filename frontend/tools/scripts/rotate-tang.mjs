#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "public", "cards");
const MANIFEST = path.join(OUT, "manifest.json");
const KEY = process.env.GEMINI_API_KEY;
const slug = "tangerine-world-mastercard";

const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
const ext = manifest[slug];
const fp = path.join(OUT, `${slug}.${ext}`);

async function check(p) {
  const buf = await fs.readFile(p);
  const e = path.extname(p).slice(1).toLowerCase();
  const mime = e === "jpg" || e === "jpeg" ? "image/jpeg" : "image/png";
  const body = {
    contents: [{ parts: [
      { text: 'Is the credit card design in this image oriented LANDSCAPE (long edge horizontal, like a real credit card in normal use) or PORTRAIT (long edge vertical, rotated 90 degrees from normal)? Return only the word "landscape" or "portrait".' },
      { inlineData: { mimeType: mime, data: buf.toString("base64") } }
    ]}],
    generationConfig: { temperature: 0, maxOutputTokens: 60, thinkingConfig: { thinkingBudget: 0 } }
  };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  return (j?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim().toLowerCase();
}

console.log("original:", await check(fp));
await sharp(fp).rotate(90).toFile(fp + ".cw");
const cwResult = await check(fp + ".cw");
console.log("rotated 90° CW:", cwResult);

if (cwResult.includes("landscape")) {
  await fs.rename(fp + ".cw", fp);
  console.log("✓ used CW rotation");
  process.exit(0);
}

await sharp(fp).rotate(-90).toFile(fp + ".ccw");
const ccwResult = await check(fp + ".ccw");
console.log("rotated 90° CCW:", ccwResult);
await fs.unlink(fp + ".cw").catch(() => {});

if (ccwResult.includes("landscape")) {
  await fs.rename(fp + ".ccw", fp);
  console.log("✓ used CCW rotation");
} else {
  await fs.unlink(fp + ".ccw").catch(() => {});
  console.log("✗ neither rotation produced landscape — Tangerine.ca asset has portrait-oriented card baked into a square; can't fix without different source");
}
