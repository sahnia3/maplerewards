export interface CardTheme {
  gradient: string;
  textColor: string;
  accentColor: string;
  chipColor: string;
}

const ISSUER_THEMES: Record<string, CardTheme> = {
  td: {
    gradient: "linear-gradient(135deg, #007A3D 0%, #004D25 60%, #003018 100%)",
    textColor: "#ffffff",
    accentColor: "rgba(255,255,255,0.85)",
    chipColor: "rgba(255,255,255,0.25)",
  },
  rbc: {
    gradient: "linear-gradient(135deg, #003168 0%, #001A3A 60%, #000D20 100%)",
    textColor: "#ffffff",
    accentColor: "rgba(255,255,255,0.85)",
    chipColor: "rgba(255,255,255,0.25)",
  },
  scotiabank: {
    gradient: "linear-gradient(135deg, #C8102E 0%, #8B0020 60%, #5C0015 100%)",
    textColor: "#ffffff",
    accentColor: "rgba(255,255,255,0.85)",
    chipColor: "rgba(255,255,255,0.25)",
  },
  cibc: {
    gradient: "linear-gradient(135deg, #C41230 0%, #8B2500 60%, #5C1800 100%)",
    textColor: "#ffffff",
    accentColor: "rgba(255,255,255,0.85)",
    chipColor: "rgba(255,255,255,0.25)",
  },
  bmo: {
    gradient: "linear-gradient(135deg, #0075BE 0%, #004A7C 60%, #002A4A 100%)",
    textColor: "#ffffff",
    accentColor: "rgba(255,255,255,0.85)",
    chipColor: "rgba(255,255,255,0.25)",
  },
  amex: {
    gradient: "linear-gradient(135deg, #B8860B 0%, #6B4F00 60%, #3D2D00 100%)",
    textColor: "#ffffff",
    accentColor: "rgba(255,255,255,0.85)",
    chipColor: "rgba(255,218,100,0.4)",
  },
  "american express": {
    gradient: "linear-gradient(135deg, #B8860B 0%, #6B4F00 60%, #3D2D00 100%)",
    textColor: "#ffffff",
    accentColor: "rgba(255,255,255,0.85)",
    chipColor: "rgba(255,218,100,0.4)",
  },
  default: {
    gradient: "linear-gradient(135deg, #1A1D2E 0%, #0D0F18 60%, #080910 100%)",
    textColor: "#ffffff",
    accentColor: "rgba(255,255,255,0.7)",
    chipColor: "rgba(255,255,255,0.2)",
  },
};

export function getCardTheme(issuer?: string): CardTheme {
  if (!issuer) return ISSUER_THEMES.default;
  const key = issuer.toLowerCase();
  for (const [k, v] of Object.entries(ISSUER_THEMES)) {
    if (key.includes(k)) return v;
  }
  return ISSUER_THEMES.default;
}

export function getNetworkLabel(network?: string): string {
  if (!network) return "";
  switch (network.toLowerCase()) {
    case "visa": return "VISA";
    case "mastercard": return "MC";
    case "amex": return "AMEX";
    default: return network.toUpperCase();
  }
}
