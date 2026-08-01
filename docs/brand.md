# Brand and Visual Language

## Core idea

The symbol is a small open circle of independent nodes around a square Bitcoin-block center. Lines meet at the transaction, not at a central custodian.

## Voice

Use direct, calm language:

- Preferred: "Sign one Bitcoin moment together."
- Preferred: "Three output keys authorized this transaction."
- Avoid: "Proof of attendance", "soulbound", "ownership certificate", "guaranteed forever", or "unhackable"

## Color system

| Token | Light | Dark | Use |
|---|---|---|---|
| Ink | `#13221e` | `#f3f4e8` | Primary text |
| Paper | `#f5f1e7` | `#101815` | Canvas |
| Copper | `#c45b2a` | `#f58a4d` | Primary action and Bitcoin link |
| Moss | `#315c4c` | `#75b99c` | Confirmed and safe |
| Sky | `#2f6b88` | `#72b9dc` | Pending and informational |
| Clay | `#8b3a32` | `#ef7d72` | Destructive and invalid |

Color is never the only state indicator. Text, icon shape, and accessible labels accompany it.

## Typography

Use a readable humanist sans for interface text and a restrained monospaced face for hashes and transaction details. The static site uses system fonts to avoid third-party requests and reduce fingerprinting.

## Motion

Nodes may converge once when a Circle confirms. Respect `prefers-reduced-motion`; never flash, pulse indefinitely, or animate urgency.

## Assets

Application and documentation assets are in `site/assets/`:

| File | Role |
|---|---|
| `mark.svg` | Primary scalable product mark |
| `favicon.svg` | Browser icon derived from the product mark |
| `og-card.png` | Application-bound Open Graph and press artwork, 1731 by 909 pixels |
| `og-card.svg` | Editable vector alternative for layouts that require scalable artwork |

The raster press artwork depicts six independent key nodes connected to one exact transaction. It contains no price imagery or unsupported product claim. The SVG is a separately composed vector alternative, not the generation source for the textured PNG. Preserve that distinction when making derivatives.

Product marks remain legible at 16 pixels, in monochrome, at 200 percent zoom, and on light or dark backgrounds. Press artwork must state experimental status in its accompanying copy and must never imply a token price.
