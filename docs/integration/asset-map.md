# Asset map and review state

This is an inventory for integration planning, not a quality, licensing, or copyright approval. Existing source manifests and files remain authoritative; re-check actual paths and provenance before each visual integration milestone.

- Anniversary manifest availability: 6 assets available; 9 missing. M3 integrated and visually audited the six available assets; see `m3-anniversary-assets.md`.
- Period manifest availability: 8 image assets available; 11 needs-redraw entries remain, plus 3 functional icons supplied by existing app components.
- Asset file paths exist in this worktree. Presence alone does not establish source rights, suitability, transparency quality, or visual acceptance. The user authorized reuse of reviewed project assets for M3/M4; this is not a claim of third-party licensing.
- Existing `src/assets/manifest.ts` maps the registered assets used by the app. `src/assets/ready-catalog.json` provides dimensions, alpha metadata, source names and hashes for catalogued assets.

| UI role / feature | Current mapped assets | Status |
|---|---|---|
| Shared page header/background | `bedroom_header`, `paper_texture` | Paths/catalog entries present; visual/licensing review pending |
| Shared character and empty state | `cats_header`, `cats_empty_state` | Present; suitability and rights review pending |
| Shared symbols/decor | `sparkle_gold`, `heart_pink_outline`, `star_cream`, `washi_pink`, `flower_pink`, `cherries_simple`, `sprout` | Present; do not infer approval from manifest status |
| Task cards | `task_book`, `task_stretch` | Present; existing todo UI remains frozen |
| Stationery accents | `book_open_decor`, `books_upright`, `pencil_cup` | Present; intended use needs feature-level review |
| Anniversary header / empty state | `cats_empty_state` | M3: transparent project art reused in both slots; full header-scene illustration remains a documented gap |
| Anniversary header / card accents | `sparkle_gold`, `flower_pink`, `heart_pink_outline`, `star_cream`, `washi_pink` | M3: integrated in hero and cards; light/dark checkerboard, real pixel alpha/hash, and three viewport screenshots recorded in `m3-anniversary-assets.md` |
| Period header / journal / calendar / tips | `cats_header`, `cats_empty_state`, `star`, `sparkle`, `heart`, `tape`, `flower`, `book` | M4: eight existing project assets integrated through `<Asset>` with its bundled fallback; source dimensions, pixel alpha and hashes recorded in `m4-period-assets.md` |
| Period functional icons | Existing calendar, mood and bell SVG components | M4: reused the current `lucide-react` icon components; no raster icon substitutes added |
| Original edge illustrations | `original_plant`, `original_cheer`, `original_books_bubble`, `original_peeking_cat` | Cataloged; approval/provenance in evidence must be checked; visual quality remains to review |
| Anniversary needs-redraw set | 9 of 15 manifest items | M3: retain as missing; reference crops remain clearly labeled in the review gallery and are not app art |
| Period needs-redraw set | 11 entries | M4: retained as explicit gaps; the three functional icon roles continue to use existing SVG components |

A later asset review should record each manifest item, actual path, dimensions, alpha behavior, hash, source/license evidence, background contrast, screen slot, and screenshot evidence. Never substitute a reference-sheet crop for a finished transparent asset or claim rights/quality without evidence.
