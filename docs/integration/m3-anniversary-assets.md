# M3 Anniversary assets

## Scope and result

M3 wires the six reusable items in `public/assets/cozy_days/anniversary/manifest.json` into the anniversary UI. The same transparent cat artwork fills the hero and empty state; the other five assets supply the header sparkle/flower, title and card icon accents, and card flower/tape decoration. Card title, countdown, edit and delete actions stay unobstructed. No reference-sheet crop is used by the app.

The user authorized reuse of the already-reviewed project assets for this task. This records task authorization only; it does not assert a third-party license or independent copyright clearance. The provided anniversary reference is `public/review/anniversary-assets/reference.png` (852×1847). The nine `needs-redraw` entries remain unavailable and labeled as crops only in the review gallery.

## File and pixel audit

Browser-decoded dimensions, alpha coverage, and SHA-256 were measured from the actual files. PNG alpha coverage counts pixels with alpha exactly zero; all three PNGs also contain fully opaque pixels. SVG values are from browser rasterization at 128×128. The gallery was viewed over both light and dark checkerboards; no opaque canvas/background appears around the reusable artwork.

| Manifest item | Actual source | Dimensions | Transparent pixels | SHA-256 |
|---|---|---:|---:|---|
| cats-hugging | `raster/characters/cats_empty_state.png` | 1875×811 RGBA | 44.5474% | `96e7ea984b170bbdb78af03b74e3b3bb7360569cc706f0fd1d139c38f3bff829` |
| flower-pink | `raster/decor/flower_pink.png` | 139×138 RGBA | 44.4219% | `563d9fe84ad9482987dcad02852c3fa80326fb084f1a500cfb7a3c6231e6f5f5` |
| pink-heart | `vectors/symbols/heart_pink_outline.svg` | 128×128 viewBox | 79.3823% | `6137cc47a35ee8c05200ec41efb747efb6edb173dcedee5fa734655fb2c64927` |
| tiny-star | `vectors/symbols/star_cream.svg` | 128×128 viewBox | 55.8960% | `5d84edd7fbd1406e5cdc658c607c8a5c24607ef2aee4c52c8bfc31b79a84bd84` |
| sparkle-gold | `vectors/symbols/sparkle_gold.svg` | 128×128 viewBox | 72.1984% | `3119e0e755612e7125ad32de61168ef55b5e6e2035c5f6129931749b044fec57` |
| washi-pink | `raster/decor/washi_pink.png` | 302×179 RGBA | 46.4242% | `67d472011ab6ed8e0df6876308fe9dbceb03e210246ecb7e5b03b01c12d7b3cb` |

Every canonical resource hash agrees with `src/assets/ready-catalog.json`. The browser audit on this Windows checkout also logged hashes of the served CRLF text for the SVGs (heart `d85097dd…`, star `c725117c…`, sparkle `50e8ae3b…`); normalizing CRLF to LF reproduces the catalog and git-blob hashes above exactly. These are line-ending differences, not artwork drift. The manifest records canonical git-blob hashes so they remain stable in a Linux deployment.

## Visual and interaction evidence

Playwright rendered real app screenshots at 360×740, 393×852 and 430×932. Each screenshot set has an empty-state hero and a fully scrolled card state. `card-360.png` was reviewed against the reference: warm paper/pink palette and hand-drawn collage remain, the reusable cats occupy the hero, and the unavailable illustrated header scene remains an acknowledged visual gap. The full card is visible, its countdown is readable, and its edit control opens the editor. A geometry assertion checks that the tape does not overlap the countdown and the flower does not overlap edit/delete hit areas.

- `artifacts/integration/m3/hero-empty-{360,393,430}.png`
- `artifacts/integration/m3/card-{360,393,430}.png`
- `artifacts/integration/m3/assets-light.png` and `assets-dark.png` show the six actual assets and nine explicitly marked redraw gaps on both checkerboard backgrounds.
- Reference: `public/review/anniversary-assets/reference.png`.

The gallery reports exactly 6 ready items and 9 `needs-redraw` items. Birthday cake, graduation art, photo frames, cat paws, bow, flowers, header scene, and hand-drawn lines remain missing; the app continues to use its bundled fallback and functional card UI.

## Validation record

Source was committed before the final validation matrix; exact source SHA, serial command exits, test counts, and log hashes are recorded in `m3-results.json`. Validation order: `npm ci`, `npm run build`, `npm run build:pages`, anniversary specialist suite (including the new asset tests), existing swipe/audit/font regression set, and `npm run test:pages`. The separate full E2E suite is deferred to M5 per the integration plan. Playwright output screenshots and logs are local ignored evidence under `artifacts/integration/m3/`.
