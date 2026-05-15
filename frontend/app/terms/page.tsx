import Link from "next/link";
import { PageMasthead } from "@/components/editorial/page-masthead";
import { LeafDivider } from "@/components/editorial/leaf-divider";

export const metadata = {
  title: "Terms of Service — Maple Rewards",
  description:
    "Terms governing your use of Maple Rewards, including the Pro subscription, refund policy, and acceptable use.",
};

/**
 * /terms — Terms of Service. Ontario governing law. Plain language plus the
 * legally-required disclaimers (CPP is an estimate, no warranty, liability
 * cap). Mirrors the structure of /privacy so users can compare.
 */
export default function TermsPage() {
  return (
    <div className="reveal" style={{ paddingTop: 0 }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "32px clamp(20px, 4vw, 60px) 80px" }}>
        <PageMasthead
          eyebrow="Terms"
          eyebrowEnd="Ontario, Canada · last updated 2026-05-15"
          title={<>The <span style={{ fontStyle: "italic" }}>rules</span> for using Maple Rewards.</>}
          lede="By using Maple Rewards you agree to these terms. They cover account use, the Pro subscription, what you can and can't do with the service, and the things we can't legally promise."
        />

        <LeafDivider />

        <Section title="1. What Maple Rewards does">
          <p>Maple Rewards is a software-only credit-card rewards optimizer for Canadian residents. We do not issue credit cards, we do not hold your money, we do not process payments on your behalf. Recommendations are educational; the final decision to apply for or use any credit card is yours.</p>
        </Section>

        <Section title="2. Eligibility">
          <p>You must be 18+ and a Canadian resident to use Maple Rewards. By signing up you confirm you meet both criteria.</p>
        </Section>

        <Section title="3. Your account">
          <p>You are responsible for keeping your login credentials secure. We use bcrypt-hashed passwords and rotating refresh tokens, but if your account is compromised through your end (phishing, password reuse) we can&rsquo;t recover lost data beyond what is in our standard backups.</p>
          <p>You can delete your account anytime from <Link href="/settings" style={linkStyle}>account settings</Link>. We hard-delete your data 30 days after the deletion request.</p>
        </Section>

        <Section title="4. The Pro subscription">
          <p><strong>Trial:</strong> Pro starts with a 7-day free trial. You will not be charged until the trial ends. You can cancel anytime during the trial — we will not charge you.</p>
          <p><strong>Billing:</strong> After the trial, the price you selected (monthly, annual, or lifetime) is charged to the card on file via Stripe. Renewal is automatic for monthly and annual plans. You can change plans, pause, or cancel from <Link href="/settings" style={linkStyle}>account settings</Link>.</p>
          <p><strong>Refunds:</strong> Annual and monthly subscriptions are refundable on a pro-rated basis within 30 days of charge if you have not used a Pro-only feature more than three times in the period. Email <a href="mailto:hello@maplerewards.ca" style={linkStyle}>hello@maplerewards.ca</a> with your account email. The lifetime tier is non-refundable after 30 days from purchase.</p>
          <p><strong>Price changes:</strong> We may change Pro pricing in the future. Existing subscribers keep their grandfathered rate for at least 12 months from any change.</p>
        </Section>

        <Section title="5. Acceptable use">
          <p>Don&rsquo;t do these:</p>
          <ul style={listStyle}>
            <li>Scrape our API or any part of the product. We rate-limit but don&rsquo;t make us send a cease-and-desist.</li>
            <li>Resell access to a Pro account. One account per person.</li>
            <li>Use the AI chat to generate spam, abuse, or anything illegal.</li>
            <li>Reverse-engineer our optimizer algorithm. The math is internal; the recommendations are yours.</li>
            <li>Submit knowingly false data to manipulate our missed-rewards reports (e.g., to defraud an issuer).</li>
          </ul>
          <p>We can suspend or terminate accounts that violate these rules. We will refund unused Pro time on a pro-rated basis unless the violation involved fraud against us or third parties.</p>
        </Section>

        <Section title="6. The math is an estimate">
          <p>Every cents-per-point (CPP) figure on the site is our best estimate based on public award charts, transfer ratios, and recent market data. Loyalty programs change their charts without notice. We refresh valuations regularly but cannot guarantee that the value you see today will be the value you get when you redeem next month.</p>
          <p>Missed-rewards reports are computed against your current wallet — we don&rsquo;t track historical card composition, so the &ldquo;optimal&rdquo; card may be one you didn&rsquo;t own at the time of the swipe. The report discloses this caveat in-product.</p>
          <p>Award-availability data (Apify, Seats.aero) comes from third parties and may be stale or wrong by the time you call the airline.</p>
        </Section>

        <Section title="7. No financial advice">
          <p>Maple Rewards is a software tool, not a financial advisor. Nothing on the site is a recommendation to take out credit, change your spending habits, or make any financial decision. Consult a licensed financial professional if you need personalized advice.</p>
        </Section>

        <Section title="8. Third-party services">
          <p>Where we integrate with third parties (Anthropic, Stripe, Apify, SerpAPI, airlines you link to from comparison pages) we are not responsible for outages, errors, or changes in those services. We do our best to graceful-degrade.</p>
        </Section>

        <Section title="9. Warranties and liability">
          <p><strong>The service is provided &ldquo;as is.&rdquo;</strong> We make no warranties of merchantability, fitness for a particular purpose, or non-infringement. Use at your own risk.</p>
          <p><strong>Our liability is capped</strong> at the greater of (a) the amount you have paid us in the 12 months preceding the claim, or (b) CAD $100. We are not liable for indirect, consequential, special, or punitive damages.</p>
          <p>Nothing in these terms limits liability for fraud, willful misconduct, or anything else that cannot be limited under applicable law.</p>
        </Section>

        <Section title="10. Indemnity">
          <p>You agree to indemnify and hold Maple Rewards harmless from any third-party claim arising out of (a) your violation of these terms, (b) your violation of applicable law, or (c) information you submitted to the service that infringed someone else&rsquo;s rights.</p>
        </Section>

        <Section title="11. Changes to these terms">
          <p>We may update these terms. Material changes will be announced via email and an in-app banner 30 days before they take effect. Continued use after a change constitutes acceptance.</p>
        </Section>

        <Section title="12. Governing law">
          <p>These terms are governed by the laws of the Province of Ontario, Canada. Disputes will be heard in the courts of Toronto, Ontario.</p>
        </Section>

        <Section title="13. Contact">
          <p>Questions, complaints, or refund requests: <a href="mailto:hello@maplerewards.ca" style={linkStyle}>hello@maplerewards.ca</a>. We respond within 5 business days.</p>
        </Section>

        <LeafDivider />

        <p className="serif" style={{ fontSize: 13, color: "var(--ink-3)", fontStyle: "italic", marginTop: 18 }}>
          See also: <Link href="/privacy" style={linkStyle}>Privacy Policy</Link>.
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
