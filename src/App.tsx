import { useState } from 'react';
import { Map } from './components/Map';
import { FilterSidebar } from './components/FilterSidebar';
import { Timeline } from './components/Timeline';
import { FilterState, TimelineMonth } from './types';

// Generate 12 months for the timeline (e.g. 2024)
const SAMPLE_MONTHS: TimelineMonth[] = [
  { label: 'January 2024', shortLabel: 'Jan', year: 2024, month: 1 },
  { label: 'February 2024', shortLabel: 'Feb', year: 2024, month: 2 },
  { label: 'March 2024', shortLabel: 'Mar', year: 2024, month: 3 },
  { label: 'April 2024', shortLabel: 'Apr', year: 2024, month: 4 },
  { label: 'May 2024', shortLabel: 'May', year: 2024, month: 5 },
  { label: 'June 2024', shortLabel: 'Jun', year: 2024, month: 6 },
  { label: 'July 2024', shortLabel: 'Jul', year: 2024, month: 7 },
  { label: 'August 2024', shortLabel: 'Aug', year: 2024, month: 8 },
  { label: 'September 2024', shortLabel: 'Sep', year: 2024, month: 9 },
  { label: 'October 2024', shortLabel: 'Oct', year: 2024, month: 10 },
  { label: 'November 2024', shortLabel: 'Nov', year: 2024, month: 11 },
  { label: 'December 2024', shortLabel: 'Dec', year: 2024, month: 12 },
];

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    selectedZip: null,
    borough: 'All',
    category: 'Rodent / Pest',
    selectedMonthIndex: 6, // Default to July (peak season)
    mapStyle: 'light', // Light mode default
    vizMode: 'choropleth', // Choropleth default
  });
  const [resetKey, setResetKey] = useState(0);

  const isLight = filters.mapStyle === 'light';

  const handleResetView = () => {
    setFilters((prev) => ({
      searchQuery: '',
      selectedZip: null,
      borough: 'All',
      category: 'Rodent / Pest',
      selectedMonthIndex: 6,
      mapStyle: prev.mapStyle,
      vizMode: 'choropleth',
    }));
    setResetKey((k) => k + 1);
  };

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
        onSelectBorough={(boro) =>
          setFilters((prev) => ({ ...prev, borough: boro, selectedZip: null }))
        }
        onSelectZip={(zip, boro) =>
          setFilters((prev) => ({
            ...prev,
            selectedZip: zip,
            searchQuery: zip,
            borough: (boro as any) || prev.borough,
          }))
        }
        onResetView={handleResetView}
      />

      {/* 2. Filter Sidebar with Search */}
      <FilterSidebar
        filters={filters}
        setFilters={setFilters}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        onResetView={handleResetView}
      />

      {/* 3. Interactive Timeline */}
      <Timeline
        months={SAMPLE_MONTHS}
        selectedIndex={filters.selectedMonthIndex}
        onSelectIndex={(newIndex) =>
          setFilters((prev) => ({
            ...prev,
            selectedMonthIndex: newIndex,
          }))
        }
        sidebarOpen={sidebarOpen}
        isLight={isLight}
      />
    </div>
  );
}

export default App;
