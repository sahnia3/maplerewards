"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { getSessionId } from "@/lib/api";
import { Loader2 } from "lucide-react";

interface GoogleSignInButtonProps {
  onSuccess: () => void;
  onError: (msg: string) => void;
  disabled?: boolean;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: string;
              theme?: string;
              size?: string;
              text?: string;
              shape?: string;
              width?: number | string;
            }
          ) => void;
          prompt: () => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export function GoogleSignInButton({ onSuccess, onError, disabled }: GoogleSignInButtonProps) {
  const { googleLogin } = useAuth();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const initialized = useRef(false);

  // Load GIS script
  useEffect(() => {
    if (!CLIENT_ID) return;
    if (document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) {
      setScriptLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => onError("Failed to load Google Sign-In");
    document.head.appendChild(script);
  }, [onError]);

  // Initialize and render button
  useEffect(() => {
    if (!scriptLoaded || !CLIENT_ID || !buttonRef.current || initialized.current) return;
    if (!window.google?.accounts?.id) return;

    initialized.current = true;

    window.google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: async (response) => {
        setLoading(true);
        try {
          const sessionId = getSessionId() || undefined;
          await googleLogin(response.credential, sessionId);
          onSuccess();
        } catch (err) {
          onError(err instanceof Error ? err.message : "Google sign-in failed");
        } finally {
          setLoading(false);
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    window.google.accounts.id.renderButton(buttonRef.current, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      width: buttonRef.current.offsetWidth || 368,
    });
  }, [scriptLoaded, googleLogin, onSuccess, onError]);

  // Not configured — show a clear disabled button
  if (!CLIENT_ID) {
    return (
      <button
        disabled
        type="button"
        style={{
          width: "100%",
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: "0 16px",
          borderRadius: 10,
          background: "var(--surface)",
          border: "1px solid var(--rule)",
          color: "var(--ink-3)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          cursor: "not-allowed",
        }}
        title="Set NEXT_PUBLIC_GOOGLE_CLIENT_ID in .env.local to enable Google Sign-In"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Continue with Google
        <span style={{ marginLeft: "auto", fontSize: 9, opacity: 0.6 }}>NOT CONFIGURED</span>
      </button>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          width: "100%",
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          borderRadius: 10,
          background: "var(--surface)",
          border: "1px solid var(--rule)",
          color: "var(--ink-3)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        <Loader2 size={16} className="animate-spin" />
        <span>Signing in…</span>
      </div>
    );
  }

  return (
    <div
      ref={buttonRef}
      className="w-full overflow-hidden rounded-xl"
      style={{
        // Force the GIS button to match our styling
        filter: disabled ? "opacity(0.4) grayscale(0.3)" : undefined,
        pointerEvents: disabled ? "none" : undefined,
        minHeight: "44px",
        // The GIS button renders inside here
        colorScheme: "dark",
      }}
    />
  );
}
