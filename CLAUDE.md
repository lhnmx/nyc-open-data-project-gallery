# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Columbia EDAV project for the NYC Open Data Project Gallery: an interactive web map of NYC 311 service requests (dataset `erm2-nwe9`, "311 Service Requests from 2020 to Present"). Submission rules and the 311 data dictionary are in `resources/`; key links are in `resources/sources.md`.

## Commands

Frontend (Vite + React 19 + TypeScript + Tailwind 3 + MapLibre GL):

```bash
npm install
npm run dev        # dev server
npm run build      # tsc type-check, then vite build -> dist/
npm run preview    # serve the production build
```

No linter or test suite is configured; `npm run build` (which runs `tsc`) is the correctness check.

Data ingestion (Python, managed with `uv`, requires Python >= 3.14):

```bash
cp .env.example .env                          # set NYC_OPEN_DATA_APP_TOKEN (needed for parallel requests)
python3 scripts/build_aggregates.py           # incremental refresh (re-fetches the last 2 grid months)
python3 scripts/build_aggregates.py --full    # rebuild every grid month (~10 min with a token)
python3 scripts/build_aggregates.py --skip-grid   # only counts/meta (~1 min)
```

`uv run python ...` also works where `uv` is installed. `scripts/fetch_311.py` is the legacy raw-sample fetcher (`rodent_sample.geojson`, still referenced by `R_RECREATION_GUIDE.md`); the web app no longer uses it.

Proposal / exploratory analysis (R + Quarto): `quarto render brainstrom.qmd` produces `brainstrom.html` and `brainstrom_files/` (both are committed). Note the filename is spelled `brainstrom`.

## Architecture

**Static app, no backend.** The browser only loads pre-built files from `public/data/` (resolved through `dataUrl()` in `src/data.ts`, which respects Vite's `BASE_URL`). All aggregation of the ~23M-row dataset happens server-side in Socrata via SoQL `$group`, run by `scripts/build_aggregates.py`; raw rows are never downloaded.

Data pipeline (`scripts/`):
- `socrata.py` — shared token loading (`.env`), retrying `query()` and `$offset`-paged `query_all()` (paging needs a stable `$order`; Socrata can't order by a point column, which is why grid queries are one unpaged request per month).
- `categories.py` — `CATEGORIES`: maps each app category label/slug to a SoQL `$where`. Labels must match `ComplaintCategory` in `src/types.ts`; `'All'` in the app means the sum of these categories, not all of 311.
- `build_aggregates.py` writes:
  - `meta.json` — months (`YYYY-MM`, 2020-01..current; `partialMonth` is the in-progress month), category definitions, `totals[slug][ym] = {all, <Borough>...}`
  - `zip_month_counts.json` — `[slug][ym][modzcta] = count`. Raw `incident_zip` is mapped to MODZCTA via the `zcta`/`label` lists in `nyc_zips.geojson`.
  - `grid/<slug>/<YYYY-MM>.json` — `[[lng, lat, n, boroCode], ...]` from `snap_to_grid(location, 0.002)`; boroCode matches `BoroCode` in `nyc_boroughs.geojson` (0 = unspecified). Feeds heatmap/cluster views.
  - `zip_index.json` — search index (`ZipEntry[]`); `pop` (from `pop_est`) is the denominator for per-capita rates.
- `nyc_zips.geojson` (MODZCTA polygons, `modzcta`/`label`/`zcta`/`borough`/`pop_est`/`center`) and `nyc_boroughs.geojson` (`BoroName`, `BoroCode`) are static geometry, not generated.

Frontend data flow:
- `src/App.tsx` owns one `FilterState` (`src/types.ts`: category, `month` as `YYYY-MM`, `period` month|12mo, `metric` count|rate, borough, ZIP, viz mode, map style) and loads `meta.json`.
- `src/useMapData.ts` turns filters into map inputs: per-ZIP `ZipStat`s, quantile color `breaks`, and (only in heatmap/cluster mode) a merged, borough-filtered grid `FeatureCollection`. Aggregation helpers live in `src/data.ts`; JSON loads are cached by path.
- `components/Map.tsx` is an imperative MapLibre wrapper. Choropleth values are pushed as **feature state** (`promoteId: 'modzcta'`, color expression reads `['feature-state','value']`); grid points go into a clustered GeoJSON source with `clusterProperties.sum`. `map.setStyle()` (dark/light basemap) wipes sources, layers and feature state, so `addDataLayers()` re-adds everything on `style.load` and re-applies data from the `latest` props ref. Layer event handlers are registered once at mount (`registerHandlers`) and read `latest.current` to avoid stale closures. Don't gate data updates on `map.isStyleLoaded()` — it is false while any GeoJSON source is loading.
- `components/FilterSidebar.tsx` (search, borough, category, viz mode, metric) and `components/Timeline.tsx` (month slider over `meta.months`, year ticks, 1 mo / 12 mo toggle).
- `components/StatsPanel.tsx` (rendered as the sidebar's `children`) uses `src/stats.ts`: city/borough totals come from `meta.totals` (includes complaints with no usable ZIP), ZIP totals from `zip_month_counts.json`. Year-over-year comparison is suppressed when the selection includes `meta.partialMonth`.
- The choropleth color scale is computed once per category/period/metric over **all** months (`allTimelineValues` in `src/data.ts`), not per month, so timeline playback shows real change. Don't switch it back to per-month quantiles.
- `src/urlState.ts` mirrors filters to the query string (`cat` slug, `m`, `p`, `metric`, `boro`, `zip`, `view`, `theme`; defaults omitted). `cat`/`m` are validated against `meta.json` after it loads.
- MODZCTA `99999` is a placeholder for parks/airports: no label, not selectable, drawn in the no-data color.

Known non-blocking issues are tracked in `TODO.md`.

Reset is coordinated via `handleResetView` in `App.tsx` plus an incrementing `resetKey` prop that `Map` watches to trigger the camera fly-back.

## Other

`R_RECREATION_GUIDE.md` documents a parallel R Shiny (`mapgl`/`bslib`) recreation of the same app reading the same `public/data/` files; keep data file names/schemas in mind if changing them.
