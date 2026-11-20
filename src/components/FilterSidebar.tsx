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
  RotateCcw,
  Ban,
  Users,
  Hash,
  Info,
  Link2,
  Check,
} from 'lucide-react';
import { Borough, ComplaintCategory, FilterState, Metric, VizMode, ZipEntry, ZipStat } from '../types';
import { loadZipIndex } from '../data';

interface FilterSidebarProps {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSelectZipLocation?: (entry: ZipEntry) => void;
  onResetView?: () => void;
  onOpenAbout?: () => void;
  /** Stats panel, rendered below the filters */
  children?: React.ReactNode;
  /** Per-ZIP numbers for the current selection */
  zipStats: Record<string, ZipStat>;
  periodLabel: string;
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
    label: 'Blocked Driveway',
    icon: <Ban className="w-4 h-4" />,
    lightColor: 'bg-sky-50 text-sky-800 border-sky-300 ring-1 ring-sky-400/40',
    darkColor: 'bg-sky-500/20 text-sky-400 border-sky-500/30 ring-1 ring-sky-500/40',
  },
  {
    label: 'Sanitation / Dirty Conditions',
    icon: <Trash2 className="w-4 h-4" />,
    lightColor: 'bg-yellow-50 text-yellow-800 border-yellow-300 ring-1 ring-yellow-400/40',
    darkColor: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30 ring-1 ring-yellow-500/40',
  },
];

const CATEGORY_DISPLAY: Partial<Record<ComplaintCategory, string>> = { All: 'All tracked types' };

const METRIC_OPTIONS: { id: Metric; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'rate', label: 'Per 10k residents', icon: <Users className="w-3.5 h-3.5" />, hint: 'Fair comparison between ZIPs of different sizes' },
  { id: 'count', label: 'Total complaints', icon: <Hash className="w-3.5 h-3.5" />, hint: 'Raw number of 311 complaints' },
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
  onResetView,
  zipStats,
  periodLabel,
  onOpenAbout,
  children,
}) => {
  const isLight = filters.mapStyle === 'light';
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copyLink = async () => {
    const url = window.location.href;
    // Async clipboard API can reject (or hang) without focus/permission; fall back to execCommand
    const viaApi = () =>
      Promise.race([
        navigator.clipboard.writeText(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
      ]);
    const viaTextarea = () => {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (!ok) throw new Error('execCommand failed');
    };
    let state: 'copied' | 'failed' = 'copied';
    try {
      if (typeof navigator.clipboard?.writeText === "function") await viaApi();
      else viaTextarea();
    } catch {
      try {
        viaTextarea();
      } catch {
        state = 'failed';
      }
    }
    setCopyState(state);
    setTimeout(() => setCopyState('idle'), 2500);
  };
  const [zipList, setZipList] = useState<ZipEntry[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Load zip index
  useEffect(() => {
    loadZipIndex()
      .then((data) => setZipList(data))
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
              onClick={onOpenAbout}
              className={`p-1.5 rounded-md transition ${
                isLight
                  ? 'hover:bg-slate-100 text-slate-600 hover:text-blue-600'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-cyan-400'
              }`}
              title="About this map & data"
              aria-label="About this map & data"
            >
              <Info className="w-4 h-4" />
            </button>
            <button
              onClick={copyLink}
              className={`p-1.5 rounded-md transition ${
                isLight
                  ? 'hover:bg-slate-100 text-slate-600 hover:text-blue-600'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-cyan-400'
              }`}
              title="Copy link to this view"
              aria-label="Copy link to this view"
            >
              {copyState === 'copied' ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
            </button>
            {onResetView && (
              <button
                onClick={onResetView}
                className={`p-1.5 rounded-md transition ${
                  isLight
                    ? 'hover:bg-slate-100 text-slate-600 hover:text-blue-600'
                    : 'hover:bg-slate-800 text-slate-400 hover:text-cyan-400'
                }`}
                title="Reset All Filters & View"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
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

        {copyState !== 'idle' && (
          <div
            role="status"
            className={`px-4 py-1.5 text-[11px] font-medium border-b ${
              isLight ? 'bg-blue-50 text-blue-800 border-blue-100' : 'bg-cyan-500/10 text-cyan-300 border-slate-800'
            }`}
          >
            {copyState === 'copied'
              ? 'Link to this view copied.'
              : "Couldn't copy automatically — copy the address bar to share this view."}
          </div>
        )}

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

            {/* Metric toggle (choropleth only) */}
            {filters.vizMode === 'choropleth' && (
              <div className="mt-2">
                <div className={`grid grid-cols-2 p-1 rounded-lg border gap-1 ${
                  isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-800/80 border-slate-700'
                }`}>
                  {METRIC_OPTIONS.map((opt) => {
                    const isSelected = filters.metric === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setFilters((prev) => ({ ...prev, metric: opt.id }))}
                        aria-pressed={isSelected}
                        title={opt.hint}
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
                <p className="text-[10px] text-slate-400 mt-1 px-0.5">
                  {METRIC_OPTIONS.find((o) => o.id === filters.metric)?.hint}
                </p>
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
                    <span
                      className="text-[11px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded"
                      title={periodLabel}
                    >
                      {(zipStats[item.zip]?.count ?? 0).toLocaleString()} complaints
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
                      <span>{CATEGORY_DISPLAY[cat.label] ?? cat.label}</span>
                    </div>
                    {isSelected && (
                      <span className={`w-2 h-2 rounded-full ${isLight ? 'bg-blue-600' : 'bg-cyan-400'} animate-pulse`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Stats for the current selection */}
          {children}

          {/* Reset View Button */}
          {onResetView && (
            <button
              onClick={onResetView}
              className={`w-full py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                isLight
                  ? 'bg-slate-100/80 hover:bg-slate-200/80 text-slate-700 border-slate-200'
                  : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to City Overview</span>
            </button>
          )}
        </div>

        {/* Footer info */}
        <div className={`p-3 border-t text-[11px] text-center ${
          isLight ? 'border-slate-200 text-slate-500 bg-slate-50/50' : 'border-slate-800 text-slate-500'
        }`}>
          Data:{' '}
          <a
            href="https://data.cityofnewyork.us/d/erm2-nwe9"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-blue-600"
          >
            NYC Open Data · 311 Service Requests (2020–present)
          </a>
        </div>
      </aside>
    </>
  );
};
