/**
 * Loading + aggregation of the static files in public/data/ (built by scripts/build_aggregates.py).
 */
import type { FeatureCollection, Point } from 'geojson';
import type {
  Borough,
  ComplaintCategory,
  Meta,
  Metric,
  Period,
  TimelineMonth,
  ZipEntry,
  ZipMonthCounts,
  ZipStat,
} from './types';

/** Resolve a file in public/data/ against Vite's base path (works when deployed under a sub-path). */
export const dataUrl = (path: string) => `${import.meta.env.BASE_URL}data/${path}`;

/** ZIP areas with fewer residents than this get no per-capita rate (parks, airports, etc.) */
export const MIN_POP_FOR_RATE = 1000;

/** BoroCode in nyc_boroughs.geojson / grid files */
export const BORO_CODES: Record<Exclude<Borough, 'All'>, number> = {
  Manhattan: 1,
  Bronx: 2,
  Brooklyn: 3,
  Queens: 4,
  'Staten Island': 5,
};

const cache = new Map<string, Promise<unknown>>();
function loadJson<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const p = fetch(dataUrl(path)).then((res) => {
      if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
      return res.json();
    });
    // Don't cache failures, so a later call can retry
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path) as Promise<T>;
}

export const loadMeta = () => loadJson<Meta>('meta.json');
export const loadZipCounts = () => loadJson<ZipMonthCounts>('zip_month_counts.json');
export const loadZipIndex = () => loadJson<ZipEntry[]>('zip_index.json');
/** [lng, lat, count, boroCode][] */
const loadGridMonth = (slug: string, ym: string) => loadJson<[number, number, number, number][]>(`grid/${slug}/${ym}.json`);

// ---------------------------------------------------------------------------

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function toTimelineMonths(meta: Meta): TimelineMonth[] {
  return meta.months.map((ym) => {
    const [year, month] = ym.split('-').map(Number);
    return {
      ym,
      label: formatMonth(ym),
      shortLabel: MONTH_NAMES[month - 1],
      year,
      month,
      partial: ym === meta.partialMonth,
    };
  });
}

/** Most recent complete month — the sensible default view. */
export function defaultMonth(meta: Meta): string {
  const ms = meta.months;
  return ms[ms.length - 1] === meta.partialMonth && ms.length > 1 ? ms[ms.length - 2] : ms[ms.length - 1];
}

/** Months covered by the current selection. */
export function periodMonths(meta: Meta, ym: string, period: Period): string[] {
  const i = meta.months.indexOf(ym);
  if (i < 0) return [];
  return period === 'month' ? [ym] : meta.months.slice(Math.max(0, i - 11), i + 1);
}

export function periodLabel(meta: Meta, ym: string, period: Period): string {
  const ms = periodMonths(meta, ym, period);
  if (ms.length === 0) return '';
  if (ms.length === 1) return formatMonth(ms[0]);
  return `${formatMonth(ms[0])} – ${formatMonth(ms[ms.length - 1])}`;
}

export function categorySlugs(meta: Meta, category: ComplaintCategory): string[] {
  if (category === 'All') return meta.categories.map((c) => c.slug);
  const match = meta.categories.find((c) => c.label === category);
  return match ? [match.slug] : [];
}

// ---------------------------------------------------------------------------

export function computeZipStats(
  zipCounts: ZipMonthCounts,
  zipIndex: ZipEntry[],
  slugs: string[],
  months: string[],
  metric: Metric
): Record<string, ZipStat> {
  const stats: Record<string, ZipStat> = {};
  for (const z of zipIndex) {
    let count = 0;
    for (const slug of slugs) {
      const byMonth = zipCounts[slug];
      if (!byMonth) continue;
      for (const ym of months) count += byMonth[ym]?.[z.zip] ?? 0;
    }
    const value =
      metric === 'count' ? count : z.pop >= MIN_POP_FOR_RATE ? (count / z.pop) * 10_000 : null;
    stats[z.zip] = { count, pop: z.pop, value };
  }
  return stats;
}

/**
 * Values for every ZIP in every month of the timeline (each month's value covers its period
 * window). Used to build ONE color scale per category/period/metric, so colors stay comparable
 * while scrubbing or playing the timeline.
 */
export function allTimelineValues(
  meta: Meta,
  zipCounts: ZipMonthCounts,
  zipIndex: ZipEntry[],
  slugs: string[],
  period: Period,
  metric: Metric
): number[] {
  const values: number[] = [];
  for (const ym of meta.months) {
    if (ym === meta.partialMonth) continue; // partial month would skew the scale low
    const stats = computeZipStats(zipCounts, zipIndex, slugs, periodMonths(meta, ym, period), metric);
    for (const s of Object.values(stats)) if (s.value !== null) values.push(s.value);
  }
  return values;
}

/**
 * Class breaks for the choropleth: quantiles of the non-zero values, so the colors stay
 * informative regardless of category, period or metric. Returns ascending, de-duplicated
 * thresholds (up to `classes - 1` of them).
 */
export function quantileBreaks(values: number[], classes = 5): number[] {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (v.length === 0) return [];
  const breaks: number[] = [];
  for (let k = 1; k < classes; k++) {
    const q = v[Math.min(v.length - 1, Math.floor((k / classes) * v.length))];
    const rounded = niceRound(q);
    if (rounded > 0 && (breaks.length === 0 || rounded > breaks[breaks.length - 1])) breaks.push(rounded);
  }
  return breaks;
}

function niceRound(x: number): number {
  if (x >= 100) return Math.round(x / 10) * 10;
  if (x >= 10) return Math.round(x);
  if (x >= 1) return Math.round(x * 10) / 10;
  return Math.round(x * 100) / 100;
}

// ---------------------------------------------------------------------------

export interface GridProps {
  n: number;
  boro: number;
}

/**
 * Merge the grid files for the selected categories x months into one point collection,
 * optionally restricted to one borough. Cells at the same location are summed.
 */
export async function loadGridFeatures(
  slugs: string[],
  months: string[],
  borough: Borough
): Promise<FeatureCollection<Point, GridProps>> {
  const files = await Promise.all(
    slugs.flatMap((slug) => months.map((ym) => loadGridMonth(slug, ym).catch(() => [])))
  );
  const boroFilter = borough === 'All' ? null : BORO_CODES[borough];
  const merged = new Map<string, [number, number, number, number]>();
  for (const cells of files) {
    for (const [lng, lat, n, boro] of cells) {
      if (boroFilter !== null && boro !== boroFilter) continue;
      const key = `${lng},${lat},${boro}`;
      const existing = merged.get(key);
      if (existing) existing[2] += n;
      else merged.set(key, [lng, lat, n, boro]);
    }
  }
  return {
    type: 'FeatureCollection',
    features: Array.from(merged.values(), ([lng, lat, n, boro]) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [lng, lat] },
      properties: { n, boro },
    })),
  };
}

/** Value at the given percentile (0-1) of an unsorted array. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const v = [...values].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(p * v.length))];
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
