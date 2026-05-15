#!/usr/bin/env python3
"""Round 5 — pure minimalist fintech.

User feedback after round 4: dimensional / iridescent / brutalist work
didn't land. Wants minimalist, modern, beautiful, fintech-clean — like
Mercury, Stripe, Brex, Ramp, Cursor, Anthropic, Linear, Read.cv.

10 directions in three families:
  A) Bold monolith / mark (Cursor-style cut-outs, primitive shapes)
  B) Refined wordmark with ONE distinctive detail
  C) Block / lockup typographic compositions
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

from google import genai
from google.genai import types

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
OUT_DIR = ROOT / "design" / "logo-explorations" / "2026-05-10-r5"
SECRET_FILE = Path.home() / ".claude" / "secrets" / "nanobanana.env"

MODEL = "gemini-2.5-flash-image"

PALETTE_LINE = (
    "Brand palette (use ONLY these): maple red #A51F2D, deep ink #1A1410, "
    "cream paper #FBF7EE. No gold, no other colors in this round."
)

SHARED_RULES = (
    "Square 1:1 aspect ratio. EXTREME minimalist fintech logo design — "
    "confidence through complete restraint. The kind of logo that would "
    "look at home next to Mercury, Stripe, Brex, Ramp, Cursor, Anthropic, "
    "Linear, Read.cv, Vercel, Notion, Pally on a list of best modern "
    "fintech identities. ABSOLUTELY AVOID: 3D rendering, photorealism, "
    "gradients, glow effects, drop shadows, iridescent textures, "
    "illustrative detail, vintage stamps, calligraphy, magazine masthead, "
    "hand-drawn lines, ornamental flourishes, cute cartoonish softness, "
    "Y2K aqua, chrome. The logo must be pure FLAT VECTOR — solid shapes, "
    "sharp clean edges, single or two-tone color only. Cream paper "
    "background #FBF7EE, no other backgrounds. Centered composition, "
    "generous margin. Modern, beautiful, restrained, ownable. Do NOT "
    "include any words, letters, or numbers except where the concept "
    "explicitly names specific characters — and when characters appear, "
    "render them with no spelling errors and no extra glyphs."
)

CONCEPTS = [
    # ---- A. Bold mark / monolith ----
    {
        "id": "01-cursor-square-m",
        "title": "Monolith Square — m Cut-Out",
        "prompt": (
            "A solid filled rounded square in maple-red #A51F2D, the "
            "entire image is dominated by this square shape (occupying "
            "about 60 percent of the canvas). A precise lowercase letter "
            "'m' is cleanly cut OUT of the center of the square as "
            "negative space, revealing the cream paper #FBF7EE "
            "background through the cut. The lowercase m is set in a "
            "confident modern geometric sans-serif (Söhne / Inter "
            "Display), perfectly centered. Reference aesthetic: Cursor "
            "logo, Notion's N, modern fintech app icons. Flat vector, "
            "no shadows, no gradients. Only the letter m appears."
        ),
    },
    {
        "id": "02-cursor-circle-m",
        "title": "Monolith Disc — m Cut-Out",
        "prompt": (
            "A solid filled perfect circle (disc) in maple-red #A51F2D, "
            "occupying the centered space. A precise lowercase letter "
            "'m' is cleanly cut OUT of the center of the disc as "
            "negative space, revealing the cream paper #FBF7EE "
            "background. The lowercase m is set in a modern geometric "
            "sans-serif (Söhne / Inter Display), centered. Cream paper "
            "background. Flat vector, no shadows, no gradients. "
            "Reference: Notion's N tile, modern app icon. Only the "
            "letter m."
        ),
    },
    {
        "id": "03-asymmetric-primitive",
        "title": "Asymmetric Primitive — No Letter",
        "prompt": (
            "A single solid maple-red #A51F2D abstract geometric "
            "primitive shape — a slightly asymmetric pentagon (five "
            "straight sides, but not a regular pentagon — one of the "
            "vertices is shifted slightly off-axis to make the shape "
            "feel hand-considered rather than geometric-perfect). No "
            "letter, no leaf, no decoration — just the pure flat shape. "
            "The shape becomes the brand through restraint. Reference: "
            "Vercel's triangle, Linear's old V mark, Brex's diamond. "
            "Cream paper background #FBF7EE. Flat vector, sharp edges, "
            "no shadows."
        ),
    },

    # ---- B. Refined wordmark with ONE distinctive detail ----
    {
        "id": "04-wordmark-deep-p",
        "title": "maple — Long-Descender p (Read.cv-style)",
        "prompt": (
            "Wordmark logo: the word 'maple' set in lowercase confident "
            "modern custom display sans-serif (Söhne / Inter Display "
            "feel). Tight kerning. The single distinctive detail: the "
            "letter 'p' has a notably LONG DESCENDER extending well "
            "below the baseline — about 1.4x the standard descender "
            "length — like Read.cv's elongated y. Otherwise the word is "
            "completely undecorated. All letters in deep ink #1A1410. "
            "Cream paper background #FBF7EE. The only text is the five "
            "letters m-a-p-l-e in lowercase exactly as spelled."
        ),
    },
    {
        "id": "05-wordmark-tall-l",
        "title": "maple — Tall l, Rhythm Break",
        "prompt": (
            "Wordmark logo: the word 'maple' set in lowercase modern "
            "geometric sans-serif (Söhne / Inter Display feel). Tight "
            "kerning. The single distinctive detail: the letter 'l' "
            "rises noticeably TALLER than the other ascenders (the 'p' "
            "and the implied cap height) — about 1.2x as tall as the "
            "rest of the ascenders, creating a confident rhythm break. "
            "Letters in deep ink #1A1410 with the tip of the tall l "
            "picked out in maple-red #A51F2D as the only color accent. "
            "Cream paper background #FBF7EE. Only the word maple."
        ),
    },
    {
        "id": "06-wordmark-loop-e",
        "title": "maple — Italic e, Lattice-Style",
        "prompt": (
            "Wordmark logo: the word 'maple' set in lowercase confident "
            "modern serif (Tiempos Headline / Action Condensed feel). "
            "The first four letters m-a-p-l are upright roman, and only "
            "the final 'e' is set in an ITALIC cut from the same "
            "typeface family — creating a single confident detail break "
            "at the end of the word. Tight kerning. All letters in deep "
            "ink #1A1410. Cream paper background #FBF7EE. The only text "
            "is the five letters m-a-p-l-e in lowercase."
        ),
    },
    {
        "id": "07-cut-M-anthropic",
        "title": "Cut M — Anthropic-Style Single Notch",
        "prompt": (
            "A single oversized uppercase letter 'M' set in a confident "
            "modern serif (Action Condensed / Tiempos Headline). The "
            "single distinctive detail: ONE of the M's two inner "
            "diagonals is completely MISSING — just absent, leaving "
            "what appears to be half an M / a 'Π' or 'N'-adjacent shape. "
            "The remaining strokes are clean and confident, with refined "
            "bracketed serifs. Reference: Anthropic's modified A with "
            "missing crossbar, Cursor's cut letterform — minimalist "
            "typographic cleverness through subtraction. Color: solid "
            "deep ink #1A1410 on cream paper #FBF7EE. Only the modified "
            "M letterform — no other text or marks."
        ),
    },

    # ---- C. Block / lockup compositions ----
    {
        "id": "08-stacked-type-block",
        "title": "Stacked Type Block — Transit-Style",
        "prompt": (
            "A wordmark composition: the words 'MAPLE' on the top line "
            "and 'REWARDS' on the bottom line, both set in tight "
            "all-uppercase JetBrains Mono or Söhne Mono Medium weight, "
            "with the same width (so the letter spacing of REWARDS is "
            "tighter to match MAPLE). The two words are stacked tightly "
            "with the line-height equal to the cap height — feels like "
            "a transit station sign or shipping label. Centered. Color: "
            "solid deep ink #1A1410 on cream paper #FBF7EE. The only "
            "text is the two words MAPLE and REWARDS in uppercase. No "
            "decoration."
        ),
    },
    {
        "id": "09-block-wordmark-pair",
        "title": "Color Block + Wordmark Pair (Brex-Style)",
        "prompt": (
            "A composition with two elements side by side: on the LEFT, "
            "a small solid maple-red #A51F2D rounded square (about the "
            "size of the cap height of the wordmark next to it, with a "
            "subtle 4px corner radius); on the RIGHT immediately after "
            "a small horizontal gap, the word 'maple' set in lowercase "
            "confident modern geometric sans (Söhne / Inter Display) in "
            "deep ink #1A1410. Tight letter spacing. The square and "
            "wordmark sit on the same baseline. Reference: Brex's mark "
            "and wordmark, Linear's mark + wordmark. Cream paper "
            "background #FBF7EE. The only text is the word maple "
            "lowercase."
        ),
    },
    {
        "id": "10-tag-pill-mr",
        "title": "Tag Pill — mr Lowercase Lockup",
        "prompt": (
            "A small horizontal pill-shaped capsule (rounded rectangle "
            "with fully circular ends), filled solid maple-red #A51F2D, "
            "containing the lowercase letters 'mr' set in tight Söhne "
            "Mono Medium uppercase-height in cream paper #FBF7EE color. "
            "The pill has tight padding around the letters — feels like "
            "a status badge, a transit pill, or a Mercury wallet pill. "
            "Centered on cream paper background #FBF7EE. The only text "
            "is the two letters m-r in lowercase. Flat vector, no "
            "shadows."
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
    parts = ["# MapleRewards Logo Prompts — 2026-05-10 — Round 5 (Pure Minimalist)\n\n"]
    parts.append(f"**Shared rules:**\n\n```\n{SHARED_RULES}\n\n{PALETTE_LINE}\n```\n\n")
    parts.append("## A. Bold mark / monolith\n\n")
    for c in CONCEPTS[:3]:
        parts.append(f"### {c['id']} — {c['title']}\n\n**File:** `{c['id']}.png`\n\n```\n{c['prompt']}\n```\n\n")
    parts.append("## B. Refined wordmark with ONE distinctive detail\n\n")
    for c in CONCEPTS[3:7]:
        parts.append(f"### {c['id']} — {c['title']}\n\n**File:** `{c['id']}.png`\n\n```\n{c['prompt']}\n```\n\n")
    parts.append("## C. Block / lockup compositions\n\n")
    for c in CONCEPTS[7:]:
        parts.append(f"### {c['id']} — {c['title']}\n\n**File:** `{c['id']}.png`\n\n```\n{c['prompt']}\n```\n\n")
    (out_dir / "prompts.md").write_text("".join(parts))


def write_index_html(out_dir: Path, results: list[dict]):
    sections = [
        ("bold mark / monolith", results[:3]),
        ("refined wordmark with one distinctive detail", results[3:7]),
        ("block / lockup compositions", results[7:]),
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
<title>MapleRewards Logo Explorations — Round 5 — Pure Minimalist</title>
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
  <h1><em>maple</em><span class="mono">REWARDS</span> &middot; round 5 — pure minimalist</h1>
  <div class="sub">10 directions &middot; 3 monoliths &middot; 4 wordmark details &middot; 3 lockups</div>
  <div class="nav">
    <a href="../2026-05-10/index.html">&larr; r1</a>
    <a href="../2026-05-10-r2/index.html">&larr; r2</a>
    <a href="../2026-05-10-r3/index.html">&larr; r3</a>
    <a href="../2026-05-10-r4/index.html">&larr; r4</a>
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

    print(f"Round 5 — generating {len(CONCEPTS)} logos -> {OUT_DIR}\n")
    results = []
    for c in CONCEPTS:
        print(f"  -> {c['id']}: {c['title']}")
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
