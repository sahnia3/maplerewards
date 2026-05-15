#!/usr/bin/env python3
"""Round 2 — fintech-leaning logo concepts via Gemini 2.5 Flash Image.

User feedback after round 1: liked the IDEA of geometric MR monogram (#02) and
lowercase m + leaf curve (#09), but said execution was lackluster and didn't
feel fintech enough. Round 2 pushes hard into Stripe / Mercury / Brex / Linear
territory — confident, geometric, mathematical, with full creative liberty.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

from google import genai
from google.genai import types

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
OUT_DIR = ROOT / "design" / "logo-explorations" / "2026-05-10-r2"
SECRET_FILE = Path.home() / ".claude" / "secrets" / "nanobanana.env"

MODEL_CANDIDATES = [
    "gemini-2.5-flash-image",
    "gemini-2.5-flash-image-preview",
]

PALETTE_LINE = (
    "Brand palette (use only these): maple red #A51F2D, deep ink #1A1410, "
    "gold #B88E3C, cream paper #FBF7EE. No other colors."
)

SHARED_RULES = (
    "Square 1:1 aspect ratio. Modern fintech logo design — confident, "
    "geometric, mathematical. Reference aesthetics: Stripe, Mercury, Brex, "
    "Ramp, Linear, Wise, Plaid, Vercel. NOT illustrated, NOT cartoon, NOT "
    "vintage stamp, NOT calligraphic, NOT magazine masthead, NOT wax-seal, "
    "NOT hand-drawn. Clean monochrome or limited two-color palette. Cream "
    "paper background #FBF7EE — NEVER a red, dark, or photographic "
    "background. Centered composition with generous margin around the mark. "
    "Sharp crisp execution, no soft shadows, no atmospheric blur, no "
    "gradients beyond a single duotone. Do NOT include any words, letters, "
    "or numbers anywhere in the image except where the concept explicitly "
    "names specific characters — and when characters appear, render them "
    "with no spelling errors, no extra letters, no random typography "
    "artifacts."
)

CONCEPTS = [
    {
        "id": "01-mr-bauhaus",
        "title": "MR — Bauhaus Geometric Construction",
        "prompt": (
            "Custom monogram of the capital letters M and R, constructed "
            "entirely from primitive geometric shapes: perfect circles, "
            "squares, and 45-degree triangles. Mathematical precision, like "
            "a typographic exercise from the HfG Ulm school or Bauhaus "
            "Dessau. Letters share construction grids — the M's diagonals "
            "and the R's bowl derived from the same circle radii. Single "
            "solid color, deep ink #1A1410 on cream paper #FBF7EE. Strokes "
            "of even consistent weight. No flourishes, no decoration, no "
            "leaf, no border. Austere, confident, modernist."
        ),
    },
    {
        "id": "02-mr-stencil",
        "title": "MR — Modernist Stencil",
        "prompt": (
            "Custom monogram of capital M and R cut from a stencil, with "
            "tiny gaps where strokes would meet — like a Le Corbusier "
            "architectural stencil or a Söhne typeface stencil cut. Bold "
            "even strokes, geometric sans-serif, no calligraphic variation. "
            "Tight letter spacing — the M and R almost touch but don't. "
            "Color: maple-red #A51F2D on cream paper #FBF7EE. No leaf, no "
            "border, no decoration."
        ),
    },
    {
        "id": "03-mr-ligature",
        "title": "MR — Diagonal Slash Ligature",
        "prompt": (
            "Custom monogram where the capital M and R are fused via a "
            "single bold diagonal stroke that serves simultaneously as the "
            "M's right diagonal and the R's leg — a single-glyph ligature, "
            "the letters cannot be separated. Construction is mathematical "
            "and confident. Solid maple-red #A51F2D fill on cream paper "
            "#FBF7EE background. Sans-serif, geometric, no flourishes, no "
            "leaf, no border."
        ),
    },
    {
        "id": "04-m-mercury",
        "title": "m — Pure-Type Wordmark, Mercury-Style",
        "prompt": (
            "A single oversized lowercase letter 'm' set in a confident "
            "modern custom-cut display sans-serif inspired by Söhne or "
            "Inter Display. Tight, slightly condensed letterform with sharp "
            "ink traps where strokes meet. No serifs, no leaf, no "
            "decoration — just the letter, centered, large. Color: deep "
            "ink #1A1410 on cream paper #FBF7EE. Reference aesthetic: "
            "Mercury Bank wordmark, Linear, Stripe. Confidence through "
            "restraint. Only the lowercase letter m — no other letters, "
            "no marks."
        ),
    },
    {
        "id": "05-m-counter-leaf",
        "title": "m — Counter-Hidden Leaf",
        "prompt": (
            "A single lowercase letter 'm' set in a clean geometric "
            "sans-serif (Inter Display feel), even stroke weight. Inside "
            "one of the m's counters (the enclosed negative space within "
            "an arch), a tiny solid maple-red #A51F2D leaf shape is "
            "tucked — only visible on close inspection. The base letter is "
            "deep ink #1A1410. Cream paper background #FBF7EE. Subtle, "
            "surprising, fintech-clean. Only the lowercase letter m and "
            "the hidden leaf — nothing else."
        ),
    },
    {
        "id": "06-pixel-leaf",
        "title": "Pixel-Grid Leaf",
        "prompt": (
            "A maple leaf rendered as a 7-by-7 pixel grid — each pixel a "
            "small square that is either solid maple-red #A51F2D or empty "
            "cream #FBF7EE — together forming a recognizable leaf "
            "silhouette in a deliberately digital, low-resolution, "
            "pixel-art style. Hard pixel edges, no anti-aliasing, no "
            "softening. References digital-first brand identities. Cream "
            "paper background. No text, no border, no extra decoration."
        ),
    },
    {
        "id": "07-barchart-leaf",
        "title": "Bar-Chart Leaf",
        "prompt": (
            "A geometric maple leaf where the lower half is replaced with "
            "five vertical bars of increasing height rising upward, like a "
            "rising bar chart growing into a leaf shape. The leaf's upper "
            "lobes are simplified geometric points; the rising bars below "
            "are evenly-spaced rectangles in maple-red #A51F2D matching "
            "the leaf above. Cream paper background #FBF7EE. The mark "
            "communicates compounding rewards visually. Clean fintech "
            "geometric. No text, no border."
        ),
    },
    {
        "id": "08-folded-origami",
        "title": "Folded Origami Leaf",
        "prompt": (
            "A maple leaf rendered as a single piece of folded paper, "
            "origami-style — reduced to just three or four flat angular "
            "panels of solid maple-red #A51F2D, with crisp hairline ink "
            "#1A1410 edges marking each fold. The whole shape reads as one "
            "confident geometric block, not an illustrated leaf. Reference "
            "aesthetic: Linear, Brex, Vercel single-shape marks. Cream "
            "paper background #FBF7EE. No text, no extra decoration."
        ),
    },
    {
        "id": "09-aperture-mark",
        "title": "Aperture Mark — Abstract Five-Point",
        "prompt": (
            "An abstract geometric logo mark composed of five identical "
            "sharp triangular shapes radiating outward from a single "
            "central point — like a camera aperture or a financial-chart "
            "spike. The arrangement vaguely suggests a maple leaf without "
            "literally depicting one. All five triangles in solid "
            "maple-red #A51F2D on cream paper #FBF7EE. Minimalist, "
            "geometric, fintech-confident. Reference: Brex diamond, Plaid "
            "mark. No text, no border, no decoration."
        ),
    },
    {
        "id": "10-maple-wordmark",
        "title": "'maple.' — Pure Wordmark with Red Dot",
        "prompt": (
            "A wordmark logo: the word 'maple' set in lowercase in a "
            "confident custom-cut display serif (Instrument Serif lineage, "
            "but tighter and more modern). Letter spacing tight. "
            "Immediately after the final letter 'e' there is a small "
            "solid maple-red #A51F2D circular dot, like a confident "
            "punctuating period. The word itself is in deep ink #1A1410 "
            "on cream paper #FBF7EE. Premium, restrained, fintech-"
            "editorial. The only text in the image is the word 'maple' "
            "spelled exactly that way (M-A-P-L-E in lowercase), followed "
            "by the red dot. No other letters, no taglines, no marks."
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


def generate(client: genai.Client, prompt: str) -> tuple[bytes | None, str]:
    full_prompt = f"{prompt}\n\n{SHARED_RULES}\n\n{PALETTE_LINE}"
    config_with = types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"])
    last_err = ""
    for model in MODEL_CANDIDATES:
        for cfg in (config_with, None):
            try:
                kwargs = {"model": model, "contents": full_prompt}
                if cfg is not None:
                    kwargs["config"] = cfg
                response = client.models.generate_content(**kwargs)
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
                        return inline.data, f"{model}{' +cfg' if cfg else ''}"
                last_err = f"{model}{' +cfg' if cfg else ''}: no image part"
            except Exception as e:
                last_err = f"{model}{' +cfg' if cfg else ''}: {type(e).__name__}: {e}"
                continue
    return None, last_err


def write_prompts_md(out_dir: Path):
    parts = ["# MapleRewards Logo Prompts — 2026-05-10 — Round 2 (Fintech)\n\n"]
    parts.append(f"**Shared rules appended to every prompt:**\n\n```\n{SHARED_RULES}\n\n{PALETTE_LINE}\n```\n\n")
    for c in CONCEPTS:
        parts.append(f"## {c['id']} — {c['title']}\n\n")
        parts.append(f"**File:** `{c['id']}.png`\n\n")
        parts.append(f"**Prompt:**\n\n```\n{c['prompt']}\n```\n\n")
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
<title>MapleRewards Logo Explorations — Round 2 — 2026-05-10</title>
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
  .grid {{
    max-width: 1320px; margin: 0 auto;
    display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 28px;
  }}
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
  .nav {{ font-family: "JetBrains Mono", monospace; font-size: 10px;
          letter-spacing: 0.18em; text-transform: uppercase;
          color: var(--ink-muted); margin-top: 8px; }}
  .nav a {{ color: var(--ink); text-decoration: underline;
            text-underline-offset: 4px; }}
</style>
</head>
<body>
<header>
  <h1><em>maple</em><span class="mono">REWARDS</span> &middot; round 2 — fintech</h1>
  <div class="sub">10 reimagined directions &middot; gemini 2.5 flash image &middot; 2026-05-10</div>
  <div class="nav"><a href="../2026-05-10/index.html">&larr; back to round 1</a></div>
</header>
<div class="grid">{''.join(cards)}</div>
</body>
</html>"""
    (out_dir / "index.html").write_text(html)


def main():
    api_key = load_api_key()
    client = genai.Client(api_key=api_key)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Round 2 — generating {len(CONCEPTS)} logos -> {OUT_DIR}\n")
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
