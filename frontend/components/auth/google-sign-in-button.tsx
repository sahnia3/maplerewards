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

  // Not configured (NEXT_PUBLIC_GOOGLE_CLIENT_ID unset) — render nothing.
  // A "NOT CONFIGURED" button is a dev-environment artifact users must never see.
  if (!CLIENT_ID) {
    return null;
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
        // GIS renders an "outline" (light) button — keep the container's
        // color-scheme light so it doesn't paint a dark box in the cream card.
        colorScheme: "light",
      }}
    />
  );
}
