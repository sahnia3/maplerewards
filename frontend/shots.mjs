import { chromium } from 'playwright';
const DIR = process.env.HOME + '/Desktop/MapleRewards-Launch-Images';
const BASE = 'https://maplerewards.app';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const log = [];

async function dismissBanners() {
  for (const t of ['Accept all', 'Accept', 'Got it', 'I agree', 'OK', 'Allow all', 'Dismiss']) {
    const el = p.locator(`button:has-text("${t}")`).first();
    if (await el.count().catch(() => 0)) { await el.click({ timeout: 1500 }).catch(() => {}); await p.waitForTimeout(300); }
  }
}
async function shot(name) { await p.waitForTimeout(700); await p.screenshot({ path: `${DIR}/${name}.png` }); log.push(name); }

try {
  // 1. Homepage hero (above the fold)
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await p.waitForTimeout(2500); await dismissBanners();
  await shot('1-home-hero');

  // 2. Optimizer in action (NU-2 demo wallet → real ranked results)
  await p.goto(BASE + '/optimizer', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await p.waitForTimeout(2500); await dismissBanners();
  const cat = p.locator('button:has-text("Dining"), button:has-text("Groceries"), button:has-text("Gas")').first();
  if (await cat.count()) await cat.click().catch(() => {});
  const amt = p.locator('input[type="number"]').first();
  if (await amt.count()) await amt.fill('600');
  const rank = p.locator('button:has-text("Rank cards")').first();
  if (await rank.count()) { await rank.click().catch(() => {}); await p.waitForTimeout(2200); }
  await shot('2-optimizer-result');

  // 3. Loyalty detail (transfer partners / CPP tiles — visually rich)
  await p.goto(BASE + '/loyalty/aeroplan', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await p.waitForTimeout(2500); await dismissBanners();
  await shot('3-loyalty-aeroplan');

  // 4. Cards catalog
  await p.goto(BASE + '/cards', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await p.waitForTimeout(2500); await dismissBanners();
  await shot('4-cards-catalog');

  // 5. Pricing (shows the product is real/commercial)
  await p.goto(BASE + '/pricing', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await p.waitForTimeout(2500); await dismissBanners();
  await shot('5-pricing');
} catch (e) { log.push('ERROR: ' + e.message); }

console.log('captured:', JSON.stringify(log));
await b.close();
