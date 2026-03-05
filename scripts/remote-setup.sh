#!/usr/bin/env bash
# MapleRewards Remote Access Setup
# Gives you a browser-based terminal accessible from any device on your Tailscale network.
# Run once on your Mac: bash scripts/remote-setup.sh

set -e

TTYD_PORT=7681
CLAUDE_PORT=7682

echo "=== MapleRewards Remote Access Setup ==="
echo ""

# ── 1. Check Homebrew ─────────────────────────────────────────────────────────
if ! command -v brew &>/dev/null; then
  echo "❌ Homebrew not found. Install it first: https://brew.sh"
  exit 1
fi
echo "✓ Homebrew found"

# ── 2. Install ttyd (web terminal) ───────────────────────────────────────────
if ! command -v ttyd &>/dev/null; then
  echo "→ Installing ttyd..."
  brew install ttyd
else
  echo "✓ ttyd already installed"
fi

# ── 3. Install Tailscale ─────────────────────────────────────────────────────
if ! command -v tailscale &>/dev/null; then
  echo "→ Installing Tailscale..."
  brew install tailscale
  echo ""
  echo "  ▸ After install, run: sudo tailscaled &"
  echo "  ▸ Then:              tailscale up"
  echo "  ▸ Or install the Tailscale Mac App for easier management:"
  echo "    https://tailscale.com/download/mac"
  echo ""
else
  echo "✓ Tailscale already installed"
fi

# ── 4. Enable SSH on Mac ─────────────────────────────────────────────────────
echo ""
echo "=== SSH Remote Login ==="
echo "Enable it in: System Settings → General → Sharing → Remote Login"
echo "(Needed if you want to SSH in directly instead of using the web terminal)"
echo ""

# ── 5. Print Tailscale IP ────────────────────────────────────────────────────
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "not-connected")
if [ "$TAILSCALE_IP" != "not-connected" ]; then
  echo "✓ Tailscale IP: $TAILSCALE_IP"
  echo ""
  echo "=== Access URLs (once you run 'make remote-start') ==="
  echo "  General terminal : http://$TAILSCALE_IP:$TTYD_PORT"
  echo "  Claude Code      : http://$TAILSCALE_IP:$CLAUDE_PORT"
else
  echo "⚠  Tailscale not connected yet. Run 'tailscale up' and sign in."
  echo "   After connecting, your URLs will be:"
  echo "  General terminal : http://<tailscale-ip>:$TTYD_PORT"
  echo "  Claude Code      : http://<tailscale-ip>:$CLAUDE_PORT"
fi

echo ""
echo "=== Next Steps ==="
echo "1. On your phone, install the Tailscale app (iOS/Android) and sign in with the same account"
echo "2. On your Mac, run: make remote-start"
echo "3. Open the URL above in your phone's browser"
echo "4. You'll get a full terminal — run 'claude' to start Claude Code"
echo ""
echo "✓ Setup complete."
