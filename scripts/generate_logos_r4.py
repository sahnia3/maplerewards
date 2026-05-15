#!/usr/bin/env python3
"""Round 4 — completely new directions.

User feedback after round 3: previous designs are boring and mediocre. Wants
something completely new, completely modern, different. So this round
abandons flat-geometric vector territory and pushes into:

  - 3D dimensional / glass / liquid metal
  - Iridescent / chrome / oil-slick surfaces
  - Brutalist anti-design wordmarks
  - Custom currency symbol (a brand-new glyph)
  - Fluid / organic letterforms (Arc browser energy)
  - Gestural sigils (Read.cv / Cron / Pally)
  - Negative-space typographic cleverness (FedEx-style)
  - Holographic foil
  - Anagram ligatures (5 letters fused into 1 glyph)

10 fresh concepts. Reference set: Linear's 3D mark, Apple Card iridescent,
Read.cv sigil, Arc browser, Anthropic's serif A, Cron, Vetements brutalism.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

from google import genai
from google.genai import types

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
OUT_DIR = ROOT / "design" / "logo-explorations" / "2026-05-10-r4"
SECRET_FILE = Path.home() / ".claude" / "secrets" / "nanobanana.env"

MODEL_CANDIDATES = [
    "gemini-2.5-flash-image",
]

PALETTE_LINE = (
    "Brand palette: maple red #A51F2D, deep ink #1A1410, gold #B88E3C, "
    "cream paper #FBF7EE. Iridescent / metallic / chrome surfaces are "
    "allowed when the concept calls for them, but the dominant brand "
    "color must remain in the maple-red family."
)

SHARED_RULES = (
    "Square 1:1 aspect ratio, centered composition with generous margin. "
    "Modern fintech brand identity — confident, distinctive, absolutely "
    "NOT a generic AI-startup look. Reference the cutting edge: Linear's "
    "recent 3D mark, Apple Card iridescent metal, Vercel triangle, "
    "Read.cv gestural sigils, Arc browser fluid letters, Anthropic's "
    "refined serif A, Cron, Pally, Cursor's cut-out. AVOID: flat-vector "
    "cliche, calligraphic flourish, vintage postal stamp, magazine "
    "masthead, hand-drawn wax seal, the symmetric Air-Canada flag leaf, "
    "generic credit-card stack icons. Cream paper background #FBF7EE "
    "unless the concept explicitly calls for a different surface. Sharp "
    "confident execution. In this round materials, gradients, ambient "
    "occlusion, dimensional shading, iridescent oil-slick effects, "
    "subsurface scatter, and 3D rendering ARE explicitly permitted "
    "(and encouraged) where the concept calls for them. Do NOT include "
    "any words, letters, or numbers except where the concept names "
    "specific characters — render those characters with no spelling "
    "errors and no stray glyphs."
)

CONCEPTS = [
    {
        "id": "01-glass-bead",
        "title": "3D Glass Maple Bead",
        "prompt": (
            "A photorealistic glossy 3D glass bead — a slightly oblong "
            "ovoid sphere about the size of a marble — in deep maple-red "
            "#A51F2D, with realistic specular highlights and subsurface "
            "scattering (light passing through the glass). On the front "
            "face of the bead, a single subtle white leaf-vein line is "
            "etched into the surface, like a cut-glass detail. Soft "
            "ambient occlusion shadow beneath the bead on cream paper "
            "background #FBF7EE. Reference: Linear's recent 3D logo "
            "treatment, Apple's glass material, Cron's bead. Confident "
            "single object, no text, no border."
        ),
    },
    {
        "id": "02-iridescent-samara",
        "title": "Iridescent Chrome Samara",
        "prompt": (
            "A maple samara (winged seed pod, two mirrored teardrop "
            "wings joined at a small central pod) rendered in "
            "iridescent oil-slick CHROME — a metallic surface showing "
            "a smooth gradient from maple-red #A51F2D into deep purple, "
            "blue, and gold reflections, like Apple Card's titanium or "
            "a holographic foil. Sharp mirror-polish edges, subtle "
            "specular highlights. Cream paper background #FBF7EE. "
            "Premium fintech material exploration. No text, no border."
        ),
    },
    {
        "id": "03-currency-glyph",
        "title": "Custom Currency Symbol — New Glyph",
        "prompt": (
            "A brand-new custom typographic SYMBOL — like the bitcoin "
            "₿ or yen ¥ symbol, but invented for MapleRewards. The "
            "symbol is a single capital letter 'M' with two horizontal "
            "stroke-bars cutting through its vertical stems (analogous "
            "to the way ₿ is a B with two vertical lines, or ¥ is a Y "
            "with horizontal bars). The two horizontal bars suggest "
            "value / currency / exchange. Solid deep ink #1A1410 on "
            "cream paper #FBF7EE. Confident, geometric, looks like it "
            "could be a Unicode currency character. Only the symbol — "
            "no other letters."
        ),
    },
    {
        "id": "04-brutalist-maple",
        "title": "Brutalist MAPLE Wordmark",
        "prompt": (
            "The word 'MAPLE' set in all-uppercase Akzidenz Grotesk Bold "
            "or Helvetica Black — a raw, default, unstyled, system-font "
            "wordmark with no kerning adjustments, no decoration, no "
            "color besides black. Letters are tight together, almost "
            "touching. Deep ink #1A1410 on cream paper #FBF7EE. Confidence "
            "through complete absence of design — like Vetements, "
            "Balenciaga, or a 1970s Swiss railway sign. Anti-design "
            "fintech. The only text is the five uppercase letters "
            "M-A-P-L-E."
        ),
    },
    {
        "id": "05-liquid-mercury-m",
        "title": "Liquid Mercury Lowercase m",
        "prompt": (
            "A lowercase letter 'm' rendered as a 3D fluid blob of "
            "liquid mercury or chrome — fully reflective metallic "
            "surface with realistic environment reflections (showing "
            "subtle blue, red, and gold reflections of imagined "
            "surroundings). The letter form has soft fluid blob-like "
            "edges rather than typographic edges, as if mercury was "
            "poured into the shape of a lowercase m. Cream paper "
            "background #FBF7EE with soft ambient shadow beneath. "
            "Reference: Apple Pro Display chrome, vintage Macintosh "
            "Aqua, Y2K liquid metal. Only the letter m."
        ),
    },
    {
        "id": "06-arc-fluid-m",
        "title": "Arc-Browser-Style Fluid m",
        "prompt": (
            "A custom lowercase letter 'm' designed with fluid, rounded, "
            "organic curves rather than geometric typography — the "
            "strokes have varying weights and the bowls are soft "
            "blob-like curves, like the Arc browser logo or Pitch's "
            "wordmark. The letter feels friendly and contemporary. "
            "Single solid color: maple-red #A51F2D on cream paper "
            "#FBF7EE. Modern, friendly, fintech-but-warm. Only the "
            "letter m."
        ),
    },
    {
        "id": "07-two-stroke-sigil",
        "title": "Two-Stroke Gestural Sigil",
        "prompt": (
            "An abstract minimalist SIGIL composed of just two crossing "
            "brushstrokes — one solid thick maple-red #A51F2D stroke "
            "running diagonally upward (like a rising line), and one "
            "thinner ink #1A1410 stroke crossing it perpendicularly to "
            "form an X-like glyph that vaguely suggests both a leaf "
            "stem and a chart axis. Reference: Read.cv's pyramid mark, "
            "Cron's flame, Pally's mark — distinctive abstract "
            "two-element sigils. Cream paper background #FBF7EE. No "
            "text, no border, no extra elements."
        ),
    },
    {
        "id": "08-hidden-cut-m",
        "title": "M with Hidden Leaf-Cut (FedEx-Style)",
        "prompt": (
            "A bold uppercase letter 'M' set in a confident geometric "
            "sans-serif. The negative space between the M's two inner "
            "diagonals is shaped to form the unmistakable silhouette "
            "of a maple leaf — visible only on second look, like the "
            "famous FedEx hidden arrow. The M itself is solid deep ink "
            "#1A1410 on cream paper #FBF7EE; the hidden leaf negative "
            "space is the cream background. Clever, confident, fintech-"
            "smart. Only the letter M — the leaf is implied through "
            "negative space."
        ),
    },
    {
        "id": "09-holo-foil-disc",
        "title": "Holographic Foil Disc",
        "prompt": (
            "A perfectly circular metallic disc, the size of a coin, "
            "with a HOLOGRAPHIC FOIL surface — an iridescent gradient "
            "running across the disc cycling through maple-red #A51F2D, "
            "rose-gold, deep purple, and cream-gold reflections, like "
            "the foil on a premium credit card or NFC sticker. A subtle "
            "embossed leaf-vein line runs across the disc's surface. "
            "Soft ambient occlusion shadow under the disc. Cream paper "
            "background #FBF7EE. Premium card / loyalty / fintech "
            "material. No text, no border."
        ),
    },
    {
        "id": "10-anagram-ligature",
        "title": "Anagram Ligature — 5 Letters Fused",
        "prompt": (
            "A custom typographic LIGATURE glyph that fuses all five "
            "letters of 'maple' (m, a, p, l, e) into a single connected "
            "form — letterforms overlap, share strokes, and merge into "
            "one unified mark, but each letter is still subtly "
            "identifiable on close inspection. Lowercase, custom serif "
            "construction with refined high-contrast strokes. Reference: "
            "old monastic ligatures, Pinterest's stylized P, Cooper "
            "Hewitt ligature exercises. Color: solid deep ink #1A1410 "
            "with one stroke (suggest the 'l' or stem) accented in "
            "maple-red #A51F2D. Cream paper background #FBF7EE. The "
            "fused glyph is the ONLY thing in the image — no separate "
            "letters, no decoration, no border."
        ),
    },
]


def load_api_key() -> str:
    if not SECRET_FILE.exists():
        sys.exit(f"Missing secret file at {SECRET_FILE}")
    for line in SECRET_FILE.read_text().splitlines():
        if line.startswith("NANOBANANA_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("NANOBANANA_API_KEY not found in secret file")


def generate(client: genai.Client, prompt: str, retries: int = 4) -> tuple[bytes | None, str]:
    full_prompt = f"{prompt}\n\n{SHARED_RULES}\n\n{PALETTE_LINE}"
    cfg = types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"])
    last_err = ""
    for attempt in range(retries):
        for model in MODEL_CANDIDATES:
            try:
                response = client.models.generate_content(
                    model=model, contents=full_prompt, config=cfg
                )
                if not response.candidates:
                    last_err = f"{model}: no candidates"
                    continue
                cand = response.candidates[0]
                if not cand.content or not cand.content.parts:
                    last_err = f"{model}: empty content"
                    continue
                for part in cand.content.parts:
                    inline = getattr(part, "inline_data", None)
                    if inline is not None and getattr(inline, "data", None):
                        return inline.data, f"{model}"
                last_err = f"{model}: no image part"
            except Exception as e:
                msg = str(e)
                last_err = f"{model}: {type(e).__name__}: {msg[:120]}"
                if "503" in msg or "UNAVAILABLE" in msg or "429" in msg:
                    wait = 2 ** attempt
                    print(f"     (retry {attempt+1}/{retries} after {wait}s — {last_err[:80]})")
                    time.sleep(wait)
                    continue
        else:
            continue
        # if we got here without returning, treat as a soft failure and retry
        time.sleep(2 ** attempt)
    return None, last_err


def write_prompts_md(out_dir: Path):
    parts = ["# MapleRewards Logo Prompts — 2026-05-10 — Round 4 (Net-New)\n\n"]
    parts.append(f"**Shared rules:**\n\n```\n{SHARED_RULES}\n\n{PALETTE_LINE}\n```\n\n")
    for c in CONCEPTS:
        parts.append(f"## {c['id']} — {c['title']}\n\n**File:** `{c['id']}.png`\n\n```\n{c['prompt']}\n```\n\n")
    (out_dir / "prompts.md").write_text("".join(parts))


def write_index_html(out_dir: Path, results: list[dict]):
    cards = []
    for r in results:
        ok = r["ok"]
        badge = "&#10003;" if ok else "&#10007; failed"
        klass = "ok" if ok else "fail"
        body = f'<img src="{r["file"]}" alt="{r["title"]}" />' if ok else '<div class="placeholder">no image</div>'
        cards.append(f'''
        <figure class="card">
          <div class="img-wrap">{body}</div>
          <figcaption>
            <div class="title">{r['title']}</div>
            <div class="meta"><span class="status {klass}">{badge}</span> &middot; <code>{r['id']}</code></div>
          </figcaption>
        </figure>''')
    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>MapleRewards Logo Explorations — Round 4 — 2026-05-10</title>
<style>
  :root {{
    --cream: #FBF7EE; --ink: #1A1410; --ink-muted: #6f6358;
    --maple: #A51F2D; --gold: #B88E3C;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; padding: 56px 48px; background: var(--cream); color: var(--ink);
    font-family: "Iowan Old Style", "Palatino Linotype", Georgia, ui-serif, serif;
    -webkit-font-smoothing: antialiased;
  }}
  header {{ max-width: 1320px; margin: 0 auto 48px; }}
  h1 {{ font-size: 44px; font-weight: 400; margin: 0 0 8px;
        letter-spacing: -0.01em; line-height: 1; }}
  h1 em {{ font-style: italic; }}
  h1 .mono {{ font-family: "JetBrains Mono", ui-monospace, monospace;
              font-size: 14px; letter-spacing: 0.18em; font-style: normal;
              vertical-align: middle; color: var(--ink-muted); margin-left: 6px; }}
  .sub {{ font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
          color: var(--ink-muted); margin-top: 12px; }}
  .nav {{ font-family: "JetBrains Mono", monospace; font-size: 10px;
          letter-spacing: 0.18em; text-transform: uppercase;
          color: var(--ink-muted); margin-top: 8px; }}
  .nav a {{ color: var(--ink); text-decoration: underline;
            text-underline-offset: 4px; margin-right: 18px; }}
  .grid {{ max-width: 1320px; margin: 0 auto;
           display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
           gap: 28px; }}
  .card {{ margin: 0; background: #fff; border: 1px solid rgba(26,20,16,0.1);
            border-radius: 4px; overflow: hidden;
            box-shadow: 0 1px 0 rgba(26,20,16,0.04); }}
  .img-wrap {{ aspect-ratio: 1/1; background: var(--cream);
                display: flex; align-items: center; justify-content: center;
                border-bottom: 1px solid rgba(26,20,16,0.08); padding: 12px; }}
  .img-wrap img {{ max-width: 100%; max-height: 100%; display: block; }}
  .placeholder {{ font-family: "JetBrains Mono", monospace; font-size: 11px;
                   text-transform: uppercase; letter-spacing: 0.18em;
                   color: var(--maple); }}
  figcaption {{ padding: 16px 18px; }}
  .title {{ font-style: italic; font-size: 19px; line-height: 1.3;
            margin-bottom: 6px; }}
  .meta {{ font-family: "JetBrains Mono", ui-monospace, monospace;
            font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase;
            color: var(--ink-muted); }}
  .status.ok {{ color: var(--ink); font-weight: 600; }}
  .status.fail {{ color: var(--maple); font-weight: 600; }}
  code {{ font-size: 10px; }}
</style>
</head>
<body>
<header>
  <h1><em>maple</em><span class="mono">REWARDS</span> &middot; round 4 — net-new</h1>
  <div class="sub">10 fresh directions &middot; 3D, iridescent, brutalist, fluid, custom glyphs</div>
  <div class="nav">
    <a href="../2026-05-10/index.html">&larr; r1</a>
    <a href="../2026-05-10-r2/index.html">&larr; r2</a>
    <a href="../2026-05-10-r3/index.html">&larr; r3</a>
  </div>
</header>
<div class="grid">{''.join(cards)}</div>
</body>
</html>"""
    (out_dir / "index.html").write_text(html)


def main():
    api_key = load_api_key()
    client = genai.Client(api_key=api_key)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Round 4 — generating {len(CONCEPTS)} logos -> {OUT_DIR}\n")
    results = []
    for c in CONCEPTS:
        print(f"  -> {c['id']}: {c['title']}")
        png, info = generate(client, c["prompt"])
        out_file = f"{c['id']}.png"
        rec = {"id": c["id"], "title": c["title"], "file": out_file, "ok": False, "info": info}
        if png is not None:
            (OUT_DIR / out_file).write_bytes(png)
            rec["ok"] = True
            print(f"     ok ({info}) -> {out_file}")
        else:
            print(f"     FAIL: {info}")
        results.append(rec)
        time.sleep(0.4)

    write_prompts_md(OUT_DIR)
    write_index_html(OUT_DIR, results)

    ok_count = sum(1 for r in results if r["ok"])
    print(f"\nDone. {ok_count}/{len(CONCEPTS)} succeeded.")
    print(f"Open: {OUT_DIR / 'index.html'}")


if __name__ == "__main__":
    main()
