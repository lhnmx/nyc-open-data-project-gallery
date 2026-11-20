import { useEffect, useMemo, useState } from 'react';
import type { FeatureCollection, Point } from 'geojson';
import {
  GridProps,
  allTimelineValues,
  categorySlugs,
  computeZipStats,
  loadGridFeatures,
  loadZipCounts,
  loadZipIndex,
  periodMonths,
  quantileBreaks,
} from './data';
import type { FilterState, Meta, ZipEntry, ZipMonthCounts, ZipStat } from './types';

export interface MapData {
  zipCounts: ZipMonthCounts | null;
  zipIndex: ZipEntry[];
  /** category slugs and months covered by the current selection */
  slugs: string[];
  months: string[];
  zipStats: Record<string, ZipStat>;
  breaks: number[];
  grid: FeatureCollection<Point, GridProps> | null;
  loading: boolean;
  error: string | null;
}

const EMPTY_GRID: FeatureCollection<Point, GridProps> = { type: 'FeatureCollection', features: [] };

/** Derives everything the map needs from the current filters. */
export function useMapData(meta: Meta | null, filters: FilterState): MapData {
  const [zipCounts, setZipCounts] = useState<ZipMonthCounts | null>(null);
  const [zipIndex, setZipIndex] = useState<ZipEntry[]>([]);
  const [grid, setGrid] = useState<FeatureCollection<Point, GridProps> | null>(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadZipCounts(), loadZipIndex()])
      .then(([counts, index]) => {
        setZipCounts(counts);
        setZipIndex(index);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const slugs = useMemo(() => (meta ? categorySlugs(meta, filters.category) : []), [meta, filters.category]);
  const months = useMemo(
    () => (meta && filters.month ? periodMonths(meta, filters.month, filters.period) : []),
    [meta, filters.month, filters.period]
  );

  const zipStats = useMemo(
    () => (zipCounts ? computeZipStats(zipCounts, zipIndex, slugs, months, filters.metric) : {}),
    [zipCounts, zipIndex, slugs, months, filters.metric]
  );

  // One scale for the whole timeline (not per month), so playback shows real change over time
  const breaks = useMemo(
    () =>
      meta && zipCounts
        ? quantileBreaks(allTimelineValues(meta, zipCounts, zipIndex, slugs, filters.period, filters.metric))
        : [],
    [meta, zipCounts, zipIndex, slugs, filters.period, filters.metric]
  );

  // Grid points are only needed for the heatmap / cluster views
  const needsGrid = filters.vizMode !== 'choropleth';
  useEffect(() => {
    if (!needsGrid || slugs.length === 0 || months.length === 0) return;
    let cancelled = false;
    setGridLoading(true);
    loadGridFeatures(slugs, months, filters.borough)
      .then((fc) => !cancelled && setGrid(fc))
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setGridLoading(false));
    return () => {
      cancelled = true;
    };
  }, [needsGrid, slugs, months, filters.borough]);

  return {
    zipCounts,
    zipIndex,
    slugs,
    months,
    zipStats,
    breaks,
    grid: needsGrid ? grid ?? EMPTY_GRID : null,
    loading: !zipCounts || (needsGrid && gridLoading),
    error,
  };
}
