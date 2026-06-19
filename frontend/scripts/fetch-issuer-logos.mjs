// Fetch real bank logos for MapleRewards issuer badges.
// Tries SimpleIcons (clean SVG) first, then Clearbit (PNG by domain).
// Writes to public/issuers/<key-lowercased>.(svg|png). Validates each file
// is a real image (non-empty, valid header); deletes anything HTML/empty.
//
// Run: node scripts/fetch-issuer-logos.mjs

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "issuers");

// key -> { slug (SimpleIcons), domain (Clearbit) }
const ISSUERS = [
  { key: "AMEX", slug: "americanexpress", domain: "americanexpress.com" },
  { key: "SCOTIA", slug: "scotiabank", domain: "scotiabank.com" },
  { key: "RBC", slug: "rbc", domain: "rbc.com" },
  { key: "TD", slug: "tdbank", domain: "td.com" },
  { key: "CIBC", slug: "cibc", domain: "cibc.com" },
  { key: "BMO", slug: "bmo", domain: "bmo.com" },
  { key: "NATIONAL", slug: null, domain: "nbc.ca" },
  { key: "TANGERINE", slug: "tangerine", domain: "tangerine.ca" },
  { key: "SIMPLII", slug: null, domain: "simplii.com" },
  { key: "DESJARDINS", slug: "desjardins", domain: "desjardins.com" },
  { key: "HSBC", slug: "hsbc", domain: "hsbc.ca" },
  { key: "CANADIAN_TIRE", slug: "canadiantire", domain: "canadiantire.ca" },
  { key: "NEO", slug: null, domain: "neofinancial.com" },
  { key: "WEALTHSIMPLE", slug: "wealthsimple", domain: "wealthsimple.com" },
  { key: "PC", slug: null, domain: "pcfinancial.ca" },
  { key: "ROGERS", slug: "rogers", domain: "rogersbank.com" },
  { key: "BRIM", slug: null, domain: "brimfinancial.com" },
];

const TIMEOUT = 15000;

function isSvg(buf) {
  const head = buf.slice(0, 600).toString("utf8").toLowerCase();
  return head.includes("<svg") || (head.includes("<?xml") && head.includes("svg"));
}

function isPng(buf) {
  return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}

function isJpeg(buf) {
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

function looksLikeHtml(buf) {
  const head = buf.slice(0, 200).toString("utf8").toLowerCase().trimStart();
  return head.startsWith("<!doctype html") || head.startsWith("<html");
}

async function tryFetch(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (logo-fetch)" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchOne({ key, slug, domain }) {
  const base = key.toLowerCase();
  // 1) SimpleIcons SVG (clean, monochrome brand mark) if a slug exists.
  if (slug) {
    const buf = await tryFetch(`https://cdn.simpleicons.org/${slug}`);
    if (buf && buf.length > 50 && isSvg(buf) && !looksLikeHtml(buf)) {
      await writeFile(join(OUT, `${base}.svg`), buf);
      return { key, file: `${base}.svg`, source: "simpleicons", bytes: buf.length };
    }
  }
  // 2) Clearbit logo PNG by domain.
  const buf = await tryFetch(`https://logo.clearbit.com/${domain}`);
  if (buf && buf.length > 100 && !looksLikeHtml(buf)) {
    if (isPng(buf)) {
      await writeFile(join(OUT, `${base}.png`), buf);
      return { key, file: `${base}.png`, source: "clearbit", bytes: buf.length };
    }
    if (isJpeg(buf)) {
      await writeFile(join(OUT, `${base}.jpg`), buf);
      return { key, file: `${base}.jpg`, source: "clearbit", bytes: buf.length };
    }
    if (isSvg(buf)) {
      await writeFile(join(OUT, `${base}.svg`), buf);
      return { key, file: `${base}.svg`, source: "clearbit", bytes: buf.length };
    }
  }
  return { key, file: null, source: "FAILED", bytes: 0 };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const results = [];
  for (const issuer of ISSUERS) {
    // sequential to be polite to the CDNs
    const r = await fetchOne(issuer);
    results.push(r);
    console.log(`${r.source === "FAILED" ? "MISS" : " OK "}  ${r.key.padEnd(14)} ${r.file ?? "(none)"} ${r.bytes ? r.bytes + "B " + r.source : ""}`);
  }
  const ok = results.filter((r) => r.file).length;
  console.log(`\n${ok}/${results.length} logos obtained.`);
  // Emit a machine-readable manifest of which keys have files + extension.
  const manifest = {};
  for (const r of results) {
    if (r.file) manifest[r.key] = r.file.slice(r.file.indexOf(".") + 1);
  }
  console.log("MANIFEST " + JSON.stringify(manifest));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
