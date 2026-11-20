import { useCallback, useEffect, useMemo, useState } from 'react';
import { Map } from './components/Map';
import { FilterSidebar } from './components/FilterSidebar';
import { Timeline } from './components/Timeline';
import { StatsPanel } from './components/StatsPanel';
import { AboutModal } from './components/AboutModal';
import { Borough, FilterState, Meta } from './types';
import { defaultMonth, loadMeta, periodLabel, toTimelineMonths } from './data';
import { useMapData } from './useMapData';
import { readUrl, resolveUrlCategory, resolveUrlMonth, writeUrl } from './urlState';

const DEFAULT_FILTERS: Omit<FilterState, 'mapStyle' | 'month'> = {
  searchQuery: '',
  selectedZip: null,
  borough: 'All',
  category: 'Rodent / Pest',
  period: 'month',
  metric: 'rate',
  vizMode: 'choropleth',
};

// Read once at startup; month/category are validated after meta.json loads
const initialUrl = readUrl();

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    ...DEFAULT_FILTERS,
    month: '',
    mapStyle: 'light',
    ...initialUrl.filters,
  });
  const [resetKey, setResetKey] = useState(0);
  const closeAbout = useCallback(() => setAboutOpen(false), []);

  useEffect(() => {
    loadMeta()
      .then((m) => {
        setMeta(m);
        setFilters((prev) => ({
          ...prev,
          month: prev.month || resolveUrlMonth(m, initialUrl.month) || defaultMonth(m),
          category: resolveUrlCategory(m, initialUrl.categorySlug) ?? prev.category,
        }));
      })
      .catch((e) => setMetaError(String(e)));
  }, []);

  // Mirror the view into the URL so it can be shared
  useEffect(() => {
    if (meta && filters.month) {
      writeUrl(filters, meta, { month: defaultMonth(meta), category: DEFAULT_FILTERS.category });
    }
  }, [meta, filters]);

  const mapData = useMapData(meta, filters);
  const timelineMonths = useMemo(() => (meta ? toTimelineMonths(meta) : []), [meta]);
  const selectedIndex = meta ? Math.max(0, meta.months.indexOf(filters.month)) : 0;
  const label = meta && filters.month ? periodLabel(meta, filters.month, filters.period) : '';
  const categoryLabel = filters.category === 'All' ? 'All tracked complaint types' : filters.category;

  const isLight = filters.mapStyle === 'light';

  const handleResetView = () => {
    setFilters((prev) => ({
      ...DEFAULT_FILTERS,
      month: meta ? defaultMonth(meta) : prev.month,
      mapStyle: prev.mapStyle,
    }));
    setResetKey((k) => k + 1);
  };

  const selectZip = (zip: string, boro?: string) =>
    setFilters((prev) => ({
      ...prev,
      selectedZip: zip,
      searchQuery: zip,
      borough: (boro as Borough) || prev.borough,
    }));

  const selectBorough = (boro: Borough) => setFilters((prev) => ({ ...prev, borough: boro, selectedZip: null, searchQuery: '' }));

  const error = metaError ?? mapData.error;

  return (
    <div className={`relative w-screen h-screen overflow-hidden font-sans transition-colors duration-300 ${
      isLight ? 'bg-slate-100 text-slate-800' : 'bg-slate-950 text-slate-100'
    }`}>
      {/* 1. Map Canvas */}
      <Map
        mapStyle={filters.mapStyle}
        vizMode={filters.vizMode}
        sidebarOpen={sidebarOpen}
        selectedBorough={filters.borough}
        selectedZip={filters.selectedZip}
        resetKey={resetKey}
        metric={filters.metric}
        zipStats={mapData.zipStats}
        breaks={mapData.breaks}
        grid={mapData.grid}
        periodLabel={label}
        categoryLabel={categoryLabel}
        gridSize={meta?.gridSize ?? 0.002}
        loading={!meta || mapData.loading}
        onSelectBorough={selectBorough}
        onSelectZip={selectZip}
        onResetView={handleResetView}
      />

      {/* 2. Filter Sidebar with Search + stats */}
      <FilterSidebar
        filters={filters}
        setFilters={setFilters}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        onResetView={handleResetView}
        onOpenAbout={() => setAboutOpen(true)}
        zipStats={mapData.zipStats}
        periodLabel={label}
      >
        {meta && filters.month && (
          <StatsPanel
            meta={meta}
            data={mapData}
            filters={filters}
            periodLabel={label}
            isLight={isLight}
            onSelectZip={selectZip}
            onSelectBorough={selectBorough}
            onSelectMonth={(ym) => setFilters((prev) => ({ ...prev, month: ym }))}
          />
        )}
      </FilterSidebar>

      {/* 3. Interactive Timeline */}
      {timelineMonths.length > 0 && (
        <Timeline
          months={timelineMonths}
          selectedIndex={selectedIndex}
          onSelectIndex={(i) => setFilters((prev) => ({ ...prev, month: timelineMonths[i]?.ym ?? prev.month }))}
          period={filters.period}
          onPeriodChange={(period) => setFilters((prev) => ({ ...prev, period }))}
          periodLabel={label}
          sidebarOpen={sidebarOpen}
          isLight={isLight}
        />
      )}

      {aboutOpen && <AboutModal meta={meta} isLight={isLight} onClose={closeAbout} />}

      {error && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold shadow-lg">
          Couldn't load map data. Try refreshing the page.
        </div>
      )}
    </div>
  );
}

export default App;
