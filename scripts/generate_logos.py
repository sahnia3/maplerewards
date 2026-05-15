#!/usr/bin/env python3
"""Generate MapleRewards logo mockups via Gemini 2.5 Flash Image (Nanobanana).

Throwaway: run once, review outputs in design/logo-explorations/2026-05-10/.
"""

from __future__ import annotations

import sys
import time
from io import BytesIO
from pathlib import Path

from google import genai
from google.genai import types

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
OUT_DIR = ROOT / "design" / "logo-explorations" / "2026-05-10"
SECRET_FILE = Path.home() / ".claude" / "secrets" / "nanobanana.env"

MODEL_CANDIDATES = [
    "gemini-2.5-flash-image",
    "gemini-2.5-flash-image-preview",
]

PALETTE_LINE = (
    "Brand palette: maple red #A51F2D, forest green #183A37, gold #B88E3C, "
    "cream paper #FBF7EE, ink #1A1410, bonus lime #B9C46A."
)

SHARED_RULES = (
    "Square 1:1 aspect ratio. Flat vector logo style — no photographic detail, "
    "no realistic shadows, no gradients beyond a single duotone. Cream paper "
    "background #FBF7EE, never a red background. Centered composition with "
    "generous margin. Editorial magazine sensibility — premium fintech, "
    "Saturday Night magazine aesthetic, NOT corporate startup, NOT playful "
    "cartoon, NOT generic tech. Do NOT include any words, letters, or numbers "
    "in the image except where the concept explicitly requires specific "
    "lettering — and when it does, render those letters cleanly with no "
    "spelling errors and no extra text."
)

CONCEPTS = [
    {
        "id": "01-mr-monogram-editorial",
        "title": "MR Monogram — Editorial Serif",
        "prompt": (
            "Custom monogram logo: the capital letters M and R interlocked, "
            "drawn in a refined display serif inspired by Instrument Serif and "
            "the Penguin Classics imprint mark. The R's leg curls into a "
            "subtle maple-leaf-tip flourish at its end — restrained, not "
            "literal. Letters in deep gold #B88E3C with a maple-red #A51F2D "
            "accent on the leaf-tip flourish only. No outer shape, no border. "
            "Negative space is the cream background. The mark feels engraved, "
            "like a private library bookplate. Only the letters M and R "
            "appear — no other letters, no taglines, no decorative type."
        ),
    },
    {
        "id": "02-mr-monogram-geometric",
        "title": "MR Monogram — Geometric Modern",
        "prompt": (
            "Geometric architectural monogram: the capital letters M and R "
            "constructed from straight lines and clean right-angles, no "
            "calligraphic flourishes, evenly thick strokes — think the Chanel "
            "interlocked C's reinterpreted in maple-red. The negative space "
            "between the two letters faintly suggests the silhouette of a "
            "maple leaf — subtle, only visible on a second look. Letters in "
            "maple-red #A51F2D, set on cream #FBF7EE. No outer ring, no extra "
            "decoration. Only the letters M and R."
        ),
    },
    {
        "id": "03-leaf-monoline",
        "title": "Abstract Maple Leaf — Monoline",
        "prompt": (
            "Abstract maple leaf logo drawn as a single continuous monoline "
            "stroke — one unbroken hairline path, not closed, not filled. The "
            "leaf is asymmetric and rotated slightly off-axis (about 12 "
            "degrees clockwise) so it reads hand-drawn rather than the "
            "perfectly symmetric Canadian flag leaf. Five points, not eleven. "
            "Stroke color maple-red #A51F2D, weight roughly 3% of the canvas. "
            "Cream background #FBF7EE. Pure mark — no text, no border, no "
            "compass, no scaffolding."
        ),
    },
    {
        "id": "04-leaf-faceted",
        "title": "Abstract Maple Leaf — Faceted Geometric",
        "prompt": (
            "Abstract maple leaf logo built from six flat geometric facets, "
            "like a low-poly origami leaf. Two-tone duotone — alternating "
            "facets in maple-red #A51F2D and gold #B88E3C, with crisp hairline "
            "ink #1A1410 separating each facet. Mid-century modern editorial "
            "feel, like a Saul Bass mark. Five-pointed leaf silhouette, "
            "centered on cream paper background #FBF7EE. No text, no border, "
            "no realistic detail."
        ),
    },
    {
        "id": "05-modernized-sigil",
        "title": "Modernized Sigil / Crest",
        "prompt": (
            "Modernized seal / crest logo: a single thin gold #B88E3C "
            "circular ring — clean, no compass ticks, no concentric layers — "
            "enclosing a simplified abstract maple leaf glyph in maple-red "
            "#A51F2D. The leaf inside is reductive and geometric, five points, "
            "filled solid. Feels like a private bank crest or a Hermès stamp, "
            "not a wax seal. Cream paper background #FBF7EE. No text inside "
            "the ring, no text outside, no scaffolding."
        ),
    },
    {
        "id": "06-sovereign-coin",
        "title": "Sovereign Coin Medallion",
        "prompt": (
            "A small metallic coin shown at a slight three-quarter angle so "
            "the rim catches light — embossed on its face is a stylized maple "
            "leaf in low relief. Around the coin's outer rim, the letters "
            "'M' and 'R' are engraved in a tight uppercase mono typeface, "
            "with a small dot separating them. Coin in deep gold #B88E3C with "
            "maple-red #A51F2D ink in the recessed leaf and engraved letters. "
            "Cream paper background #FBF7EE. Only the letters M and R appear "
            "as engraving — no other text, no wordmark."
        ),
    },
    {
        "id": "07-compass-leaf",
        "title": "Compass-Leaf Hybrid",
        "prompt": (
            "A minimalist compass-rose where the four cardinal points (N, E, "
            "S, W) are stylized as the tips of a single maple leaf — meaning "
            "the leaf IS the compass, the points of the leaf radiate outward "
            "as compass arrows. Hairline gold #B88E3C scaffolding for the "
            "compass strokes, maple-red #A51F2D fill in the central leaf "
            "body. Cream paper background #FBF7EE. No text, no degree marks, "
            "no outer ring."
        ),
    },
    {
        "id": "08-negative-space-m",
        "title": "Negative-Space M-in-Leaf",
        "prompt": (
            "A solid filled maple leaf silhouette in maple-red #A51F2D — five "
            "points, reductive geometric shape (not the realistic Canadian "
            "flag leaf). A clean uppercase letter 'M' in a custom geometric "
            "sans is cut out of the center of the leaf as negative space, "
            "revealing the cream paper background #FBF7EE through the M. The "
            "leaf becomes a container; the M is the brand. Only the letter M "
            "appears — no other letters, no taglines."
        ),
    },
    {
        "id": "09-lowercase-m-leaf",
        "title": "Lowercase 'm' with Leaf Curve",
        "prompt": (
            "A single letter mark: a stylized lowercase 'm' rendered in a "
            "custom display serif (Instrument Serif feel). One of the m's "
            "humps curls outward into a thin leaf-vein flourish, suggesting "
            "a maple leaf without literal depiction. Letter in ink #1A1410 "
            "with the leaf-vein curl picked out in maple-red #A51F2D. Cream "
            "paper background #FBF7EE. Only the lowercase letter m appears — "
            "no other letters, no border, no decoration."
        ),
    },
    {
        "id": "10-postal-stamp",
        "title": "Postal Stamp Roundel",
        "prompt": (
            "A round postmark / cancellation stamp logo: outer hairline circle "
            "in ink #1A1410, with the words 'MAPLE · REWARDS' set in tight "
            "uppercase JetBrains Mono letter-spaced text following the arc of "
            "the inside of the circle (top half). At the center of the stamp, "
            "a small solid maple leaf in maple-red #A51F2D. Heritage Canadian "
            "shipping-stamp aesthetic, vintage editorial postmark, slightly "
            "weathered ink texture. Cream paper background #FBF7EE. The only "
            "text is 'MAPLE · REWARDS' arranged in the arc."
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
    parts = ["# MapleRewards Logo Prompts — 2026-05-10\n\n"]
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
        cards.append(f'''
        <figure class="card">
          <div class="img-wrap">{f'<img src="{r["file"]}" alt="{r["title"]}" />' if ok else '<div class="placeholder">no image</div>'}</div>
          <figcaption>
            <div class="title">{r['title']}</div>
            <div class="meta"><span class="status {klass}">{badge}</span> · <code>{r['id']}</code></div>
          </figcaption>
        </figure>''')
    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>MapleRewards Logo Explorations — 2026-05-10</title>
<style>
  :root {{
    --cream: #FBF7EE; --ink: #1A1410; --ink-muted: #6f6358;
    --maple: #A51F2D; --gold: #B88E3C; --forest: #183A37;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; padding: 56px 48px; background: var(--cream); color: var(--ink);
    font-family: "Iowan Old Style", "Palatino Linotype", Georgia, ui-serif, serif;
    -webkit-font-smoothing: antialiased;
  }}
  header {{ max-width: 1320px; margin: 0 auto 48px; }}
  h1 {{ font-size: 44px; font-weight: 400; margin: 0 0 8px; letter-spacing: -0.01em; line-height: 1; }}
  h1 em {{ font-style: italic; }}
  h1 .mono {{ font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 14px;
              letter-spacing: 0.18em; font-style: normal; vertical-align: middle;
              color: var(--ink-muted); margin-left: 6px; }}
  .sub {{ font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 11px;
          letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-muted); margin-top: 12px; }}
  .grid {{
    max-width: 1320px; margin: 0 auto;
    display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 28px;
  }}
  .card {{ margin: 0; background: #fff; border: 1px solid rgba(26,20,16,0.1);
            border-radius: 4px; overflow: hidden; box-shadow: 0 1px 0 rgba(26,20,16,0.04); }}
  .img-wrap {{ aspect-ratio: 1/1; background: var(--cream);
                display: flex; align-items: center; justify-content: center;
                border-bottom: 1px solid rgba(26,20,16,0.08); padding: 12px; }}
  .img-wrap img {{ max-width: 100%; max-height: 100%; display: block; }}
  .placeholder {{ font-family: "JetBrains Mono", monospace; font-size: 11px;
                   text-transform: uppercase; letter-spacing: 0.18em; color: var(--maple); }}
  figcaption {{ padding: 16px 18px; }}
  .title {{ font-style: italic; font-size: 19px; line-height: 1.3; margin-bottom: 6px; }}
  .meta {{ font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 10px;
            letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-muted); }}
  .status.ok {{ color: var(--forest); font-weight: 600; }}
  .status.fail {{ color: var(--maple); font-weight: 600; }}
  code {{ font-size: 10px; }}
</style>
</head>
<body>
<header>
  <h1><em>maple</em><span class="mono">REWARDS</span> · logo explorations</h1>
  <div class="sub">10 concept directions · generated 2026-05-10 · gemini 2.5 flash image</div>
</header>
<div class="grid">{''.join(cards)}</div>
</body>
</html>"""
    (out_dir / "index.html").write_text(html)


def main():
    api_key = load_api_key()
    client = genai.Client(api_key=api_key)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Generating {len(CONCEPTS)} logos -> {OUT_DIR}\n")
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
