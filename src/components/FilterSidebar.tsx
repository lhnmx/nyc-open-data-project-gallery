import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  X,
  MapPin,
  Bug,
  Volume2,
  Flame,
  Car,
  Trash2,
  Layers,
  Map as MapIcon,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { Borough, ComplaintCategory, FilterState, VizMode, ZipEntry } from '../types';

interface FilterSidebarProps {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSelectZipLocation?: (entry: ZipEntry) => void;
}

const BOROUGHS: Borough[] = ['All', 'Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];

const CATEGORIES: { label: ComplaintCategory; icon: React.ReactNode; lightColor: string; darkColor: string }[] = [
  {
    label: 'All',
    icon: <Layers className="w-4 h-4" />,
    lightColor: 'bg-blue-50 text-blue-700 border-blue-300 ring-1 ring-blue-400/40',
    darkColor: 'bg-blue-500/20 text-blue-400 border-blue-500/30 ring-1 ring-blue-500/40',
  },
  {
    label: 'Rodent / Pest',
    icon: <Bug className="w-4 h-4" />,
    lightColor: 'bg-amber-50 text-amber-800 border-amber-300 ring-1 ring-amber-400/40',
    darkColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30 ring-1 ring-amber-500/40',
  },
  {
    label: 'Noise - Residential',
    icon: <Volume2 className="w-4 h-4" />,
    lightColor: 'bg-purple-50 text-purple-700 border-purple-300 ring-1 ring-purple-400/40',
    darkColor: 'bg-purple-500/20 text-purple-400 border-purple-500/30 ring-1 ring-purple-500/40',
  },
  {
    label: 'Heat & Hot Water',
    icon: <Flame className="w-4 h-4" />,
    lightColor: 'bg-red-50 text-red-700 border-red-300 ring-1 ring-red-400/40',
    darkColor: 'bg-red-500/20 text-red-400 border-red-500/30 ring-1 ring-red-500/40',
  },
  {
    label: 'Illegal Parking',
    icon: <Car className="w-4 h-4" />,
    lightColor: 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-400/40',
    darkColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 ring-1 ring-emerald-500/40',
  },
  {
    label: 'Sanitation / Dirty Conditions',
    icon: <Trash2 className="w-4 h-4" />,
    lightColor: 'bg-yellow-50 text-yellow-800 border-yellow-300 ring-1 ring-yellow-400/40',
    darkColor: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30 ring-1 ring-yellow-500/40',
  },
];

const VIZ_OPTIONS: { id: VizMode; label: string; icon: React.ReactNode }[] = [
  { id: 'choropleth', label: 'Choropleth', icon: <MapIcon className="w-3.5 h-3.5" /> },
  { id: 'heatmap', label: 'Heatmap', icon: <Flame className="w-3.5 h-3.5" /> },
  { id: 'clusters', label: 'Clusters', icon: <Layers className="w-3.5 h-3.5" /> },
];

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
  filters,
  setFilters,
  isOpen,
  setIsOpen,
  onSelectZipLocation,
}) => {
  const isLight = filters.mapStyle === 'light';
  const [zipList, setZipList] = useState<ZipEntry[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Load zip index
  useEffect(() => {
    fetch('/data/zip_index.json')
      .then((res) => res.json())
      .then((data: ZipEntry[]) => setZipList(data))
      .catch((err) => console.error('Error loading zip index:', err));
  }, []);

  // Filter suggestions
  const q = filters.searchQuery.trim().toLowerCase();
  const suggestions = q.length > 0
    ? zipList.filter(
        (item) =>
          item.zip.toLowerCase().includes(q) ||
          item.label.toLowerCase().includes(q) ||
          item.borough.toLowerCase().includes(q)
      ).slice(0, 6)
    : [];

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectEntry = (entry: ZipEntry) => {
    setFilters((prev) => ({
      ...prev,
      searchQuery: entry.zip,
      selectedZip: entry.zip,
      borough: entry.borough as Borough,
    }));
    setShowSuggestions(false);
    if (onSelectZipLocation) {
      onSelectZipLocation(entry);
    }
  };

  const handleClearSearch = () => {
    setFilters((prev) => ({
      ...prev,
      searchQuery: '',
      selectedZip: null,
    }));
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && suggestions.length > 0) {
      handleSelectEntry(suggestions[0]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <>
      {/* Toggle button when closed */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={`absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-2 rounded-lg border shadow-lg backdrop-blur-md transition ${
            isLight
              ? 'bg-white/95 hover:bg-slate-50 text-slate-700 border-slate-200'
              : 'bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-slate-700'
          }`}
          title="Open filters"
        >
          <Layers className={`w-4 h-4 ${isLight ? 'text-blue-600' : 'text-cyan-400'}`} />
          <span className="text-sm font-medium">Filters & Layers</span>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>
      )}

      {/* Sidebar Panel */}
      <aside
        className={`absolute top-0 left-0 bottom-0 z-30 w-80 sm:w-96 backdrop-blur-md border-r shadow-2xl flex flex-col transition-all duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } ${
          isLight
            ? 'bg-white/95 border-slate-200 text-slate-800'
            : 'bg-slate-900/95 border-slate-800 text-slate-100'
        }`}
      >
        {/* Header */}
        <div className={`p-4 border-b flex items-center justify-between ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-md ${
              isLight
                ? 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-blue-500/20'
                : 'bg-gradient-to-tr from-cyan-500 to-blue-600 text-white shadow-cyan-500/20'
            }`}>
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h1 className={`text-base font-bold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                NYC 311 Explorer
              </h1>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Open Data Project Gallery</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  mapStyle: prev.mapStyle === 'light' ? 'dark' : 'light',
                }))
              }
              className={`p-1.5 rounded-md transition ${
                isLight
                  ? 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title={isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            >
              {isLight ? <Moon className="w-4 h-4 text-slate-600" /> : <Sun className="w-4 h-4 text-amber-400" />}
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className={`p-1.5 rounded-md transition ${
                isLight
                  ? 'hover:bg-slate-100 text-slate-500 hover:text-slate-900'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
              title="Collapse sidebar"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Filters Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* 1. Visualization Mode */}
          <div>
            <label className={`text-xs font-bold uppercase tracking-wider mb-1.5 block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Map View Layer
            </label>
            <div className={`grid grid-cols-3 p-1 rounded-lg border gap-1 ${
              isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-800/80 border-slate-700'
            }`}>
              {VIZ_OPTIONS.map((opt) => {
                const isSelected = filters.vizMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setFilters((prev) => ({ ...prev, vizMode: opt.id }))}
                    className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-md text-[11px] font-semibold transition ${
                      isSelected
                        ? isLight
                          ? 'bg-white text-blue-700 shadow-sm'
                          : 'bg-slate-700 text-cyan-300 shadow-sm'
                        : isLight
                        ? 'text-slate-600 hover:text-slate-900'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {opt.icon}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            {/* In-Sidebar Choropleth Scale */}
            {filters.vizMode === 'choropleth' && (
              <div className={`mt-2 p-2 rounded-lg border text-xs ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/50 border-slate-700/60'
              }`}>
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex justify-between">
                  <span>Complaint Scale</span>
                  <span className="text-slate-400 font-normal">Complaints/ZIP</span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <div className="flex flex-col items-center">
                    <span className="w-5 h-2.5 rounded-sm bg-slate-200 border border-slate-300" />
                    <span className="text-[9px] mt-0.5 text-slate-500">0</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="w-5 h-2.5 rounded-sm bg-yellow-200 border border-yellow-300" />
                    <span className="text-[9px] mt-0.5 text-slate-500">1-5</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="w-5 h-2.5 rounded-sm bg-amber-400 border border-amber-500" />
                    <span className="text-[9px] mt-0.5 text-slate-500">6-15</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="w-5 h-2.5 rounded-sm bg-orange-400 border border-orange-500" />
                    <span className="text-[9px] mt-0.5 text-slate-500">16-30</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="w-5 h-2.5 rounded-sm bg-red-400 border border-red-500" />
                    <span className="text-[9px] mt-0.5 text-slate-500">31-45</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="w-5 h-2.5 rounded-sm bg-red-600 border border-red-700" />
                    <span className="text-[9px] mt-0.5 text-slate-500">45+</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. Interactive Search Box with Suggestions */}
          <div ref={searchContainerRef} className="relative">
            <label className={`text-xs font-bold uppercase tracking-wider mb-1.5 block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Search ZIP or Borough
            </label>
            <div className="relative">
              <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
              <input
                type="text"
                placeholder="Type ZIP code (e.g. 10025, 11201)..."
                value={filters.searchQuery}
                onFocus={() => setShowSuggestions(true)}
                onChange={(e) => {
                  setFilters((prev) => ({ ...prev, searchQuery: e.target.value }));
                  setShowSuggestions(true);
                }}
                onKeyDown={handleKeyDown}
                className={`w-full pl-9 pr-8 py-2 rounded-lg text-sm transition focus:outline-none focus:ring-2 ${
                  isLight
                    ? 'bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-blue-500 focus:ring-blue-500/20'
                    : 'bg-slate-800/80 border border-slate-700 text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:ring-cyan-500/40'
                }`}
              />
              {filters.searchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-200/60 text-slate-400 hover:text-slate-600 transition"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div
                className={`absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border shadow-xl overflow-hidden backdrop-blur-md max-h-56 overflow-y-auto ${
                  isLight
                    ? 'bg-white/95 border-slate-200 text-slate-800 divide-y divide-slate-100'
                    : 'bg-slate-900/95 border-slate-700 text-slate-200 divide-y divide-slate-800'
                }`}
              >
                {suggestions.map((item) => (
                  <button
                    key={item.zip}
                    onClick={() => handleSelectEntry(item)}
                    className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between transition ${
                      isLight ? 'hover:bg-blue-50/80' : 'hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                      <div>
                        <span className="font-bold">{item.zip}</span>
                        <span className="text-[11px] text-slate-400 ml-1.5">({item.borough})</span>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                      {item.count} complaints
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 3. Borough Selector */}
          <div>
            <label className={`text-xs font-bold uppercase tracking-wider mb-2 block flex items-center justify-between ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              <span>Borough</span>
              <MapPin className="w-3.5 h-3.5 opacity-60" />
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {BOROUGHS.map((b) => {
                const isSelected = filters.borough === b;
                return (
                  <button
                    key={b}
                    onClick={() => setFilters((prev) => ({ ...prev, borough: b, selectedZip: null }))}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border text-left transition ${
                      isSelected
                        ? isLight
                          ? 'bg-blue-50 text-blue-700 border-blue-400 font-semibold shadow-sm ring-1 ring-blue-300/40'
                          : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                        : isLight
                        ? 'bg-slate-100/70 text-slate-600 border-slate-200 hover:bg-slate-200/60 hover:text-slate-900'
                        : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {b}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Complaint Category */}
          <div>
            <label className={`text-xs font-bold uppercase tracking-wider mb-2 block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Complaint Type
            </label>
            <div className="space-y-1.5">
              {CATEGORIES.map((cat) => {
                const isSelected = filters.category === cat.label;
                const activeColor = isLight ? cat.lightColor : cat.darkColor;

                return (
                  <button
                    key={cat.label}
                    onClick={() => setFilters((prev) => ({ ...prev, category: cat.label }))}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium transition ${
                      isSelected
                        ? `${activeColor} font-semibold shadow-sm`
                        : isLight
                        ? 'bg-slate-50/70 border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                        : 'bg-slate-800/40 border-slate-700/40 text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {cat.icon}
                      <span>{cat.label}</span>
                    </div>
                    {isSelected && (
                      <span className={`w-2 h-2 rounded-full ${isLight ? 'bg-blue-600' : 'bg-cyan-400'} animate-pulse`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Metric Summary Card */}
          <div className={`p-3.5 rounded-xl border space-y-2 ${
            isLight
              ? 'bg-slate-50/80 border-slate-200/90 text-slate-600'
              : 'bg-slate-800/40 border-slate-700/50 text-slate-400'
          }`}>
            <div className="flex items-center justify-between text-xs">
              <span>View Mode</span>
              <span className={`font-semibold capitalize ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>
                {filters.vizMode}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span>Selected Area</span>
              <span className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                {filters.selectedZip ? `ZIP ${filters.selectedZip}` : filters.borough}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span>Complaint Focus</span>
              <span className={`font-semibold ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>{filters.category}</span>
            </div>
            <div className={`pt-2 border-t flex items-center justify-between ${isLight ? 'border-slate-200' : 'border-slate-700/60'}`}>
              <span className="text-xs">Data Coverage</span>
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                isLight
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}>
                ● 178 NYC ZIP Codes
              </span>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className={`p-3 border-t text-[11px] text-center ${
          isLight ? 'border-slate-200 text-slate-500 bg-slate-50/50' : 'border-slate-800 text-slate-500'
        }`}>
          NYC Open Data 311 Socrata API
        </div>
      </aside>
    </>
  );
};
