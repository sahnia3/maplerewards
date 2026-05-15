import Link from "next/link";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { LeafDivider } from "@/components/editorial/leaf-divider";

export const metadata = {
  title: "Privacy Policy — Maple Rewards",
  description:
    "How Maple Rewards collects, uses, and protects your personal information under PIPEDA and GDPR.",
};

/**
 * /privacy — Privacy Policy. PIPEDA (Canada) + GDPR (EU residents) baseline.
 * Plain language so a beginner can read it; legally precise enough for
 * compliance. Hard requirement before charging real money.
 *
 * If you change this page, also update the "last updated" date and notify
 * existing users via email if changes are material.
 */
export default function PrivacyPage() {
  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
        <PageMasthead
          eyebrow="Privacy"
          eyebrowEnd="PIPEDA · GDPR · last updated 2026-05-15"
          title={<>What we <span style={{ fontStyle: "italic" }}>collect</span>, why, and how to take it back.</>}
          lede="Plain-language privacy policy. Maple Rewards is a Canadian-resident credit-card rewards optimizer. We hold the minimum data needed to compute your missed rewards and answer your chat questions — nothing more — and you can export or delete all of it from the account settings page."
        />

        <LeafDivider />

        <Section title="1. Who we are">
          <p>Maple Rewards is operated by a sole proprietorship based in Ontario, Canada. The data controller for the purposes of PIPEDA and GDPR is the founder, reachable at <a href="mailto:hello@maplerewards.ca" style={linkStyle}>hello@maplerewards.ca</a>.</p>
        </Section>

        <Section title="2. What we collect">
          <p>We collect only what we need to deliver the product. Three categories:</p>
          <ul style={listStyle}>
            <li><strong>Account data</strong> — email address, display name, hashed password (or Google account ID if you signed in with Google), the timestamp of your last login.</li>
            <li><strong>Rewards data</strong> — the credit cards you tell us you carry, point balances you enter, applications you record, missed-rewards reports we compute. We never see your real bank account or card number. Spending entries are typed by you or imported from a CSV you upload — we do not link to your bank.</li>
            <li><strong>Operational data</strong> — IP address (for rate-limiting), user-agent string, the chat messages you send to our AI assistant. Chat history is kept so you can scroll back; you can delete a conversation at any time.</li>
          </ul>
          <p>We do <strong>not</strong> collect: real-time bank transactions, government IDs, social insurance numbers, biometrics, location beyond IP-derived city, or browser fingerprints.</p>
        </Section>

        <Section title="3. Why we collect it">
          <p>We use your data exclusively to deliver the product features you signed up for:</p>
          <ul style={listStyle}>
            <li><strong>Optimizer + missed-rewards</strong> — your wallet and spend entries feed the algorithm that ranks cards and identifies leakage.</li>
            <li><strong>AI chat</strong> — your messages plus a wallet snapshot are sent to Anthropic (our LLM provider) per query.</li>
            <li><strong>Award alerts</strong> — your saved trips drive the background worker that probes airline award availability.</li>
            <li><strong>Account integrity</strong> — IP + user-agent are kept short-term for rate-limit and abuse detection.</li>
          </ul>
          <p>We do not sell data, run ads, or share anything with marketing networks.</p>
        </Section>

        <Section title="4. Sub-processors we use">
          <p>To run the service we share specific data with these vendors. Each is contractually bound to use the data only for the stated purpose.</p>
          <table style={tableStyle}>
            <thead>
              <tr><th>Vendor</th><th>What they see</th><th>Why</th></tr>
            </thead>
            <tbody>
              <tr><td>Anthropic (US)</td><td>Your chat message + wallet snapshot</td><td>LLM responses</td></tr>
              <tr><td>Stripe (US)</td><td>Email, name, billing address</td><td>Payment processing</td></tr>
              <tr><td>Resend (US)</td><td>Email address, message body</td><td>Outbound email</td></tr>
              <tr><td>Apify (Czech Republic)</td><td>Airline routes you search</td><td>Award availability scraping</td></tr>
              <tr><td>SerpAPI (US)</td><td>Airline routes you search</td><td>Cash-price comparison</td></tr>
              <tr><td>Tavily (US)</td><td>None — internal cron only</td><td>Promo blog scraping</td></tr>
              <tr><td>Google (US)</td><td>Email, name (only if you used Google sign-in)</td><td>OAuth login</td></tr>
            </tbody>
          </table>
        </Section>

        <Section title="5. Cookies and storage">
          <p>We use three classes of browser storage:</p>
          <ul style={listStyle}>
            <li><strong>Essential cookies</strong> — your session token (httpOnly, secure) and CSRF token. Cannot be disabled — the product breaks without them.</li>
            <li><strong>Functional localStorage</strong> — your sidebar collapsed state, last-visited route, accepted cookie banner. You can clear this from your browser at any time.</li>
            <li><strong>No tracking cookies, no third-party ad cookies, no fingerprinting.</strong> If we ever wire analytics (PostHog or similar), we will update this policy and re-prompt for consent.</li>
          </ul>
        </Section>

        <Section title="6. Your rights">
          <p>You have these rights regardless of where you live. Quebec residents (Law 25), EU/UK residents (GDPR), and US/elsewhere users — same rights, same one-click flows:</p>
          <ul style={listStyle}>
            <li><strong>Right to access</strong> — download every byte of data we hold about you as JSON from <Link href="/settings" style={linkStyle}>account settings</Link> → "Export my data."</li>
            <li><strong>Right to correction</strong> — edit your profile + wallet entries directly in the app.</li>
            <li><strong>Right to deletion</strong> — "Delete my account" in settings. We mark your account deleted immediately; the rows are hard-deleted from our database after a 30-day grace period (long enough to undo accidental deletion, short enough to be defensible).</li>
            <li><strong>Right to portability</strong> — the export above is plain JSON. You can take it anywhere.</li>
            <li><strong>Right to withdraw consent</strong> — opt out of the weekly missed-rewards email from any digest footer, or revoke entirely by deleting your account.</li>
            <li><strong>Right to object / restrict processing</strong> — email us at <a href="mailto:hello@maplerewards.ca" style={linkStyle}>hello@maplerewards.ca</a> and we will respond within 30 days.</li>
          </ul>
        </Section>

        <Section title="7. Retention">
          <p>Active accounts: data is kept for the life of your account.</p>
          <p>Deleted accounts: a soft-delete marker is set immediately. After 30 days a background job hard-deletes all rows associated with that user (cards, spend, applications, chat history, refresh tokens, push subscriptions). Audit log retains the deletion timestamp for 12 months to comply with anti-fraud requirements.</p>
          <p>Anonymous sessions (you used the site without signing up) expire after 90 days of inactivity.</p>
        </Section>

        <Section title="8. Children">
          <p>Maple Rewards is not directed at users under 18. If you are a parent and believe your child has signed up, email us at <a href="mailto:hello@maplerewards.ca" style={linkStyle}>hello@maplerewards.ca</a> and we will delete the account.</p>
        </Section>

        <Section title="9. Where we store data">
          <p>The primary database is hosted in Canada. Sub-processor data may transit to the US (Stripe, Anthropic, Resend) or EU (Apify). All transfers occur under standard contractual clauses or equivalent legal mechanisms.</p>
        </Section>

        <Section title="10. Security">
          <p>Passwords are hashed with bcrypt. Sessions use JWT (15-minute access tokens, 30-day refresh with rotation). API traffic is HTTPS-only. We do not write payment card numbers to our database — Stripe handles all card data and we only see a customer ID. We use defense-in-depth practices (CSRF tokens, rate limiting, JWT reuse detection) and rotate provider API keys quarterly.</p>
        </Section>

        <Section title="11. Changes to this policy">
          <p>If we make material changes — new sub-processors, new data categories, new purposes — we will email registered users and post a banner in-app for 30 days. The "last updated" date at the top of this page always reflects the latest revision.</p>
        </Section>

        <Section title="12. Complaints">
          <p>If you believe we have mishandled your data, please contact us first at <a href="mailto:hello@maplerewards.ca" style={linkStyle}>hello@maplerewards.ca</a>. You also have the right to lodge a complaint with the <a href="https://www.priv.gc.ca/" target="_blank" rel="noopener noreferrer" style={linkStyle}>Office of the Privacy Commissioner of Canada</a> or, for EU residents, your local supervisory authority.</p>
        </Section>

        <LeafDivider />

        <p className="serif" style={{ fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", marginTop: 18 }}>
          See also: <Link href="/terms" style={linkStyle}>Terms of Service</Link>.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 32 }}>
      <h2 className="display" style={{ fontSize: "clamp(20px, 2.2vw, 26px)", marginBottom: 12, color: "var(--ink)" }}>
        {title}
      </h2>
      <div className="serif" style={{ fontSize: 15, lineHeight: 1.6, color: "var(--ink-2)" }}>
        {children}
      </div>
    </section>
  );
}

const linkStyle: React.CSSProperties = { color: "var(--accent)" };

const listStyle: React.CSSProperties = {
  paddingLeft: 22,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  marginTop: 8,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
  marginTop: 12,
  marginBottom: 12,
  border: "1px solid var(--rule)",
};
