#!/usr/bin/env python3
"""Round 6 — 20 typography-driven logo concepts.

User feedback: wants something INSANE, with full creative liberty, type-led,
amazing. Round 6 commits hard to typography as the hero across four families:

  A) Custom display wordmarks (5) — extreme weight / tracking / cut decisions
  B) Wordmark with ONE radical detail (5) — single insane move per concept
  C) Monogram letterforms with bravado (5) — single-letter or fused-letter marks
  D) Crazy typographic compositions (5) — vertical stacks, circles, stretches

References: Mercury, Stripe, Brex, Anthropic, Linear, Read.cv, Vogue Didone,
Druk Wide, Recoleta Black, Söhne Hairline, Penguin Classics imprint marks.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

from google import genai
from google.genai import types

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
OUT_DIR = ROOT / "design" / "logo-explorations" / "2026-05-10-r6"
SECRET_FILE = Path.home() / ".claude" / "secrets" / "nanobanana.env"

MODEL = "gemini-2.5-flash-image"

PALETTE_LINE = (
    "Brand palette: maple red #A51F2D, deep ink #1A1410, cream paper #FBF7EE. "
    "Color is restrained — most concepts are monochrome ink, with maple-red "
    "used only as a single accent where called for."
)

SHARED_RULES = (
    "Square 1:1 aspect ratio. Type-driven minimalist fintech logo. The "
    "TYPOGRAPHY is the hero — every detail is intentional, every letter "
    "is custom-cut, nothing is decorative. Quality bar: should look at "
    "home next to Mercury, Stripe, Brex, Anthropic, Linear, Read.cv, "
    "Vogue, Penguin Classics. ABSOLUTELY AVOID: 3D rendering, gradients, "
    "shadows, glow, iridescent textures, photographic effects, generic "
    "stock font output, cute cartoon softness, AI-generated logo cliche. "
    "Pure flat vector — solid shapes, sharp edges, single or two-tone. "
    "Cream paper background #FBF7EE. Centered composition with generous "
    "margin. When characters appear, render them with no spelling errors, "
    "no stray glyphs, no extra text outside what the concept names."
)

CONCEPTS = [
    # ===== A. Custom display wordmarks (5) =====
    {
        "id": "A1-recoleta-heavy",
        "title": "maple — Recoleta-Style Heavy Slab Serif",
        "prompt": (
            "Wordmark logo: the word 'maple' set in lowercase HEAVY MODERN "
            "SLAB SERIF — like Recoleta Black or Tiempos Headline Heavy. "
            "Thick confident strokes, slab terminals, slight contrast "
            "between thicks and thins. Tight kerning so letters almost "
            "touch. Pure deep ink #1A1410 on cream paper #FBF7EE. No "
            "decoration, no period, no mark. The wordmark IS the logo. "
            "Only the five letters m-a-p-l-e in lowercase."
        ),
    },
    {
        "id": "A2-hairline-thin",
        "title": "maple — Hairline Thin Geometric Sans",
        "prompt": (
            "Wordmark logo: the word 'maple' set in lowercase ULTRA-THIN "
            "HAIRLINE GEOMETRIC SANS-SERIF — strokes only 1px / 2 percent "
            "of cap height — like Söhne Hairline or Inter Display Thin. "
            "Each letter is generously sized but its strokes are "
            "surgically thin. Tracking is open (slightly loose). Color: "
            "deep ink #1A1410 on cream paper #FBF7EE. Confidence through "
            "extreme restraint and precision. Only the word maple "
            "lowercase."
        ),
    },
    {
        "id": "A3-didone-italic",
        "title": "maple. — Vogue Didone High-Contrast Italic",
        "prompt": (
            "Wordmark logo: the word 'maple' set in lowercase HIGH-CONTRAST "
            "DIDONE ITALIC SERIF — extreme contrast between thick verticals "
            "and hairline thin horizontals, fine ball terminals, slight "
            "forward slant. Like the Vogue masthead, Vanity Fair display, "
            "or Bodoni Italic. Followed by a small solid maple-red #A51F2D "
            "circular period dot. Editorial luxury fintech. Cream paper "
            "background #FBF7EE. Only the word maple followed by a red "
            "period."
        ),
    },
    {
        "id": "A4-druk-condensed",
        "title": "MAPLE — Druk-Wide Condensed Uppercase",
        "prompt": (
            "Wordmark logo: the word 'MAPLE' set in all-uppercase ULTRA-"
            "CONDENSED BOLD DISPLAY SANS — tall and narrow letterforms "
            "with very thick strokes and minimal counter space, like Druk "
            "Wide Bold or Tungsten Black or Trim Display Condensed. "
            "Letters are tightly tracked so they almost touch. Pure deep "
            "ink #1A1410 on cream paper #FBF7EE. Brutalist editorial "
            "magazine confidence. Only the five uppercase letters M-A-P-"
            "L-E."
        ),
    },
    {
        "id": "A5-garamond-classical",
        "title": "maple — Classical Garamond Italic",
        "prompt": (
            "Wordmark logo: the word 'maple' set in lowercase CLASSICAL "
            "BOOK SERIF ITALIC — Garamond Italic / Caslon Italic / Adobe "
            "Jenson Italic — refined high-contrast strokes, calligraphic "
            "ductus, beautiful italic ligatures where appropriate. The "
            "logo feels like the imprint mark of an old publishing house "
            "(Penguin Classics, FSG). Pure deep ink #1A1410 on cream "
            "paper #FBF7EE. Premium editorial restraint. Only the word "
            "maple in italic lowercase."
        ),
    },

    # ===== B. Wordmark with ONE radical detail (5) =====
    {
        "id": "B1-leaf-shaped-m",
        "title": "maple — m as Stylized Leaf Glyph",
        "prompt": (
            "Wordmark logo: the word 'maple' set in lowercase confident "
            "modern serif. The single radical detail: the lowercase 'm' "
            "is REPLACED with a custom typographic glyph that reads "
            "simultaneously as a lowercase m AND as a stylized five-point "
            "maple leaf — the m's two arches and stem are reshaped to "
            "form leaf points and a stem. Subtle, not literal. Letter "
            "color: the m-glyph in maple-red #A51F2D, a-p-l-e in deep "
            "ink #1A1410. Cream paper background #FBF7EE. Only the word "
            "maple."
        ),
    },
    {
        "id": "B2-cursor-block",
        "title": "maple_ — Terminal-Cursor Underscore",
        "prompt": (
            "Wordmark logo: the word 'maple' set in lowercase tight "
            "Söhne Mono / IBM Plex Mono Medium — monospaced typography "
            "with even-width characters. Immediately after the 'e', a "
            "solid maple-red #A51F2D rectangular UNDERSCORE / cursor "
            "block (about 0.6x cap height tall, 0.6x cap width wide), "
            "like a blinking terminal cursor mid-prompt. Letters in deep "
            "ink #1A1410. Cream paper background #FBF7EE. Modern hacker-"
            "fintech, terminal aesthetic. Only the word maple followed by "
            "the red cursor block."
        ),
    },
    {
        "id": "B3-tracked-out",
        "title": "M A P L E — Extreme Letter-Spacing",
        "prompt": (
            "Wordmark logo: the word 'MAPLE' set in all-uppercase modern "
            "geometric sans (Söhne / Inter Display Medium), with EXTREME "
            "LETTER SPACING — about 0.5em of space between each letter, "
            "so the word stretches across the full width of the canvas as "
            "five distinctly separated characters. The word reads like a "
            "magazine masthead or a fashion-house label. Letters in deep "
            "ink #1A1410 on cream paper #FBF7EE. Only the five letters "
            "M-A-P-L-E in uppercase, very widely spaced."
        ),
    },
    {
        "id": "B4-overlapping-tight",
        "title": "maple — Overlapping Vetements Kerning",
        "prompt": (
            "Wordmark logo: the word 'maple' set in lowercase HEAVY BOLD "
            "modern sans (Söhne Black / Druk Bold), with NEGATIVE letter-"
            "spacing — letters slightly OVERLAP each other where their "
            "strokes intersect, creating bold typographic collisions. The "
            "overall mass reads as one fused word-block. Like Vetements "
            "or Hot Wheels logos. Pure deep ink #1A1410 on cream paper "
            "#FBF7EE. Only the word maple lowercase, with letters tightly "
            "overlapping."
        ),
    },
    {
        "id": "B5-strikethrough-l",
        "title": "map̶l̶e — Red Strike-Through Bar",
        "prompt": (
            "Wordmark logo: the word 'maple' set in lowercase confident "
            "modern serif (Tiempos Text / Roslindale). Tight kerning. The "
            "single radical detail: a thin horizontal maple-red #A51F2D "
            "BAR runs across the word at lowercase x-height — like a "
            "redaction line or a strike-through, but treated confidently "
            "as branding. The bar runs only across the central three "
            "letters 'a-p-l', not the m or final e. Letters in deep ink "
            "#1A1410. Cream paper background #FBF7EE. Only the word maple "
            "with the red bar."
        ),
    },

    # ===== C. Monogram letterforms with bravado (5) =====
    {
        "id": "C1-display-M-cut",
        "title": "M — Refined Display Cut",
        "prompt": (
            "A single oversized capital letter 'M' set in a refined modern "
            "DISPLAY SERIF (Action Condensed / Tiempos Headline / "
            "Frankfurter). High-contrast strokes, fine bracketed serifs. "
            "The letter is cleanly drawn with no decoration, but the "
            "construction is unmistakably a piece of expert custom "
            "typography — like a one-letter Penguin Classics imprint "
            "mark. Color: pure deep ink #1A1410 on cream paper #FBF7EE. "
            "Only the single letter M."
        ),
    },
    {
        "id": "C2-stretched-M",
        "title": "M — Stretched Wide (Tesla-T Style)",
        "prompt": (
            "A single capital letter 'M' stretched UNUSUALLY WIDE "
            "horizontally — about 1.8x its normal aspect ratio — with "
            "even thin stroke weight, like the stretched 'T' of the Tesla "
            "logo. The horizontal mass becomes the mark. Geometric sans-"
            "serif construction. Pure deep ink #1A1410 on cream paper "
            "#FBF7EE. Only the single letter M, stretched wide."
        ),
    },
    {
        "id": "C3-MR-ligature-fused",
        "title": "MR — Fused Ligature Glyph",
        "prompt": (
            "A custom typographic LIGATURE that fuses the capital letters "
            "M and R into a single connected glyph — they share their "
            "central vertical stem, so the M's right diagonal becomes "
            "the R's leg. The glyph is built in a confident modern serif "
            "(Tiempos Headline) with refined bracketed serifs and high "
            "contrast strokes. Reference: classical monastic ligatures, "
            "Pinterest's stylized P, Chanel's interlocked C's. Pure deep "
            "ink #1A1410 on cream paper #FBF7EE. Only the fused MR glyph "
            "— no separate letters, no decoration."
        ),
    },
    {
        "id": "C4-architectural-M",
        "title": "M — Architectural Form",
        "prompt": (
            "A single capital letter 'M' constructed as if it were "
            "ARCHITECTURE — the two outer vertical strokes are bold "
            "columns, the inner V is a narrow notch with sharp 90-degree "
            "geometry. Reference: a brutalist concrete monument, an "
            "ancient Roman inscription, the WTC tower silhouettes. The "
            "letter has weight and presence, like it could be carved in "
            "stone. Pure deep ink #1A1410 on cream paper #FBF7EE. Only "
            "the architectural M."
        ),
    },
    {
        "id": "C5-script-m-flowing",
        "title": "m — Single Continuous Brush Stroke",
        "prompt": (
            "A single lowercase letter 'm' rendered as ONE CONTINUOUS "
            "BRUSH STROKE — calligraphic, flowing, drawn in one breath "
            "without lifting the pen. Slight variation in stroke width "
            "from heavier downstrokes to thinner upstrokes (real "
            "calligraphy). Color: maple-red #A51F2D ink on cream paper "
            "#FBF7EE. Reference: Lubalin script marks, Hermès brush "
            "lettering, Monocle masthead initials. Premium editorial "
            "calligraphy. Only the single brush-drawn m."
        ),
    },

    # ===== D. Crazy typographic compositions (5) =====
    {
        "id": "D1-vertical-stack",
        "title": "MAPLE — Vertical Stacked Column",
        "prompt": (
            "A wordmark composition where the five letters of 'MAPLE' are "
            "stacked VERTICALLY in a single column — M on top, then A, P, "
            "L, E descending. Each letter is uppercase, set in a tight "
            "modern condensed sans (Druk Wide Medium / Tungsten Bold), "
            "with tight line-height so letters almost touch each other "
            "vertically. Centered horizontally. Pure deep ink #1A1410 on "
            "cream paper #FBF7EE. Only the five uppercase letters M-A-"
            "P-L-E stacked vertically."
        ),
    },
    {
        "id": "D2-circular-text",
        "title": "MAPLE • REWARDS — Circular Path Lockup",
        "prompt": (
            "A circular wordmark logo: the words 'MAPLE • REWARDS' set in "
            "tight uppercase modern mono (JetBrains Mono Medium) curved "
            "around the circumference of an imaginary circle — MAPLE on "
            "the top arc, REWARDS on the bottom arc, with two small "
            "maple-red #A51F2D bullet dots at the left and right "
            "junctions where the two words meet. Negative space inside "
            "the circle is empty cream paper. Reference: a postal cancel "
            "stamp but reduced to pure typography, Penguin imprint marks. "
            "Letters in deep ink #1A1410. Cream paper background #FBF7EE. "
            "The only text is MAPLE and REWARDS in arc."
        ),
    },
    {
        "id": "D3-mixed-weights",
        "title": "maple — Mixed Weights, Letter by Letter",
        "prompt": (
            "Wordmark logo: the word 'maple' set in lowercase with EACH "
            "LETTER IN A DIFFERENT WEIGHT from the same modern serif "
            "family. Specifically: the m is Heavy/Black, the a is "
            "Regular, the p is Bold, the l is Light, the e is Regular — "
            "creating a visual rhythm that reads as intentional editorial "
            "anarchy. Tight kerning. Letters in deep ink #1A1410 on cream "
            "paper #FBF7EE. Reference: i-D magazine, late-90s Carson "
            "editorial typography. Only the word maple lowercase."
        ),
    },
    {
        "id": "D4-outline-only",
        "title": "MAPLE — Outline-Only Wordmark",
        "prompt": (
            "Wordmark logo: the word 'MAPLE' set in all-uppercase modern "
            "geometric sans (Söhne Bold / Inter Display Bold), but with "
            "OUTLINE-ONLY rendering — only the contours of each letter "
            "are drawn, with hairline 1.5px deep ink #1A1410 strokes "
            "around hollow letterforms (the interior of each letter is "
            "cream paper #FBF7EE, same as background). Tight kerning. "
            "Reference: outdoor sign typography, vintage department-store "
            "wayfinding, Glossier wordmark. Only the five outlined "
            "uppercase letters M-A-P-L-E."
        ),
    },
    {
        "id": "D5-drop-cap-m",
        "title": "maple — Editorial Display Drop-Cap M",
        "prompt": (
            "An editorial wordmark composition: a large oversized capital "
            "'M' set in elegant Didone serif (like a magazine drop cap, "
            "about 2.5x the height of the rest of the word), flush-left, "
            "in maple-red #A51F2D. Immediately to the right, baseline-"
            "aligned with the bottom of the M, the letters 'aple' are "
            "set in lowercase regular-weight serif at normal size in "
            "deep ink #1A1410. The composition reads as 'Maple' but the "
            "M dominates as an editorial drop cap. Cream paper "
            "background #FBF7EE. Only the word Maple — capital M plus "
            "lowercase aple."
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
        try:
            response = client.models.generate_content(
                model=MODEL, contents=full_prompt, config=cfg
            )
            if not response.candidates:
                last_err = "no candidates"
            else:
                cand = response.candidates[0]
                if not cand.content or not cand.content.parts:
                    last_err = "empty content"
                else:
                    for part in cand.content.parts:
                        inline = getattr(part, "inline_data", None)
                        if inline is not None and getattr(inline, "data", None):
                            return inline.data, MODEL
                    last_err = "no image part"
        except Exception as e:
            msg = str(e)
            last_err = f"{type(e).__name__}: {msg[:100]}"
            if "503" in msg or "UNAVAILABLE" in msg or "429" in msg:
                wait = 2 ** attempt
                print(f"     (retry {attempt+1}/{retries} after {wait}s)")
                time.sleep(wait)
                continue
        time.sleep(2 ** attempt)
    return None, last_err


def write_prompts_md(out_dir: Path):
    parts = ["# MapleRewards Logo Prompts — 2026-05-10 — Round 6 (20 Type-Driven)\n\n"]
    parts.append(f"**Shared rules:**\n\n```\n{SHARED_RULES}\n\n{PALETTE_LINE}\n```\n\n")
    sections = [
        ("A. Custom display wordmarks", CONCEPTS[:5]),
        ("B. Wordmark with ONE radical detail", CONCEPTS[5:10]),
        ("C. Monogram letterforms with bravado", CONCEPTS[10:15]),
        ("D. Crazy typographic compositions", CONCEPTS[15:]),
    ]
    for label, cs in sections:
        parts.append(f"## {label}\n\n")
        for c in cs:
            parts.append(f"### {c['id']} — {c['title']}\n\n**File:** `{c['id']}.png`\n\n```\n{c['prompt']}\n```\n\n")
    (out_dir / "prompts.md").write_text("".join(parts))


def write_index_html(out_dir: Path, results: list[dict]):
    sections = [
        ("A. custom display wordmarks", results[:5]),
        ("B. wordmark with one radical detail", results[5:10]),
        ("C. monogram letterforms with bravado", results[10:15]),
        ("D. crazy typographic compositions", results[15:]),
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
<title>MapleRewards Logo Explorations — Round 6 — Type Driven</title>
<style>
  :root {{
    --cream: #FBF7EE; --ink: #1A1410; --ink-muted: #6f6358;
    --maple: #A51F2D;
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
  <h1><em>maple</em><span class="mono">REWARDS</span> &middot; round 6 — type-driven</h1>
  <div class="sub">20 typographic logos &middot; 4 families &middot; full creative liberty</div>
  <div class="nav">
    <a href="../2026-05-10/index.html">&larr; r1</a>
    <a href="../2026-05-10-r2/index.html">&larr; r2</a>
    <a href="../2026-05-10-r3/index.html">&larr; r3</a>
    <a href="../2026-05-10-r4/index.html">&larr; r4</a>
    <a href="../2026-05-10-r5/index.html">&larr; r5</a>
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

    print(f"Round 6 — generating {len(CONCEPTS)} logos -> {OUT_DIR}\n")
    results = []
    for i, c in enumerate(CONCEPTS, 1):
        print(f"  [{i}/{len(CONCEPTS)}] {c['id']}: {c['title']}")
        png, info = generate(client, c["prompt"])
        out_file = f"{c['id']}.png"
        rec = {"id": c["id"], "title": c["title"], "file": out_file, "ok": False, "info": info}
        if png is not None:
            (OUT_DIR / out_file).write_bytes(png)
            rec["ok"] = True
            print(f"     ok -> {out_file}")
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
