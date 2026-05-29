"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { adminListUsers, ApiError, type AdminUserListItem } from "@/lib/api";
import { PageMasthead } from "@/components/editorial/page-masthead";

const PAGE_SIZE = 50;

export default function AdminUsersPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [rows, setRows] = useState<AdminUserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState(""); // debounced/submitted value
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListUsers({ limit: PAGE_SIZE, offset, q: query });
      setRows(res.users);
      setTotal(res.total);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 401)) {
        setForbidden(true);
      } else {
        setError(e instanceof Error ? e.message : "Failed to load users");
      }
    } finally {
      setLoading(false);
    }
  }, [offset, query]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  // Cosmetic gate; the API 403 (handled in load()) is the real enforcement.
  if (forbidden || (!authLoading && !isAdmin)) {
    return (
      <div className="reveal" style={{ maxWidth: 880, margin: "0 auto", padding: "32px clamp(20px,3vw,40px)" }}>
        <PageMasthead eyebrow="Admin" title="Restricted" lede="This area is for administrators only." />
        <p className="serif" style={{ color: "var(--ink-2)", fontStyle: "italic" }}>
          Your account doesn’t have admin access. If this is a mistake, add your email to
          <code style={{ margin: "0 4px" }}>ADMIN_EMAILS</code> and re-login.
        </p>
      </div>
    );
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const fmtDate = (s: string | null) =>
    s ? new Date(s).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" }) : "—";

  return (
    <div className="reveal" style={{ maxWidth: 1100, margin: "0 auto", padding: "32px clamp(20px,3vw,40px) 120px" }}>
      <PageMasthead
        eyebrow="Admin"
        eyebrowEnd={`${total} users`}
        title={<>The <span style={{ fontStyle: "italic" }}>user</span> register.</>}
        lede="Every account, with live activity. Click a user to see their full wallet, spend history, and applications."
      />

      {/* Search */}
      <form
        onSubmit={(e) => { e.preventDefault(); setOffset(0); setQuery(q.trim()); }}
        style={{ display: "flex", gap: 10, margin: "8px 0 20px" }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search email or name…"
          className="serif"
          style={{
            flex: 1, minWidth: 0, padding: "10px 14px", borderRadius: 10,
            background: "var(--surface)", border: "1px solid var(--rule-strong)",
            color: "var(--ink)", fontSize: 15, outline: "none",
          }}
        />
        <button type="submit" className="mono" style={{
          padding: "10px 18px", borderRadius: 10, background: "var(--accent)", color: "#fff",
          border: "none", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer",
        }}>Search</button>
      </form>

      {loading ? (
        <p className="mono" style={{ color: "var(--ink-3)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Loading…</p>
      ) : error ? (
        <div className="mono" style={{ padding: "12px 16px", border: "1px solid var(--accent-soft)", borderRadius: 10, fontSize: 12, color: "var(--accent)" }}>⚠ {error}</div>
      ) : rows.length === 0 ? (
        <p className="serif" style={{ color: "var(--ink-2)", fontStyle: "italic" }}>No users match.</p>
      ) : (
        <div style={{ border: "1px solid var(--rule)", borderRadius: 14, overflow: "hidden" }}>
          {/* header row */}
          <div className="mono" style={{
            display: "grid", gridTemplateColumns: "2fr 1fr 0.8fr 0.8fr 1fr", gap: 12,
            padding: "12px 18px", borderBottom: "1px solid var(--rule)",
            fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)",
          }}>
            <span>User</span><span>Plan</span><span style={{ textAlign: "right" }}>Cards</span>
            <span style={{ textAlign: "right" }}>Entries</span><span style={{ textAlign: "right" }}>Last spend</span>
          </div>
          {rows.map((u) => (
            <Link
              key={u.id}
              href={`/admin/${u.id}`}
              style={{
                display: "grid", gridTemplateColumns: "2fr 1fr 0.8fr 0.8fr 1fr", gap: 12, alignItems: "center",
                padding: "14px 18px", borderTop: "1px solid var(--rule)", textDecoration: "none",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--card-fill)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ minWidth: 0 }}>
                <div className="serif" style={{ fontSize: 15, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {u.email || u.display_name || "(anonymous)"}
                </div>
                <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.04em" }}>
                  {u.auth_provider} · joined {fmtDate(u.created_at)}
                </div>
              </div>
              <div>
                <span className="mono" style={{
                  fontSize: 10, padding: "3px 8px", borderRadius: 999, textTransform: "uppercase", letterSpacing: "0.06em",
                  border: `1px solid ${u.is_pro ? "var(--accent)" : "var(--rule)"}`,
                  color: u.is_pro ? "var(--accent)" : "var(--ink-3)",
                }}>{u.plan}</span>
              </div>
              <div className="mono" style={{ fontSize: 13, color: "var(--ink-2)", textAlign: "right" }}>{u.card_count}</div>
              <div className="mono" style={{ fontSize: 13, color: "var(--ink-2)", textAlign: "right" }}>{u.entry_count}</div>
              <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", textAlign: "right" }}>{fmtDate(u.last_spend)}</div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && total > PAGE_SIZE && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
          <button
            className="mono" disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            style={{ padding: "8px 14px", borderRadius: 8, background: "transparent", border: "1px solid var(--rule)", color: offset === 0 ? "var(--ink-3)" : "var(--ink)", fontSize: 12, cursor: offset === 0 ? "not-allowed" : "pointer" }}
          >← Prev</button>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>Page {page} of {pages}</span>
          <button
            className="mono" disabled={page >= pages}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            style={{ padding: "8px 14px", borderRadius: 8, background: "transparent", border: "1px solid var(--rule)", color: page >= pages ? "var(--ink-3)" : "var(--ink)", fontSize: 12, cursor: page >= pages ? "not-allowed" : "pointer" }}
          >Next →</button>
        </div>
      )}
    </div>
  );
}
