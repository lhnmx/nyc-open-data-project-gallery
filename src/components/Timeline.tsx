import React, { useEffect, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { Period, TimelineMonth } from '../types';

interface TimelineProps {
  months: TimelineMonth[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  period: Period;
  onPeriodChange: (period: Period) => void;
  /** Human-readable label for the selected period (e.g. "Dec 2024 – Nov 2025") */
  periodLabel: string;
  sidebarOpen: boolean;
  isLight?: boolean;
}

export const Timeline: React.FC<TimelineProps> = ({
  months,
  selectedIndex,
  onSelectIndex,
  period,
  onPeriodChange,
  periodLabel,
  sidebarOpen,
  isLight = true,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Auto-play interval
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      onSelectIndex((selectedIndex + 1) % months.length);
    }, 1200);

    return () => clearInterval(interval);
  }, [isPlaying, selectedIndex, months.length, onSelectIndex]);

  const currentMonth = months[selectedIndex] || months[0];
  const label = `${periodLabel}${currentMonth?.partial ? ' (partial month)' : ''}`;

  // Year tick marks positioned along the slider (January of each year)
  const yearTicks = months
    .map((m, idx) => ({ m, idx }))
    .filter(({ m, idx }) => m.month === 1 || idx === 0);
  const pct = (idx: number) => (months.length > 1 ? (idx / (months.length - 1)) * 100 : 0);

  return (
    <div
      className={`absolute bottom-6 z-20 transition-all duration-300 pointer-events-auto ${
        sidebarOpen
          ? 'left-1/2 -translate-x-1/2 sm:left-[calc(50%+10rem)]'
          : 'left-1/2 -translate-x-1/2'
      }`}
    >
      <div
        className={`backdrop-blur-md rounded-2xl shadow-2xl border transition-all duration-300 ${
          isLight
            ? 'bg-white/95 border-slate-200/90 text-slate-800'
            : 'bg-slate-900/90 border-slate-700/80 text-slate-100'
        } ${
          isMinimized
            ? 'px-3 py-2 flex items-center gap-3 w-auto'
            : 'p-3.5 flex flex-col gap-2.5 w-[90vw] sm:w-[480px] max-w-[500px]'
        }`}
      >
        {/* Minimized View */}
        {isMinimized ? (
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`p-1.5 rounded-lg text-xs font-semibold shadow-sm transition ${
                isLight ? 'bg-blue-600 text-white' : 'bg-cyan-500 text-slate-950'
              }`}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            </button>
            <div className="flex items-center gap-1.5 text-xs font-bold">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>{label}</span>
            </div>
            <button
              onClick={() => setIsMinimized(false)}
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition ml-1"
              title="Expand timeline"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* Expanded Full View */
          <>
            {/* Top Controls Row */}
            <div className="flex items-center justify-between px-1">
              {/* Active Date Label */}
              <div className="flex items-center gap-2">
                <div
                  className={`p-1.5 rounded-lg border ${
                    isLight
                      ? 'bg-blue-50 border-blue-200 text-blue-600'
                      : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider block font-bold text-slate-400">
                    Timeline Period
                  </span>
                  <span className={`text-xs font-bold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {label}
                  </span>
                </div>
              </div>

              {/* Playback Controls & Minimize Button */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onSelectIndex(Math.max(0, selectedIndex - 1))}
                  disabled={selectedIndex === 0}
                  className={`p-1.5 rounded-lg transition disabled:opacity-30 disabled:hover:bg-transparent ${
                    isLight
                      ? 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                      : 'hover:bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                  title="Previous month"
                >
                  <SkipBack className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className={`flex items-center gap-1.5 font-semibold px-2.5 py-1 rounded-lg text-xs shadow-sm transition ${
                    isLight
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
                      : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/25'
                  }`}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3 h-3 fill-current" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3 fill-current" />
                      <span>Play</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => onSelectIndex(Math.min(months.length - 1, selectedIndex + 1))}
                  disabled={selectedIndex === months.length - 1}
                  className={`p-1.5 rounded-lg transition disabled:opacity-30 disabled:hover:bg-transparent ${
                    isLight
                      ? 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                      : 'hover:bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                  title="Next month"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </button>

                <div className="w-[1px] h-4 bg-slate-300 mx-1 opacity-60" />

                <div
                  className={`flex p-0.5 rounded-lg border text-[10px] font-semibold ${
                    isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-800 border-slate-700'
                  }`}
                  role="group"
                  aria-label="Time period"
                >
                  {(['month', '12mo'] as Period[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => onPeriodChange(p)}
                      aria-pressed={period === p}
                      className={`px-1.5 py-0.5 rounded-md transition ${
                        period === p
                          ? isLight
                            ? 'bg-white text-blue-700 shadow-sm'
                            : 'bg-slate-700 text-cyan-300 shadow-sm'
                          : isLight
                          ? 'text-slate-500 hover:text-slate-800'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title={p === 'month' ? 'Show the selected month' : 'Show the 12 months ending with the selected month'}
                    >
                      {p === 'month' ? '1 mo' : '12 mo'}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setIsMinimized(true)}
                  className={`p-1 rounded transition ${
                    isLight ? 'hover:bg-slate-100 text-slate-400 hover:text-slate-700' : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title="Minimize timeline to clear view"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrubber Track & Month Ticks */}
            <div className="relative px-1 pt-0.5">
              <input
                type="range"
                min={0}
                max={months.length - 1}
                value={selectedIndex}
                onChange={(e) => {
                  setIsPlaying(false);
                  onSelectIndex(Number(e.target.value));
                }}
                aria-label="Select month"
                aria-valuetext={label}
                className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer focus:outline-none ${
                  isLight
                    ? 'bg-slate-200 accent-blue-600'
                    : 'bg-slate-700 accent-cyan-400'
                }`}
              />

              {/* Year ticks */}
              <div className="relative h-4 mt-1 text-[9px] select-none">
                {yearTicks.map(({ m, idx }) => (
                  <button
                    key={m.ym}
                    onClick={() => {
                      setIsPlaying(false);
                      onSelectIndex(idx);
                    }}
                    style={{ left: `${pct(idx)}%` }}
                    className={`absolute -translate-x-1/2 transition font-medium ${
                      currentMonth?.year === m.year
                        ? isLight
                          ? 'text-blue-700 font-bold'
                          : 'text-cyan-400 font-bold'
                        : isLight
                        ? 'text-slate-400 hover:text-slate-700'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                    title={`Jump to ${m.label}`}
                  >
                    {m.year}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
