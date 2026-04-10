"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  User,
  Mail,
  Calendar,
  Shield,
  Crown,
  LogOut,
  Trash2,
  CreditCard,
  Loader2,
  Save,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useWallet } from "@/contexts/wallet-context";
import { AnimatedSection } from "@/components/ui/animated-list";

export default function ProfilePage() {
  const router = useRouter();
  const { user, isPro, isAuthenticated, isLoading, logout, updateProfile } = useAuth();
  const { wallet, totalPoints } = useWallet();

  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--teal)" }} />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    router.push("/login?redirect=/profile");
    return null;
  }

  async function handleSave() {
    if (!displayName.trim()) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      await updateProfile(displayName.trim());
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== "DELETE") return;
    try {
      // Call delete API
      const { deleteAccount } = await import("@/lib/api");
      await deleteAccount();
      await logout();
      router.push("/login");
    } catch {
      // silently fail
    }
  }

  const initials = (user.display_name || user.email || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })
    : "—";

  return (
    <div className="max-w-2xl mx-auto px-5 py-10 lg:py-14">
      <AnimatedSection>
        <h1 className="text-[28px] font-bold tracking-tight gradient-text mb-8">Profile</h1>
      </AnimatedSection>

      {/* Avatar + Name Header */}
      <AnimatedSection delay={0.05}>
        <div className="flex items-center gap-5 mb-8">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-bold text-white shrink-0"
            style={{ background: "linear-gradient(135deg, #0D9488, #0F766E)" }}
          >
            {initials}
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">
              {user.display_name || user.email || "User"}
            </h2>
            <p className="text-[14px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {user.email}
            </p>
            {isPro && (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase mt-2"
                style={{
                  background: "linear-gradient(135deg, #FFD700, #FFA500)",
                  color: "#000",
                }}
              >
                <Crown size={10} /> Pro Member
              </span>
            )}
          </div>
        </div>
      </AnimatedSection>

      {/* Edit Display Name */}
      <AnimatedSection delay={0.1}>
        <div className="rounded-2xl p-6 mb-6" style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-dim)",
        }}>
          <h3 className="text-[15px] font-semibold text-white mb-4 flex items-center gap-2">
            <User size={16} style={{ color: "var(--teal)" }} />
            Display Name
          </h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="flex-1 h-10 px-4 rounded-xl text-[14px] input-maple focus-ring"
            />
            <button
              onClick={handleSave}
              disabled={saving || !displayName.trim()}
              className="h-10 px-5 rounded-xl text-[13px] font-semibold text-white transition-all accent-bg disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </button>
          </div>
          {saveSuccess && (
            <p className="text-[12px] mt-2" style={{ color: "#10B981" }}>
              ✓ Profile updated successfully
            </p>
          )}
        </div>
      </AnimatedSection>

      {/* Account Info */}
      <AnimatedSection delay={0.15}>
        <div className="rounded-2xl p-6 mb-6" style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-dim)",
        }}>
          <h3 className="text-[15px] font-semibold text-white mb-4 flex items-center gap-2">
            <Shield size={16} style={{ color: "var(--teal)" }} />
            Account Information
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                <Mail size={14} /> Email
              </span>
              <span className="text-[13px] font-medium text-white">{user.email || "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                <Shield size={14} /> Auth provider
              </span>
              <span className="text-[13px] font-medium text-white capitalize">{user.auth_provider || "email"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                <Calendar size={14} /> Member since
              </span>
              <span className="text-[13px] font-medium text-white">{memberSince}</span>
            </div>
          </div>
        </div>
      </AnimatedSection>

      {/* Plan */}
      <AnimatedSection delay={0.2}>
        <div className="rounded-2xl p-6 mb-6" style={{
          background: isPro ? "rgba(245,158,11,0.06)" : "var(--bg-elevated)",
          border: isPro ? "1px solid rgba(245,158,11,0.15)" : "1px solid var(--border-dim)",
        }}>
          <h3 className="text-[15px] font-semibold text-white mb-4 flex items-center gap-2">
            <Crown size={16} style={{ color: isPro ? "#F59E0B" : "var(--teal)" }} />
            Your Plan
          </h3>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[15px] font-semibold text-white">
                {isPro ? "Pro" : "Free"}
              </span>
              <p className="text-[13px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {isPro ? "All features unlocked" : "Upgrade for unlimited access"}
              </p>
            </div>
            {!isPro && (
              <Link
                href="/pricing"
                className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white inline-flex items-center transition-all"
                style={{
                  background: "linear-gradient(135deg, #F59E0B, #D97706)",
                  boxShadow: "0 2px 12px rgba(245,158,11,0.25)",
                }}
              >
                Upgrade to Pro
              </Link>
            )}
          </div>
        </div>
      </AnimatedSection>

      {/* Cards & Points Summary */}
      <AnimatedSection delay={0.25}>
        <div className="rounded-2xl p-6 mb-6" style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-dim)",
        }}>
          <h3 className="text-[15px] font-semibold text-white mb-4 flex items-center gap-2">
            <CreditCard size={16} style={{ color: "var(--teal)" }} />
            Wallet Summary
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl p-4" style={{ background: "rgba(13,148,136,0.06)", border: "1px solid rgba(13,148,136,0.12)" }}>
              <div className="text-[22px] font-bold text-white">{wallet.length}</div>
              <div className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Cards in wallet</div>
            </div>
            <div className="rounded-xl p-4" style={{ background: "rgba(13,148,136,0.06)", border: "1px solid rgba(13,148,136,0.12)" }}>
              <div className="text-[22px] font-bold text-white">{totalPoints.toLocaleString()}</div>
              <div className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Total points</div>
            </div>
          </div>
        </div>
      </AnimatedSection>

      {/* Actions */}
      <AnimatedSection delay={0.3}>
        <div className="space-y-3">
          {/* Sign Out */}
          <button
            onClick={async () => {
              await logout();
              router.push("/login");
            }}
            className="w-full flex items-center gap-3 px-5 py-3.5 rounded-xl text-[14px] font-medium transition-all"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-dim)",
              color: "var(--text-secondary)",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "rgba(255,255,255,0.06)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "var(--bg-elevated)";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            <LogOut size={16} />
            Sign Out
          </button>

          {/* Delete Account */}
          <button
            onClick={() => setDeleteModalOpen(true)}
            className="w-full flex items-center gap-3 px-5 py-3.5 rounded-xl text-[14px] font-medium transition-all"
            style={{
              background: "rgba(239,68,68,0.04)",
              border: "1px solid rgba(239,68,68,0.12)",
              color: "#f87171",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,0.08)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(239,68,68,0.04)"}
          >
            <Trash2 size={16} />
            Delete Account
          </button>
        </div>
      </AnimatedSection>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        >
          <div className="w-full max-w-[400px] rounded-2xl p-6" style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-dim)",
            boxShadow: "var(--shadow-float)",
          }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(239,68,68,0.12)", color: "#f87171" }}
              >
                <AlertTriangle size={20} />
              </div>
              <h3 className="text-[16px] font-semibold text-white">Delete Account</h3>
            </div>
            <p className="text-[13px] leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>
              This action is permanent and cannot be undone. All your data including cards, spend history, and settings will be deleted.
            </p>
            <p className="text-[13px] mb-3" style={{ color: "var(--text-secondary)" }}>
              Type <span className="font-mono font-semibold text-white">DELETE</span> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              className="w-full h-10 px-4 rounded-xl text-[14px] input-maple focus-ring mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteModalOpen(false); setDeleteConfirm(""); }}
                className="flex-1 h-10 rounded-xl text-[13px] font-medium transition-all"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid var(--border-dim)",
                  color: "var(--text-secondary)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== "DELETE"}
                className="flex-1 h-10 rounded-xl text-[13px] font-semibold text-white transition-all disabled:opacity-30"
                style={{
                  background: "#EF4444",
                }}
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
