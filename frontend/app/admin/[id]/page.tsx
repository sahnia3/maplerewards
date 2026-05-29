"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { adminUserDetail, ApiError, type AdminUserDetail } from "@/lib/api";
import { PageMasthead } from "@/components/editorial/page-masthead";

function str(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
function pick(o: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) if (o && o[k] != null && o[k] !== "") return str(o[k]);
  return "—";
}
const fmtDate = (v: unknown) => {
  const s = str(v);
  if (s === "—") return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
};

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 26 }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        {title}{count != null ? ` · ${count}` : ""}
      </div>
      {children}
    </section>
  );
}

export default function AdminUserDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const { isLoading: authLoading } = useAuth();
  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (authLoading || !id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await adminUserDetail(id);
        if (!cancelled) setData(res);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 403 || e.status === 401)) setForbidden(true);
        else if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError(e instanceof Error ? e.message : "Failed to load user");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, id]);

  const shell = (body: React.ReactNode) => (
    <div className="reveal" style={{ maxWidth: 1000, margin: "0 auto", padding: "24px clamp(20px,3vw,40px) 120px" }}>
      <Link href="/admin" className="mono" style={{ fontSize: 11, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em", textDecoration: "none" }}>← All users</Link>
      <div style={{ marginTop: 14 }}>{body}</div>
    </div>
  );

  if (forbidden) {
    return shell(<PageMasthead eyebrow="Admin" title="Restricted" lede="Administrators only." />);
  }
  if (notFound) return shell(<PageMasthead eyebrow="Admin" title="User not found" lede="No account with that id." />);
  if (loading) return shell(<p className="mono" style={{ color: "var(--ink-3)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Loading…</p>);
  if (error) return shell(<div className="mono" style={{ padding: "12px 16px", border: "1px solid var(--accent-soft)", borderRadius: 10, fontSize: 12, color: "var(--accent)" }}>⚠ {error}</div>);
  if (!data) return shell(null);

  const p = data.profile || {};
  const cell = { padding: "10px 12px", borderBottom: "1px solid var(--rule)", fontSize: 13, color: "var(--ink-2)" } as const;
  const th = { padding: "10px 12px", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-3)", textAlign: "left" } as const;

  return shell(
    <>
      <PageMasthead
        eyebrow="Admin · user"
        title={<span style={{ fontStyle: "italic" }}>{pick(p, "email", "display_name") === "—" ? "(anonymous)" : pick(p, "email", "display_name")}</span>}
        lede={`${pick(p, "plan")} · ${pick(p, "auth_provider")} · joined ${fmtDate(p["created_at"])}`}
      />

      {/* Profile */}
      <Section title="Profile">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {[
            ["User ID", str(data.user_id)],
            ["Email", pick(p, "email")],
            ["Display name", pick(p, "display_name")],
            ["Plan", pick(p, "plan")],
            ["Pro", pick(p, "is_pro")],
            ["Auth provider", pick(p, "auth_provider")],
            ["Stripe customer", pick(p, "stripe_customer_id")],
            ["Created", fmtDate(p["created_at"])],
          ].map(([k, v]) => (
            <div key={k} style={{ border: "1px solid var(--rule)", borderRadius: 10, padding: "10px 12px" }}>
              <div className="mono" style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)" }}>{k}</div>
              <div className="serif" style={{ fontSize: 14, color: "var(--ink)", marginTop: 3, overflowWrap: "anywhere" }}>{v}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Wallet */}
      <Section title="Wallet" count={data.wallet?.length ?? 0}>
        {(data.wallet?.length ?? 0) === 0 ? <Empty /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid var(--rule)", borderRadius: 12, overflow: "hidden" }}>
            <thead><tr style={{ borderBottom: "1px solid var(--rule)" }}><th style={th}>Card</th><th style={th}>Points</th><th style={th}>Added</th></tr></thead>
            <tbody>
              {data.wallet.map((c, i) => {
                const card = (c["card"] as Record<string, unknown>) || {};
                return (
                  <tr key={i}>
                    <td style={cell}>{pick(c, "nickname") !== "—" ? pick(c, "nickname") : pick(card, "name", "card_id") }</td>
                    <td style={cell}>{pick(c, "point_balance")}</td>
                    <td style={cell}>{fmtDate(c["added_at"])}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* Spend history */}
      <Section title="Spend history" count={data.spend_history?.length ?? 0}>
        {(data.spend_history?.length ?? 0) === 0 ? <Empty /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid var(--rule)", borderRadius: 12, overflow: "hidden" }}>
            <thead><tr style={{ borderBottom: "1px solid var(--rule)" }}>
              <th style={th}>Date</th><th style={th}>Category</th><th style={th}>Amount</th><th style={th}>Value</th><th style={th}>Note</th>
            </tr></thead>
            <tbody>
              {data.spend_history.slice(0, 100).map((e, i) => (
                <tr key={i}>
                  <td style={cell}>{fmtDate(e["spent_at"])}</td>
                  <td style={cell}>{pick(e, "category_name", "category_id")}</td>
                  <td style={cell}>${pick(e, "amount")}</td>
                  <td style={cell}>${pick(e, "dollar_value")}</td>
                  <td style={{ ...cell, color: "var(--ink-3)" }}>{pick(e, "note")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Applications */}
      <Section title="Card applications" count={data.card_applications?.length ?? 0}>
        {(data.card_applications?.length ?? 0) === 0 ? <Empty /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid var(--rule)", borderRadius: 12, overflow: "hidden" }}>
            <thead><tr style={{ borderBottom: "1px solid var(--rule)" }}><th style={th}>Card</th><th style={th}>Status</th><th style={th}>Applied</th></tr></thead>
            <tbody>
              {data.card_applications.map((a, i) => (
                <tr key={i}>
                  <td style={cell}>{pick(a, "card_name", "card_id")}</td>
                  <td style={cell}>{pick(a, "status")}</td>
                  <td style={cell}>{fmtDate(a["applied_at"])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Other sections — counts (full detail available via the data export) */}
      <Section title="More">
        <div className="mono" style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, color: "var(--ink-3)" }}>
          {[
            ["Welcome bonuses", data.welcome_bonuses?.length ?? 0],
            ["Loyalty accounts", data.loyalty_accounts?.length ?? 0],
            ["Award watches", data.award_watches?.length ?? 0],
            ["Chat conversations", data.chat_conversations?.length ?? 0],
          ].map(([k, v]) => (
            <span key={String(k)} style={{ border: "1px solid var(--rule)", borderRadius: 999, padding: "5px 11px" }}>{k}: {v}</span>
          ))}
        </div>
      </Section>
    </>
  );
}

function Empty() {
  return <p className="serif" style={{ color: "var(--ink-3)", fontStyle: "italic", fontSize: 14 }}>None.</p>;
}
