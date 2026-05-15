# MapleRewards — Brand Book

One page. Read it before you ship copy or pixels.

## Voice

**Three adjectives: considered, plainspoken, Canadian.**

We write the way a thoughtful friend explains money over coffee. No breathless announcements. No Silicon Valley swagger. Confident because the math is honest. Built for people who already know what a transfer partner is, or who want to.

## Banned words

Replace every occurrence in shipping copy:

| Don't say        | Say instead                          |
|------------------|--------------------------------------|
| unlock / unlocked| open, available, live                |
| baked in         | built in (or describe the thing)     |
| seamless         | (cut entirely)                       |
| elevate          | lift, raise (or cut)                 |
| power-user       | expert, advanced, pro                |
| leakage (UI)     | missed rewards                       |
| wedge            | advantage, edge                      |
| register (catalog)| catalog                             |

Tone targets: confident, conversational, Canadian-warm, not breathless. Reserve italic for one element per section, max. Cut em-dashes by 80%. Use periods and colons.

## Palette

Warm paper substrate, not gallery white. Maple-red as the single emotional accent.

| Token           | Hex / Value                  | Use                                |
|-----------------|------------------------------|------------------------------------|
| `--paper`       | `#FBF7EE`                    | page background                    |
| `--bone`        | `#EAE2D2`                    | secondary surface                  |
| `--surface`     | `#FFFCF5`                    | cards, sheets                      |
| `--surface-2`   | `#F0E9DA`                    | striped rows, sub-surfaces         |
| `--ink`         | `#1A1410`                    | primary type                       |
| `--ink-2`       | `#3A3128`                    | body type                          |
| `--ink-3`       | `#6F6557`                    | secondary type, captions           |
| `--ink-4`       | `#A89C89`                    | tertiary, disabled                 |
| `--accent`      | `#A51F2D` (maple red)        | the single emotional accent        |
| `--accent-2`    | `#74131D`                    | accent hover                       |
| `--accent-soft` | `rgba(165, 31, 45, 0.10)`    | accent backgrounds                 |
| `--primary`     | `#183A37` (forest)           | structural ink                     |
| `--gold`        | `#B88E3C`                    | complementary accent (sparing)     |
| `--lime`        | `#B9C46A`                    | logo glyph, bonus highlights       |
| `--gain`        | `#24745A`                    | wins, recoverable, positive deltas |
| `--loss`        | `#A51F2D`                    | losses, missed                     |

Rule: never use chart-palette tokens (`--chart-*`) in static UI.

## Type

- **Display: Instrument Serif.** Use sparingly for italics. One italic element per section.
- **Body: Inter Tight.** Default for UI and prose.
- **Numbers & codes: JetBrains Mono.** Eyebrows, monetary values in tables, kbd, ticker text.

CSS tokens: `--font-display`, `--font-sans`, `--font-mono`.

## Geometry

- Radius scale: `--radius-sm 6px` · `--radius 10px` · `--radius-lg 16px`. Cards use `--radius-lg`. Buttons and pills use `--radius` or `999px`.
- Shadow scale: `--shadow-1` (resting), `--shadow-2` (lifted), `--shadow-card` (hero artifacts). Never stack two shadows on the same element.
- Logo clear-space: keep one cap-height of `--paper` on all sides. Never place the maple glyph on accent-red or photographs without a paper plate behind it.

## Voice principles

1. **Show the math.** Don't say "save money." Say "recover $48 a month in missed rewards."
2. **Name the thing.** "Aeroplan SQC projector" beats "advanced status tools." Specificity reads as confidence.
3. **Cut the breath.** If a sentence needs an em-dash to survive, it needs two sentences instead.

Examples:

> Bad: Seamlessly unlock the power of your wallet.
> Good: See what every card actually earns. In CAD. With caps.

> Bad: Elevate your rewards game with our power-user toolkit.
> Good: Pro adds the SQC projector, the missed-rewards report, and the credit calendar.

> Bad: Leakage is baked into every wallet.
> Good: Most Canadian wallets miss $200 to $1,400 a year in rewards.

## Open questions

Flag for product owner. Not blockers, but resolve before public launch:

- **Logo not chosen.** Six explorations live under `/design/logo-explorations/`. Pick one.
- **ICON not chosen.** App icon and favicon are placeholders. Decide with logo.
- **Lifetime price.** Founding-member pricing guesses at conversion. Revisit after first cohort.
