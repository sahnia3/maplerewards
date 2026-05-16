// Injected into every supported merchant page. Detects which merchant the
// user is on (by hostname), fetches their wallet's best card for that
// merchant's category, and surfaces a small floating bar in the bottom-
// right corner with the recommendation.
//
// Designed to be polite — mounts once per page, has a dismiss button, and
// hides itself if the user is not signed in.

const MERCHANT_HOST_MAP = {
  "amazon.ca":                         { slug: "amazon_ca",           name: "Amazon Canada",         category: "everything-else" },
  "bestbuy.ca":                        { slug: "bestbuy_ca",          name: "Best Buy Canada",       category: "everything-else" },
  "indigo.ca":                         { slug: "indigo_ca",           name: "Indigo",                category: "everything-else" },
  "sephora.com":                       { slug: "sephora_ca",          name: "Sephora",               category: "everything-else" },
  "well.ca":                           { slug: "well_ca",             name: "Well.ca",               category: "pharmacy" },
  "metro.ca":                          { slug: "metro_ca",            name: "Metro",                 category: "groceries" },
  "sobeys.com":                        { slug: "sobeys_ca",           name: "Sobeys",                category: "groceries" },
  "iga.net":                           { slug: "iga_ca",              name: "IGA",                   category: "groceries" },
  "loblaws.ca":                        { slug: "loblaws_ca",          name: "Loblaws",               category: "groceries" },
  "nofrills.ca":                       { slug: "no_frills_ca",        name: "No Frills",             category: "groceries" },
  "realcanadiansuperstore.ca":         { slug: "superstore_ca",       name: "Real Canadian Superstore", category: "groceries" },
  "shoppersdrugmart.ca":               { slug: "shoppers_ca",         name: "Shoppers Drug Mart",    category: "pharmacy" },
  "costco.ca":                         { slug: "costco_ca",           name: "Costco Canada",         category: "groceries" },
  "walmart.ca":                        { slug: "walmart_ca",          name: "Walmart Canada",        category: "groceries" },
  "canadiantire.ca":                   { slug: "canadian_tire_ca",    name: "Canadian Tire",         category: "everything-else" },
  "uber.com":                          { slug: "uber",                name: "Uber",                  category: "gas-transit" },
  "ubereats.com":                      { slug: "ubereats",            name: "Uber Eats",             category: "dining" },
  "skipthedishes.com":                 { slug: "skipthedishes",       name: "SkipTheDishes",         category: "dining" },
  "doordash.com":                      { slug: "doordash",            name: "DoorDash",              category: "dining" },
  "aircanada.com":                     { slug: "air_canada",          name: "Air Canada",            category: "travel" },
  "westjet.com":                       { slug: "westjet",             name: "WestJet",               category: "travel" },
  "expedia.ca":                        { slug: "expedia_ca",          name: "Expedia Canada",        category: "travel" },
  "booking.com":                       { slug: "booking_com",         name: "Booking.com",           category: "travel" },
  "marriott.com":                      { slug: "marriott",            name: "Marriott",              category: "travel" },
};

(async function init() {
  if (window.__MAPLEREWARDS_LOADED__) return;
  window.__MAPLEREWARDS_LOADED__ = true;

  const merchant = matchMerchant(window.location.hostname);
  if (!merchant) return;

  // Pull the user's wallet sessionID from chrome.storage. The web app
  // mirrors `localStorage.maple_session_id` here via the cookie-bridge
  // (Tier 4 work). Without it the API rejects /optimize with 400, so we
  // surface the sign-in nudge instead of firing a guaranteed-to-fail call.
  const sessionID = await getSessionID();
  if (!sessionID) {
    renderSignInNudge(merchant);
    return;
  }

  // Background-worker round trip; falls back to silent no-op if the API is
  // unreachable or the user isn't signed in.
  chrome.runtime.sendMessage(
    {
      type: "api_fetch",
      path: "/optimize",
      method: "POST",
      body: {
        session_id: sessionID,
        category_slug: merchant.category,
        spend_amount: 100,
      },
    },
    (resp) => {
      if (!resp?.ok) {
        // Most likely cause: user not signed in. Render a minimal sign-in
        // nudge so the value of installing this extension is obvious.
        renderSignInNudge(merchant);
        return;
      }
      try {
        const recs = JSON.parse(resp.body);
        const best = Array.isArray(recs) ? recs[0] : null;
        if (best) renderRecommendation(merchant, best);
      } catch {
        /* ignore — corrupt JSON */
      }
    },
  );
})();

async function getSessionID() {
  try {
    const { mr_session_id } = await chrome.storage.local.get("mr_session_id");
    return mr_session_id || null;
  } catch {
    return null;
  }
}

function matchMerchant(hostname) {
  // Strip leading "www." and any subdomain that isn't part of the brand.
  const host = hostname.replace(/^www\./, "");
  if (MERCHANT_HOST_MAP[host]) return MERCHANT_HOST_MAP[host];
  for (const known of Object.keys(MERCHANT_HOST_MAP)) {
    if (host.endsWith("." + known) || host === known) {
      return MERCHANT_HOST_MAP[known];
    }
  }
  return null;
}

function renderRecommendation(merchant, rec) {
  const root = mountRoot();
  root.innerHTML = `
    <div class="mr-card">
      <div class="mr-eyebrow">MapleRewards · ${escapeHtml(merchant.name)}</div>
      <div class="mr-title">${escapeHtml(rec.card_name || "Best card")}</div>
      <div class="mr-sub">${escapeHtml(rec.program_name || "")} · ${rec.effective_return?.toFixed(2) ?? "0.00"}% on ${escapeHtml(merchant.category)}</div>
      ${costcoAmexWarning(merchant, rec)}
      <button class="mr-dismiss" aria-label="Dismiss">×</button>
    </div>
  `;
  bindDismiss(root);
}

function renderSignInNudge(merchant) {
  const root = mountRoot();
  root.innerHTML = `
    <div class="mr-card mr-card--muted">
      <div class="mr-eyebrow">MapleRewards · ${escapeHtml(merchant.name)}</div>
      <div class="mr-title">Sign in to see best card</div>
      <div class="mr-sub">Open the extension popup or visit <a href="https://maplerewards.app/login" target="_blank" rel="noopener">maplerewards.app/login</a></div>
      <button class="mr-dismiss" aria-label="Dismiss">×</button>
    </div>
  `;
  bindDismiss(root);
}

function costcoAmexWarning(merchant, rec) {
  // Most upvoted Canadian-rewards complaint — surface it prominently.
  const isAmex = /amex|cobalt|platinum/i.test(rec.card_name || "");
  const amexBlackoutSlugs = new Set([
    "costco_ca", "loblaws_ca", "no_frills_ca", "superstore_ca",
    "shoppers_ca", "wholesale_club_ca",
  ]);
  if (isAmex && amexBlackoutSlugs.has(merchant.slug)) {
    return `
      <div class="mr-warn">
        ⚠ ${escapeHtml(merchant.name)} doesn't accept Amex. Use a Mastercard or Visa instead.
      </div>
    `;
  }
  return "";
}

function mountRoot() {
  let root = document.getElementById("__maplerewards_root__");
  if (root) return root;
  root = document.createElement("div");
  root.id = "__maplerewards_root__";
  document.body.appendChild(root);
  return root;
}

function bindDismiss(root) {
  const btn = root.querySelector(".mr-dismiss");
  if (btn) btn.addEventListener("click", () => root.remove());
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
