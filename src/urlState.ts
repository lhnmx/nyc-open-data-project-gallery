/**
 * Keep the current view in the URL query string so it can be shared or bookmarked.
 *   ?cat=rodent-pest&m=2025-07&p=12mo&metric=count&boro=Brooklyn&zip=11213&view=heatmap&theme=dark
 * Defaults are omitted to keep links short.
 */
import { categorySlugs } from './data';
import type { Borough, ComplaintCategory, FilterState, Meta, Metric, Period, VizMode } from './types';

const BOROUGHS: Borough[] = ['All', 'Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];
const VIEWS: VizMode[] = ['choropleth', 'heatmap', 'clusters'];

export interface UrlState {
  filters: Partial<FilterState>;
  /** category slug / month need meta.json to validate, so they're resolved later */
  categorySlug: string | null;
  month: string | null;
}

export function readUrl(): UrlState {
  const q = new URLSearchParams(window.location.search);
  const filters: Partial<FilterState> = {};

  const p = q.get('p');
  if (p === 'month' || p === '12mo') filters.period = p as Period;
  const metric = q.get('metric');
  if (metric === 'count' || metric === 'rate') filters.metric = metric as Metric;
  const boro = q.get('boro');
  if (boro && (BOROUGHS as string[]).includes(boro)) filters.borough = boro as Borough;
  const zip = q.get('zip');
  if (zip && /^\d{5}$/.test(zip)) {
    filters.selectedZip = zip;
    filters.searchQuery = zip;
  }
  const view = q.get('view');
  if (view && (VIEWS as string[]).includes(view)) filters.vizMode = view as VizMode;
  const theme = q.get('theme');
  if (theme === 'dark' || theme === 'light') filters.mapStyle = theme;

  return { filters, categorySlug: q.get('cat'), month: q.get('m') };
}

/** Resolve the meta-dependent parts of the URL (unknown values fall back to the defaults). */
export function resolveUrlCategory(meta: Meta, slug: string | null): ComplaintCategory | null {
  if (!slug) return null;
  if (slug === 'all') return 'All';
  return meta.categories.find((c) => c.slug === slug)?.label ?? null;
}

export function resolveUrlMonth(meta: Meta, month: string | null): string | null {
  return month && meta.months.includes(month) ? month : null;
}

export function writeUrl(filters: FilterState, meta: Meta, defaults: { month: string; category: ComplaintCategory }) {
  const q = new URLSearchParams();
  if (filters.category !== defaults.category) {
    q.set('cat', filters.category === 'All' ? 'all' : categorySlugs(meta, filters.category)[0] ?? '');
  }
  if (filters.month && filters.month !== defaults.month) q.set('m', filters.month);
  if (filters.period !== 'month') q.set('p', filters.period);
  if (filters.metric !== 'rate') q.set('metric', filters.metric);
  if (filters.borough !== 'All') q.set('boro', filters.borough);
  if (filters.selectedZip) q.set('zip', filters.selectedZip);
  if (filters.vizMode !== 'choropleth') q.set('view', filters.vizMode);
  if (filters.mapStyle !== 'light') q.set('theme', filters.mapStyle);

  const search = q.toString();
  const url = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
  if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(null, '', url);
  }
}
