#!/usr/bin/env python3
"""Standalone re-roll for the maple samara concept (round 3 n-01 failed)."""

from __future__ import annotations

import sys
from pathlib import Path

from google import genai
from google.genai import types

SECRET_FILE = Path.home() / ".claude" / "secrets" / "nanobanana.env"
OUT_FILE = (
    Path(__file__).resolve().parent.parent
    / "design" / "logo-explorations" / "2026-05-10-r3" / "n-01-samara-seed.png"
)

PROMPT = """A clean geometric logo mark depicting a stylized maple SAMARA — \
the winged double-seed of a maple tree (sometimes called a 'helicopter' or \
'maple key'). Two mirrored teardrop-shaped wings joined at a small central \
seed pod, like the letter V with rounded tips, splayed open at roughly 90 \
degrees. Single solid color: maple-red #A51F2D on cream paper background \
#FBF7EE. Sharp clean geometric edges, like a Stripe or Linear icon. The \
shape is botanically a maple seed pod, NOT a maple leaf. Centered, generous \
margin, square 1:1 aspect ratio. No text, no border, no extra decoration, \
no shadows. Modern fintech logo design — confident, restrained, clean. \
Brand palette: maple red #A51F2D, cream paper #FBF7EE only."""


def load_api_key() -> str:
    for line in SECRET_FILE.read_text().splitlines():
        if line.startswith("NANOBANANA_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("no key")


def main():
    client = genai.Client(api_key=load_api_key())
    cfg = types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"])
    response = client.models.generate_content(
        model="gemini-2.5-flash-image",
        contents=PROMPT,
        config=cfg,
    )
    if not response.candidates:
        sys.exit("no candidates")
    for part in response.candidates[0].content.parts:
        inline = getattr(part, "inline_data", None)
        if inline is not None and getattr(inline, "data", None):
            OUT_FILE.write_bytes(inline.data)
            print(f"ok -> {OUT_FILE}")
            return
    sys.exit("no image part returned")


if __name__ == "__main__":
    main()
