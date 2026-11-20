# TODO / Known issues

Running list of smaller issues found while testing. Roadmap phases live in the project plan; this file is for
follow-ups that aren't blocking.

## Map polish (found in browser testing, 2026-11-19)

- **Heatmap breaks into dots at street level.** Grid cells are ~220 m apart (`GRID_SIZE = 0.002` in
  `scripts/build_aggregates.py`), so above ~zoom 14 the heatmap shows separate blobs instead of a continuous
  surface. Options: grow `heatmap-radius` faster with zoom in `Map.tsx`, cap the heatmap layer's `maxzoom`
  and hand off to the cluster/point view, or use a finer grid (bigger files).
- **Heatmap still saturates for dense 12-month selections** (e.g. Heat & Hot Water, Bronx, 12 mo). The
  intensity damping in `applyGrid` (`Map.tsx`) scales by cell count only; it doesn't account for the
  much larger per-cell counts in a 12-month window. Consider normalizing by total complaints too.
- **Out-of-borough ZIPs are very dark in dark mode.** With a borough selected, other ZIPs drop to 0.12
  opacity over the dark basemap and read as near-black. Consider a higher dim opacity or a desaturated
  fill for dark mode (`choroplethOpacityExpr` in `Map.tsx`).

## Content

- **Team credits** for the About panel (`src/components/AboutModal.tsx`) — add the team members' names
  (and any links) once confirmed.
- **Population source citation.** The About panel says population comes from the estimates in the MODZCTA
  boundary file (`pop_est` in `public/data/nyc_zips.geojson`). Confirm where that file came from (likely
  NYC DOHMH's MODZCTA dataset, ACS-based) and cite it specifically.
- **Copy-link success path is untested in automation.** In the automated Chrome session both the
  clipboard API and the `execCommand` fallback fail (no focus / user gesture), so only the failure
  message was verified. Check a real click copies the link.
