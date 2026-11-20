export type Borough = 'All' | 'Manhattan' | 'Brooklyn' | 'Queens' | 'Bronx' | 'Staten Island';

// Labels must match `label` in scripts/categories.py ('All' = sum of every tracked category)
export type ComplaintCategory =
  | 'All'
  | 'Rodent / Pest'
  | 'Noise - Residential'
  | 'Heat & Hot Water'
  | 'Illegal Parking'
  | 'Blocked Driveway'
  | 'Sanitation / Dirty Conditions';

export type VizMode = 'choropleth' | 'heatmap' | 'clusters';

/** 'month' = the selected month only; '12mo' = the 12 months ending with the selected month */
export type Period = 'month' | '12mo';

/** 'count' = raw complaints; 'rate' = complaints per 10,000 residents */
export type Metric = 'count' | 'rate';

export interface FilterState {
  searchQuery: string;
  selectedZip?: string | null;
  borough: Borough;
  category: ComplaintCategory;
  /** 'YYYY-MM' (empty until meta.json has loaded) */
  month: string;
  period: Period;
  metric: Metric;
  mapStyle: 'dark' | 'light';
  vizMode: VizMode;
}

export interface TimelineMonth {
  ym: string;
  label: string;
  shortLabel: string;
  year: number;
  month: number;
  partial?: boolean;
}

export interface ZipEntry {
  zip: string;
  label: string;
  borough: string;
  count: number;
  pop: number;
  center: [number, number];
}

// ---- Static data files produced by scripts/build_aggregates.py ----

export interface CategoryMeta {
  label: Exclude<ComplaintCategory, 'All'>;
  slug: string;
  definition: string;
}

export interface Meta {
  lastUpdated: string;
  months: string[];
  partialMonth: string;
  gridSize: number;
  categories: CategoryMeta[];
  /** totals[slug][ym] = { all, Manhattan, Brooklyn, ... } */
  totals: Record<string, Record<string, Record<string, number>>>;
}

/** zipCounts[slug][ym][modzcta] = count */
export type ZipMonthCounts = Record<string, Record<string, Record<string, number>>>;

/** Per-ZIP numbers for the current filter selection */
export interface ZipStat {
  count: number;
  pop: number;
  /** value shown on the map for the current metric; null = not meaningful (e.g. tiny population) */
  value: number | null;
}
