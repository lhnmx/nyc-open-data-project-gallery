"""
Build the static data files the web app reads, from the full NYC 311 dataset (2020-present).

All heavy lifting happens server-side via SoQL $group, so we never download raw rows.

Outputs (in public/data/):
  meta.json               months, categories, last-updated, monthly city/borough totals
  zip_month_counts.json   {category_slug: {"YYYY-MM": {modzcta: count}}}
  grid/<slug>/<YYYY-MM>.json   [[lng, lat, count, boro_code], ...] complaints snapped to a GRID_SIZE
                               grid (heatmap / cluster views). boro_code matches BoroCode in
                               nyc_boroughs.geojson (1=Manhattan 2=Bronx 3=Brooklyn 4=Queens
                               5=Staten Island, 0=unspecified)
  zip_index.json          ZIP search index (count = default category, last 12 full months)

Usage:
  python scripts/build_aggregates.py            # incremental: only re-fetches recent grid months
  python scripts/build_aggregates.py --full     # rebuild every grid month
  python scripts/build_aggregates.py --workers 8   # parallel requests (default: 6 with token, 1 without)
"""

import argparse
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import socrata
from categories import CATEGORIES

OUT = socrata.OUTPUT_DIR
GRID_SIZE = 0.002  # degrees (~170m x 220m in NYC)
START_MONTH = "2020-01"
REFRESH_RECENT_MONTHS = 2  # grid months always re-fetched in incremental mode (data lags)
DEFAULT_CATEGORY = "rodent-pest"

BORO_CODES = {"Manhattan": 1, "Bronx": 2, "Brooklyn": 3, "Queens": 4, "Staten Island": 5}

BOROUGHS = {
    "MANHATTAN": "Manhattan",
    "BROOKLYN": "Brooklyn",
    "QUEENS": "Queens",
    "BRONX": "Bronx",
    "STATEN ISLAND": "Staten Island",
}


def ym_of(soql_ts: str) -> str:
    """'2025-07-01T00:00:00.000' -> '2025-07'"""
    return soql_ts[:7]


def month_range(start: str, end: str) -> list[str]:
    y, m = map(int, start.split("-"))
    ey, em = map(int, end.split("-"))
    out = []
    while (y, m) <= (ey, em):
        out.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def next_month(ym: str) -> str:
    y, m = map(int, ym.split("-"))
    return f"{y + 1:04d}-01" if m == 12 else f"{y:04d}-{m + 1:02d}"


def load_zip_lookup() -> tuple[dict[str, str], list[dict]]:
    """Map raw 5-digit ZIPs -> MODZCTA using the label/zcta lists in nyc_zips.geojson."""
    zips = json.loads((OUT / "nyc_zips.geojson").read_text())
    lookup: dict[str, str] = {}
    for f in zips["features"]:
        p = f["properties"]
        modzcta = p["modzcta"]
        for field in ("zcta", "label"):
            for z in str(p.get(field) or "").split(","):
                z = z.strip()
                if len(z) == 5 and z.isdigit():
                    lookup.setdefault(z, modzcta)
        lookup[modzcta] = modzcta
    return lookup, zips["features"]


def normalize_zip(raw) -> str | None:
    if not raw:
        return None
    z = str(raw).strip()[:5]
    return z if len(z) == 5 and z.isdigit() else None


def latest_month() -> str:
    rows = socrata.query({"$select": "max(created_date) AS mx"})
    return ym_of(rows[0]["mx"])


def build_zip_counts(cat: dict, lookup: dict[str, str]) -> tuple[dict, int]:
    rows = socrata.query_all(
        {
            "$select": "incident_zip, date_trunc_ym(created_date) AS ym, count(*) AS n",
            "$where": f"({cat['where']})",
            "$group": "incident_zip, ym",
            "$order": "ym, incident_zip",
        }
    )
    by_month: dict[str, dict[str, int]] = {}
    unmatched = 0
    for r in rows:
        n = int(r["n"])
        modzcta = lookup.get(normalize_zip(r.get("incident_zip")) or "")
        if not modzcta:
            unmatched += n
            continue
        bucket = by_month.setdefault(ym_of(r["ym"]), {})
        bucket[modzcta] = bucket.get(modzcta, 0) + n
    return by_month, unmatched


def build_totals(cat: dict) -> dict:
    rows = socrata.query_all(
        {
            "$select": "borough, date_trunc_ym(created_date) AS ym, count(*) AS n",
            "$where": f"({cat['where']})",
            "$group": "borough, ym",
            "$order": "ym, borough",
        }
    )
    totals: dict[str, dict[str, int]] = {}
    for r in rows:
        n = int(r["n"])
        t = totals.setdefault(ym_of(r["ym"]), {"all": 0})
        t["all"] += n
        boro = BOROUGHS.get(str(r.get("borough") or "").upper())
        if boro:
            t[boro] = t.get(boro, 0) + n
    return totals


def build_grid_month(cat: dict, ym: str) -> list[list[float]]:
    rows = socrata.query(
        {
            "$select": f"snap_to_grid(location, {GRID_SIZE}) AS cell, borough, count(*) AS n",
            "$where": f"({cat['where']}) AND location IS NOT NULL "
            f"AND created_date >= '{ym}-01' AND created_date < '{next_month(ym)}-01'",
            "$group": "cell, borough",
            "$limit": str(socrata.PAGE_SIZE),
        }
    )
    if len(rows) >= socrata.PAGE_SIZE:
        raise RuntimeError(f"grid result truncated for {cat['slug']} {ym}; increase GRID_SIZE")
    cells = []
    for r in rows:
        cell = r.get("cell")
        if not cell:
            continue
        lng, lat = cell["coordinates"]
        boro = BORO_CODES.get(BOROUGHS.get(str(r.get("borough") or "").upper(), ""), 0)
        cells.append([round(lng, 4), round(lat, 4), int(r["n"]), boro])
    cells.sort(key=lambda c: -c[2])
    return cells


def write_json(path: Path, data) -> None:
    # Write to a temp file then rename, so an interrupted run never leaves a truncated file
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, separators=(",", ":")))
    tmp.replace(path)


def build_zip_index(features: list[dict], zip_counts: dict, months: list[str]) -> list[dict]:
    window = months[-13:-1]  # last 12 full months (current month is partial)
    counts = zip_counts.get(DEFAULT_CATEGORY, {})
    index = []
    for f in features:
        p = f["properties"]
        if p.get("borough") == "NYC":  # non-geographic placeholder polygon(s)
            continue
        total = sum(counts.get(ym, {}).get(p["modzcta"], 0) for ym in window)
        index.append(
            {
                "zip": p["modzcta"],
                "label": p.get("label") or p["modzcta"],
                "borough": p.get("borough"),
                "count": total,
                "pop": int(float(p.get("pop_est") or 0)),
                "center": p.get("center"),
            }
        )
    index.sort(key=lambda e: -e["count"])
    return index


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--full", action="store_true", help="re-fetch every grid month")
    parser.add_argument("--skip-grid", action="store_true", help="only rebuild counts/meta")
    parser.add_argument("--workers", type=int, default=None, help="parallel API requests")
    args = parser.parse_args()

    workers = args.workers or (6 if socrata.has_token() else 1)
    if not socrata.has_token():
        print("WARNING: no NYC_OPEN_DATA_APP_TOKEN set; requests may be throttled.")

    lookup, features = load_zip_lookup()
    last = latest_month()
    months = month_range(START_MONTH, last)
    print(f"Months: {months[0]} .. {months[-1]} ({len(months)}), {workers} parallel requests")

    with ThreadPoolExecutor(max_workers=workers) as pool:
        # 1. ZIP x month and borough x month counts for every category, in parallel
        count_jobs = {c["slug"]: pool.submit(build_zip_counts, c, lookup) for c in CATEGORIES}
        total_jobs = {c["slug"]: pool.submit(build_totals, c) for c in CATEGORIES}

        # 2. Grid months that are missing (or recent / --full), in parallel
        grid_jobs = []
        if not args.skip_grid:
            recent = set(months[-REFRESH_RECENT_MONTHS:])
            for cat in CATEGORIES:
                for ym in months:
                    path = OUT / "grid" / cat["slug"] / f"{ym}.json"
                    if path.exists() and not args.full and ym not in recent:
                        continue
                    grid_jobs.append((cat["slug"], ym, path, pool.submit(build_grid_month, cat, ym)))
            print(f"Fetching {len(grid_jobs)} grid months...")

        zip_counts: dict = {}
        totals: dict = {}
        for slug, job in count_jobs.items():
            zip_counts[slug], unmatched = job.result()
            matched = sum(sum(m.values()) for m in zip_counts[slug].values())
            print(f"[{slug}] {matched:,} complaints matched to ZIP areas ({unmatched:,} without a usable ZIP)")
        for slug, job in total_jobs.items():
            totals[slug] = job.result()

        for i, (slug, ym, path, job) in enumerate(grid_jobs, 1):
            cells = job.result()
            write_json(path, cells)
            if i % 25 == 0 or i == len(grid_jobs):
                print(f"  grid {i}/{len(grid_jobs)} done ({slug} {ym}: {len(cells):,} cells)")

    write_json(OUT / "zip_month_counts.json", zip_counts)
    write_json(
        OUT / "meta.json",
        {
            "lastUpdated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "months": months,
            "partialMonth": last,
            "gridSize": GRID_SIZE,
            "categories": [{k: c[k] for k in ("label", "slug", "definition")} for c in CATEGORIES],
            "totals": totals,
        },
    )
    write_json(OUT / "zip_index.json", build_zip_index(features, zip_counts, months))
    print("Done.")


if __name__ == "__main__":
    main()
