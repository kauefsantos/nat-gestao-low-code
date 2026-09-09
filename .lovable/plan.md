

## Add 6 new landing page images in an outer ring

### Steps

1. **Create 6 asset files** — Upload each of the 6 new images via `assets--create_asset` to `src/assets/landing-8.jpeg` through `src/assets/landing-13.jpeg`.

2. **Update `src/routes/index.tsx`** — Add 6 new imports and 6 new entries to `DEMO_IMAGES` with positions further from center than the existing ring. Approximate positions for the outer scatter:

```text
Existing range: roughly x: -700 to +500, y: -510 to +410
New images placed at x: -900 to +750, y: -650 to +600
```

Proposed positions (will use varied sizes similar to existing images):
- id 8: x: -920, y: -500, ~260x260 (fashion couple — top-left outer)
- id 9: x: 650, y: -500, ~280x280 (abstract orange — top-right outer)
- id 10: x: -880, y: 350, ~290x290 (woman laptop — bottom-left outer)
- id 11: x: 600, y: 400, ~250x330 (man boxes — bottom-right outer)
- id 12: x: -350, y: -700, ~270x400 (water lilies — top-center outer)
- id 13: x: 450, y: 500, ~240x400 (fashion crosswalk — bottom-right far)

### Technical details

- **Files changed**: `src/routes/index.tsx` only (plus 6 new `.asset.json` files created by the asset tool)
- No database or backend changes needed
- Images will be visible on larger screens when users pan or zoom slightly; they sit just outside the initial viewport ring

