/**
 * Summary statistics for the stats panel. City/borough numbers come from meta.totals (every complaint,
 * including ones without a usable ZIP); ZIP numbers come from zip_month_counts.json.
 */
import { MIN_POP_FOR_RATE, periodMonths } from './data';
import type { Borough, Meta, Metric, Period, ZipEntry, ZipMonthCounts, ZipStat } from './types';

export const BOROUGH_LIST: Exclude<Borough, 'All'>[] = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];

/** The area the panel describes: a ZIP, a borough, or the whole city. */
export interface Area {
  zip?: string | null;
  borough: Borough;
}

function monthTotal(meta: Meta, zipCounts: ZipMonthCounts, slugs: string[], ym: string, area: Area): number {
  let total = 0;
  for (const slug of slugs) {
    if (area.zip) total += zipCounts[slug]?.[ym]?.[area.zip] ?? 0;
    else total += meta.totals[slug]?.[ym]?.[area.borough === 'All' ? 'all' : area.borough] ?? 0;
  }
  return total;
}

/** Complaints in `area` summed over `months`. */
export function areaTotal(meta: Meta, zipCounts: ZipMonthCounts, slugs: string[], months: string[], area: Area): number {
  return months.reduce((sum, ym) => sum + monthTotal(meta, zipCounts, slugs, ym, area), 0);
}

/** One value per month of the timeline (monthly complaints in `area`). */
export function monthlySeries(meta: Meta, zipCounts: ZipMonthCounts, slugs: string[], area: Area): number[] {
  return meta.months.map((ym) => monthTotal(meta, zipCounts, slugs, ym, area));
}

/** Same window one year earlier, or null if it falls before the data starts. */
export function previousYearMonths(meta: Meta, ym: string, period: Period): string[] | null {
  const i = meta.months.indexOf(ym);
  if (i - 12 < 0) return null;
  const prev = periodMonths(meta, meta.months[i - 12], period);
  const expected = period === 'month' ? 1 : 12;
  return prev.length === expected ? prev : null;
}

/** Fractional change (0.12 = +12%), or null when there is no meaningful base. */
export function pctChange(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null;
  return (current - previous) / previous;
}

export function areaPopulation(zipIndex: ZipEntry[], area: Area): number {
  if (area.zip) return zipIndex.find((z) => z.zip === area.zip)?.pop ?? 0;
  return zipIndex
    .filter((z) => area.borough === 'All' || z.borough === area.borough)
    .reduce((sum, z) => sum + z.pop, 0);
}

export interface RankedZip {
  zip: string;
  borough: string;
  count: number;
  value: number;
}

/** Highest ZIPs by the current metric, within the selected borough. */
export function topZips(
  zipStats: Record<string, ZipStat>,
  zipIndex: ZipEntry[],
  borough: Borough,
  n = 5
): RankedZip[] {
  return zipIndex
    .filter((z) => borough === 'All' || z.borough === borough)
    .map((z) => ({ zip: z.zip, borough: z.borough, count: zipStats[z.zip]?.count ?? 0, value: zipStats[z.zip]?.value ?? -1 }))
    .filter((z) => z.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

export interface BoroughStat {
  borough: Exclude<Borough, 'All'>;
  count: number;
  /** count or per-10k rate, matching the metric */
  value: number;
}

export function boroughBreakdown(
  meta: Meta,
  zipCounts: ZipMonthCounts,
  zipIndex: ZipEntry[],
  slugs: string[],
  months: string[],
  metric: Metric
): BoroughStat[] {
  return BOROUGH_LIST.map((borough) => {
    const count = areaTotal(meta, zipCounts, slugs, months, { borough });
    const pop = areaPopulation(zipIndex, { borough });
    const value = metric === 'count' ? count : pop >= MIN_POP_FOR_RATE ? (count / pop) * 10_000 : 0;
    return { borough, count, value };
  });
}
