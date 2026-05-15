#!/usr/bin/env python3
"""Round 3 — drill into the two strongest concepts + add fresh directions.

User feedback after round 2:
- LIKED: pure lowercase 'm' (#04) and 'maple.' wordmark (#10)
- WANT: 5 variations of each + a fresh batch of net-new directions

Output: 15 logos total (5 m-variants + 5 wordmark-variants + 5 net-new).
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

from google import genai
from google.genai import types

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
OUT_DIR = ROOT / "design" / "logo-explorations" / "2026-05-10-r3"
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
    "background. Centered composition with generous margin. Sharp crisp "
    "execution, no soft shadows, no atmospheric blur, no gradients beyond "
    "a single duotone. Do NOT include any words, letters, or numbers in "
    "the image except where the concept explicitly names specific "
    "characters — and when characters appear, render them with no spelling "
    "errors, no extra letters, no stray glyphs."
)

CONCEPTS = [
    # ---- 5 variations of the lowercase 'm' (round 2 winner #04) ----
    {
        "id": "m-01-condensed",
        "title": "m — Condensed Proportions",
        "prompt": (
            "A single oversized lowercase letter 'm' set in a confident "
            "modern custom-cut display sans-serif. The proportions are "
            "CONDENSED — taller than wide, with narrower bowls and "
            "tighter horizontal stretch — like Söhne Schmal or Inter "
            "Display Condensed. Clean even strokes, no serifs, no "
            "decoration. Color: deep ink #1A1410 on cream paper #FBF7EE. "
            "Centered, large. Reference aesthetic: Mercury Bank wordmark "
            "but more vertical. Only the letter m — no other characters."
        ),
    },
    {
        "id": "m-02-with-dot",
        "title": "m — With Maple-Red Period",
        "prompt": (
            "A single lowercase letter 'm' set in a confident modern "
            "custom display sans-serif (Söhne / Inter Display feel), "
            "immediately followed by a small solid maple-red #A51F2D "
            "circular dot (a period). The dot sits on the baseline at "
            "tight spacing from the m's right stem. Letter is deep ink "
            "#1A1410. Cream paper background #FBF7EE. Confident, "
            "minimal, fintech. Only the letter m and the red dot."
        ),
    },
    {
        "id": "m-03-leaf-stem",
        "title": "m — With Subtle Leaf-Vein Stem",
        "prompt": (
            "A single lowercase letter 'm' in a confident modern "
            "display sans-serif. The rightmost stem of the m extends "
            "very slightly above the x-height into a subtle thin curve "
            "— suggesting a tiny leaf-vein or a single growing shoot, "
            "but NOT depicting a literal leaf. The curve is the same "
            "weight as the rest of the strokes; minimal, restrained. "
            "Letter and curve in deep ink #1A1410 with the very tip of "
            "the curve picked out in maple-red #A51F2D as a single "
            "small accent. Cream paper background #FBF7EE."
        ),
    },
    {
        "id": "m-04-italic",
        "title": "m — Display Italic Serif",
        "prompt": (
            "A single oversized lowercase letter 'm' set in a refined "
            "DISPLAY ITALIC SERIF (Instrument Serif lineage, italic "
            "cut), with a slight forward slant of about 8 degrees. "
            "Elegant high-contrast strokes, fine bracketed serifs, "
            "editorial-luxury feel. Color: deep ink #1A1410 on cream "
            "paper #FBF7EE. Confident, premium, fintech-editorial. "
            "Reference aesthetic: Penguin Classics initial mark, "
            "Hermès lowercase, Vogue display. Only the lowercase "
            "italic letter m."
        ),
    },
    {
        "id": "m-05-inktraps",
        "title": "m — Sharp Ink Traps",
        "prompt": (
            "A single lowercase letter 'm' set in a custom geometric "
            "sans-serif with prominent SHARP INK TRAPS — small angular "
            "notches cut into the joins where the bowls meet the stems "
            "(typical of Söhne, Untitled Sans, Inter Display). The ink "
            "traps give the letter a precise mechanical quality. Even "
            "stroke weight, no other decoration. Color: deep ink "
            "#1A1410 on cream paper #FBF7EE. Modern, technical, "
            "fintech-precise. Only the letter m."
        ),
    },

    # ---- 5 variations of the 'maple.' wordmark (round 2 winner #10) ----
    {
        "id": "w-01-tight-serif",
        "title": "maple. — Tight Display Serif",
        "prompt": (
            "Wordmark logo: the word 'maple' set in lowercase confident "
            "custom display serif, with VERY TIGHT optical kerning so "
            "the letters almost touch. Refined high-contrast strokes, "
            "fine bracketed serifs. Immediately after the final 'e' is "
            "a small solid maple-red #A51F2D circular dot. Letters in "
            "deep ink #1A1410, dot in maple red. Cream paper background "
            "#FBF7EE. Premium, editorial, fintech. The only text is the "
            "five letters m-a-p-l-e in lowercase exactly as spelled, "
            "followed by the red dot. No other text."
        ),
    },
    {
        "id": "w-02-geometric-sans",
        "title": "maple. — Geometric Sans-Serif",
        "prompt": (
            "Wordmark logo: the word 'maple' set in lowercase modern "
            "custom GEOMETRIC SANS-SERIF (Söhne / Inter Display / "
            "Untitled Sans feel) — even stroke weight, sharp ink traps, "
            "no calligraphic variation. Tight tracking. Immediately "
            "after the final 'e' is a small solid maple-red #A51F2D "
            "circular dot. Letters in deep ink #1A1410. Cream paper "
            "background #FBF7EE. Cleanly fintech, like a Stripe or "
            "Mercury wordmark. Only the word m-a-p-l-e and the red dot."
        ),
    },
    {
        "id": "w-03-leaf-dot",
        "title": "maple — Tiny Leaf as Period",
        "prompt": (
            "Wordmark logo: the word 'maple' set in lowercase confident "
            "custom display serif. After the final 'e', instead of a "
            "circular period, there is a tiny stylized maple-leaf "
            "silhouette in maple-red #A51F2D — minimal, five-point, "
            "geometric, scaled to be the size of a period (so it reads "
            "as punctuation first, leaf second). Letters in deep ink "
            "#1A1410. Cream paper background #FBF7EE. The only text is "
            "the five letters m-a-p-l-e in lowercase. The leaf is the "
            "punctuation."
        ),
    },
    {
        "id": "w-04-heavy",
        "title": "maple. — Heavy Display Weight",
        "prompt": (
            "Wordmark logo: the word 'maple' set in lowercase HEAVY / "
            "BLACK display serif weight — bold thick strokes with "
            "high contrast. Slightly condensed proportions for "
            "confidence. After the final 'e' is a small solid maple-red "
            "#A51F2D circular dot. Letters in deep ink #1A1410. Cream "
            "paper background #FBF7EE. Reference aesthetic: a confident "
            "magazine masthead reduced to a single word. Only the word "
            "m-a-p-l-e in lowercase, followed by the red dot."
        ),
    },
    {
        "id": "w-05-mid-dot",
        "title": "maple — Floating Mid-Dot",
        "prompt": (
            "Wordmark logo: a small solid maple-red #A51F2D circular "
            "dot, then a small horizontal gap, then the word 'maple' "
            "set in lowercase confident custom display serif. The dot "
            "is positioned at lowercase x-height (mid-line), like a "
            "leading bullet or branding dot. Letters in deep ink "
            "#1A1410. Cream paper background #FBF7EE. Confident, "
            "minimal, editorial. The only text is the word m-a-p-l-e "
            "in lowercase preceded by the floating red dot."
        ),
    },

    # ---- 5 net-new directions ----
    {
        "id": "n-01-samara-seed",
        "title": "Maple Samara — Helicopter Seed",
        "prompt": (
            "A stylized geometric MAPLE SAMARA — the winged maple seed "
            "(also called a helicopter, whirligig, or maple key): two "
            "conjoined wing-shapes joined at a small central seed pod, "
            "like a mirrored teardrop pair. NOT a maple leaf — this is "
            "the seed, which is botanically maple but visually distinct "
            "from the cliched flag-leaf shape. Single solid color: "
            "maple-red #A51F2D on cream paper #FBF7EE. Sharp clean "
            "geometric edges, like a Stripe or Linear icon. No text, "
            "no border, no extra decoration."
        ),
    },
    {
        "id": "n-02-m-chevron",
        "title": "M — Letter as Upward Chevron",
        "prompt": (
            "A custom uppercase letter 'M' where the middle valley of "
            "the M extends UPWARD beyond the top of the letter, "
            "turning the M into both a recognizable letter AND a sharp "
            "upward chevron / rising arrow simultaneously. The "
            "extended center peak rises about 30 percent above the "
            "letter's normal cap height. Even stroke weight, geometric "
            "sans-serif. Color: solid maple-red #A51F2D on cream paper "
            "#FBF7EE. Communicates 'rewards growth' visually. Only the "
            "letter M — no other characters."
        ),
    },
    {
        "id": "n-03-wedge-leaf-bite",
        "title": "Solid Wedge with Leaf-Shaped Bite",
        "prompt": (
            "A solid filled triangular WEDGE / shield / chevron shape "
            "in maple-red #A51F2D, with a single small maple-leaf-"
            "shaped negative-space NOTCH bitten out of one of its "
            "corners — revealing the cream paper background through "
            "the leaf-shaped gap. The wedge is the dominant geometric "
            "form; the leaf appears only as absence. Reference: Brex "
            "diamond / Linear logo with subtle subtraction. Cream "
            "paper #FBF7EE background. No text, no border."
        ),
    },
    {
        "id": "n-04-disc-vein",
        "title": "Disc with Single Leaf-Vein",
        "prompt": (
            "A confident solid filled circle / disc in maple-red "
            "#A51F2D, with a single thin cream-colored line carved "
            "across the disc that traces the central vein of a maple "
            "leaf (a hairline running top-to-bottom with five small "
            "branching offshoots like leaf veins). The disc itself is "
            "the dominant shape; the vein detail is restrained. "
            "Centered on cream paper #FBF7EE. Reference: a fintech "
            "app icon, like a confident solid mark. No text, no border."
        ),
    },
    {
        "id": "n-05-card-chip-leaf",
        "title": "Card Chip — Leaf in Contact Pads",
        "prompt": (
            "A stylized credit-card EMV CHIP shown straight-on as a "
            "small rounded square. The chip's typical metallic "
            "contact-pad pattern (the divided rectangular sections on "
            "a real chip) is arranged so the gold lines between the "
            "pads collectively form the silhouette of a five-point "
            "maple leaf. Chip body in deep gold #B88E3C, the leaf-"
            "forming separator lines and the chip outline in deep ink "
            "#1A1410, with a small maple-red #A51F2D accent inside the "
            "central leaf shape. Cream paper background #FBF7EE. "
            "Modern fintech, direct credit-card reference. No text."
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
    parts = ["# MapleRewards Logo Prompts — 2026-05-10 — Round 3\n\n"]
    parts.append(f"**Shared rules:**\n\n```\n{SHARED_RULES}\n\n{PALETTE_LINE}\n```\n\n")
    parts.append("## Variations of `m` (round-2 #04 winner)\n\n")
    for c in CONCEPTS[:5]:
        parts.append(f"### {c['id']} — {c['title']}\n\n**File:** `{c['id']}.png`\n\n```\n{c['prompt']}\n```\n\n")
    parts.append("## Variations of `maple.` wordmark (round-2 #10 winner)\n\n")
    for c in CONCEPTS[5:10]:
        parts.append(f"### {c['id']} — {c['title']}\n\n**File:** `{c['id']}.png`\n\n```\n{c['prompt']}\n```\n\n")
    parts.append("## Net-New Directions\n\n")
    for c in CONCEPTS[10:]:
        parts.append(f"### {c['id']} — {c['title']}\n\n**File:** `{c['id']}.png`\n\n```\n{c['prompt']}\n```\n\n")
    (out_dir / "prompts.md").write_text("".join(parts))


def write_index_html(out_dir: Path, results: list[dict]):
    sections = [
        ("variations of <em>m</em>", results[:5]),
        ("variations of <em>maple.</em> wordmark", results[5:10]),
        ("net-new directions", results[10:]),
    ]
    section_html = []
    for label, rs in sections:
        cards = []
        for r in rs:
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
        section_html.append(f'''
        <section>
          <h2>{label}</h2>
          <div class="grid">{''.join(cards)}</div>
        </section>''')

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>MapleRewards Logo Explorations — Round 3 — 2026-05-10</title>
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
  section {{ max-width: 1320px; margin: 0 auto 56px; }}
  section h2 {{ font-style: italic; font-weight: 400; font-size: 26px;
                margin: 0 0 24px; letter-spacing: -0.01em; }}
  section h2 em {{ font-style: italic; }}
  .grid {{ display: grid;
           grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
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
  <h1><em>maple</em><span class="mono">REWARDS</span> &middot; round 3</h1>
  <div class="sub">15 designs &middot; 5 m-variants &middot; 5 wordmark-variants &middot; 5 new directions</div>
  <div class="nav">
    <a href="../2026-05-10/index.html">&larr; round 1</a>
    <a href="../2026-05-10-r2/index.html">&larr; round 2</a>
  </div>
</header>
{''.join(section_html)}
</body>
</html>"""
    (out_dir / "index.html").write_text(html)


def main():
    api_key = load_api_key()
    client = genai.Client(api_key=api_key)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Round 3 — generating {len(CONCEPTS)} logos -> {OUT_DIR}\n")
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
