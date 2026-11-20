import React, { useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatMonth } from '../data';
import {
  Area,
  areaPopulation,
  areaTotal,
  boroughBreakdown,
  monthlySeries,
  pctChange,
  previousYearMonths,
  topZips,
} from '../stats';
import type { MapData } from '../useMapData';
import type { Borough, FilterState, Meta } from '../types';

interface StatsPanelProps {
  meta: Meta;
  data: MapData;
  filters: FilterState;
  periodLabel: string;
  isLight: boolean;
  onSelectZip: (zip: string, borough: string) => void;
  onSelectBorough: (borough: Borough) => void;
  onSelectMonth: (ym: string) => void;
}

const fmtInt = (n: number) => Math.round(n).toLocaleString();
const fmtRate = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });

export const StatsPanel: React.FC<StatsPanelProps> = ({
  meta,
  data,
  filters,
  periodLabel,
  isLight,
  onSelectZip,
  onSelectBorough,
  onSelectMonth,
}) => {
  const { zipCounts, zipIndex, slugs, months, zipStats } = data;
  const area: Area = { zip: filters.selectedZip, borough: filters.borough };
  const accent = isLight ? '#2563eb' : '#22d3ee';
  const muted = isLight ? 'text-slate-500' : 'text-slate-400';
  const strong = isLight ? 'text-slate-900' : 'text-white';
  const card = isLight ? 'bg-slate-50/80 border-slate-200/90' : 'bg-slate-800/40 border-slate-700/50';

  const stats = useMemo(() => {
    if (!zipCounts) return null;
    const total = areaTotal(meta, zipCounts, slugs, months, area);
    const prevMonths = previousYearMonths(meta, filters.month, filters.period);
    const prevTotal = prevMonths ? areaTotal(meta, zipCounts, slugs, prevMonths, area) : null;
    const pop = areaPopulation(zipIndex, area);
    return {
      total,
      rate: pop > 0 ? (total / pop) * 10_000 : null,
      change: pctChange(total, prevTotal),
      prevLabel: prevMonths
        ? prevMonths.length === 1
          ? formatMonth(prevMonths[0])
          : `${formatMonth(prevMonths[0])} – ${formatMonth(prevMonths[prevMonths.length - 1])}`
        : null,
      series: monthlySeries(meta, zipCounts, slugs, area),
      boroughs: boroughBreakdown(meta, zipCounts, zipIndex, slugs, months, filters.metric),
    };
  }, [meta, zipCounts, zipIndex, slugs, months, filters.month, filters.period, filters.metric, area.zip, area.borough]);

  const ranked = useMemo(() => topZips(zipStats, zipIndex, filters.borough), [zipStats, zipIndex, filters.borough]);

  if (!stats) return null;

  const areaName = filters.selectedZip
    ? `ZIP ${filters.selectedZip}`
    : filters.borough === 'All'
    ? 'New York City'
    : filters.borough;
  const includesPartial = months.includes(meta.partialMonth);
  const metricLabel = filters.metric === 'rate' ? 'per 10k residents' : 'complaints';
  const fmtMetric = filters.metric === 'rate' ? fmtRate : fmtInt;

  return (
    <div className={`p-3.5 rounded-xl border space-y-4 ${card}`}>
      {/* Headline */}
      <div>
        <div className={`text-[10px] uppercase tracking-wider font-bold ${muted}`}>{areaName}</div>
        <div className={`text-[11px] ${muted}`}>{periodLabel}</div>
        <div className="flex items-baseline gap-2 mt-1.5">
          <span className={`text-2xl font-bold tabular-nums tracking-tight ${strong}`}>{fmtInt(stats.total)}</span>
          <span className={`text-xs ${muted}`}>complaints</span>
        </div>
        <div className={`text-xs mt-0.5 ${muted}`}>
          {stats.rate !== null ? (
            <>
              <span className={`font-semibold tabular-nums ${strong}`}>{fmtRate(stats.rate)}</span> per 10k residents
            </>
          ) : (
            'No residential population'
          )}
        </div>
        <ChangeLine change={includesPartial ? null : stats.change} prevLabel={stats.prevLabel} partial={includesPartial} muted={muted} strong={strong} />
      </div>

      {/* Trend */}
      <div>
        <div className={`text-[10px] uppercase tracking-wider font-bold mb-1 ${muted}`}>Monthly complaints, 2020–now</div>
        <Sparkline
          series={stats.series}
          months={meta.months}
          selected={months}
          partialMonth={meta.partialMonth}
          color={accent}
          isLight={isLight}
          onSelectMonth={onSelectMonth}
        />
      </div>

      {/* Top ZIPs */}
      {!filters.selectedZip && ranked.length > 0 && (
        <div>
          <div className={`text-[10px] uppercase tracking-wider font-bold mb-1.5 ${muted}`}>
            Highest ZIPs · {metricLabel}
          </div>
          <BarList
            rows={ranked.map((z) => ({
              key: z.zip,
              label: z.zip,
              sublabel: z.borough,
              value: z.value,
              display: fmtMetric(z.value),
              title: `${z.zip} (${z.borough}): ${fmtInt(z.count)} complaints`,
              onClick: () => onSelectZip(z.zip, z.borough),
            }))}
            color={accent}
            isLight={isLight}
          />
        </div>
      )}

      {/* Boroughs */}
      <div>
        <div className={`text-[10px] uppercase tracking-wider font-bold mb-1.5 ${muted}`}>By borough · {metricLabel}</div>
        <BarList
          rows={[...stats.boroughs]
            .sort((a, b) => b.value - a.value)
            .map((b) => ({
              key: b.borough,
              label: b.borough,
              value: b.value,
              display: fmtMetric(b.value),
              title: `${b.borough}: ${fmtInt(b.count)} complaints`,
              dimmed: filters.borough !== 'All' && filters.borough !== b.borough,
              onClick: () => onSelectBorough(b.borough),
            }))}
          color={accent}
          isLight={isLight}
        />
      </div>
    </div>
  );
};

// ------------------------------------------------------------------------------------

const ChangeLine: React.FC<{
  change: number | null;
  prevLabel: string | null;
  partial: boolean;
  muted: string;
  strong: string;
}> = ({ change, prevLabel, partial, muted, strong }) => {
  if (partial) {
    return <div className={`text-[11px] mt-1.5 ${muted}`}>Includes the current, incomplete month — no year-over-year comparison.</div>;
  }
  if (change === null || !prevLabel) {
    return <div className={`text-[11px] mt-1.5 ${muted}`}>No comparison period available.</div>;
  }
  const pct = Math.round(change * 100);
  // Neutral ink + arrow: more complaints isn't automatically "bad" (it can mean more reporting)
  const Icon = pct > 0 ? ArrowUpRight : pct < 0 ? ArrowDownRight : Minus;
  return (
    <div className={`flex items-center gap-1 text-[11px] mt-1.5 ${muted}`}>
      <Icon className={`w-3.5 h-3.5 ${strong}`} aria-hidden />
      <span className={`font-semibold tabular-nums ${strong}`}>
        {pct > 0 ? '+' : ''}
        {pct}%
      </span>
      <span>vs {prevLabel}</span>
    </div>
  );
};

// ------------------------------------------------------------------------------------

interface SparklineProps {
  series: number[];
  months: string[];
  /** months in the current selection (shaded) */
  selected: string[];
  partialMonth: string;
  color: string;
  isLight: boolean;
  onSelectMonth: (ym: string) => void;
}

const SPARK_H = 56;

const Sparkline: React.FC<SparklineProps> = ({ series, months, selected, partialMonth, color, isLight, onSelectMonth }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const n = series.length;
  const max = Math.max(1, ...series);
  // x in 0..100 (viewBox units, stretched to width); y in px
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 0);
  const y = (v: number) => SPARK_H - 4 - (v / max) * (SPARK_H - 8);

  // Draw the last (partial) month dashed so its drop doesn't read as a real decline
  const partialIdx = months.indexOf(partialMonth);
  const solidEnd = partialIdx > 0 ? partialIdx - 1 : n - 1;
  const path = (from: number, to: number) =>
    series
      .slice(from, to + 1)
      .map((v, k) => `${k === 0 ? 'M' : 'L'}${x(from + k)},${y(v)}`)
      .join(' ');

  const selStart = months.indexOf(selected[0]);
  const selEnd = months.indexOf(selected[selected.length - 1]);

  const indexAt = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || n === 0) return null;
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(t * (n - 1));
  };

  const hoverLeftPct = hover !== null ? x(hover) : 0;

  return (
    <div
      ref={ref}
      className="relative cursor-pointer select-none"
      style={{ height: SPARK_H }}
      onMouseMove={(e) => setHover(indexAt(e.clientX))}
      onMouseLeave={() => setHover(null)}
      onClick={(e) => {
        const i = indexAt(e.clientX);
        if (i !== null) onSelectMonth(months[i]);
      }}
      role="img"
      aria-label={`Monthly complaints from ${formatMonth(months[0])} to ${formatMonth(months[n - 1])}; peak ${max.toLocaleString()}. Click to jump to a month.`}
    >
      <svg width="100%" height={SPARK_H} viewBox={`0 0 100 ${SPARK_H}`} preserveAspectRatio="none" className="block overflow-visible">
        {selStart >= 0 && (
          <rect
            x={x(selStart) - (selStart === selEnd ? 0.6 : 0)}
            width={Math.max(1.2, x(selEnd) - x(selStart))}
            y={0}
            height={SPARK_H}
            fill={color}
            opacity={0.14}
          />
        )}
        <line x1={0} x2={100} y1={SPARK_H - 4} y2={SPARK_H - 4} stroke={isLight ? '#e2e8f0' : '#334155'} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={path(0, solidEnd)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {partialIdx > 0 && (
          <path d={path(partialIdx - 1, partialIdx)} fill="none" stroke={color} strokeWidth={2} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        )}
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={0} y2={SPARK_H} stroke={isLight ? '#94a3b8' : '#64748b'} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
      </svg>

      {hover !== null && (
        <>
          {/* Marker drawn in HTML so it stays round despite the stretched SVG */}
          <span
            className="absolute w-2 h-2 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${hoverLeftPct}%`, top: y(series[hover]), background: color, boxShadow: `0 0 0 2px ${isLight ? '#fff' : '#0f172a'}` }}
          />
          <div
            className={`absolute -top-9 px-2 py-1 rounded-md text-[10px] whitespace-nowrap shadow-md pointer-events-none border ${
              isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'
            }`}
            style={{
              left: `${hoverLeftPct}%`,
              transform: `translateX(${hoverLeftPct > 70 ? '-100%' : hoverLeftPct < 30 ? '0' : '-50%'})`,
            }}
          >
            <span className="font-semibold">{formatMonth(months[hover])}</span>
            {months[hover] === partialMonth ? ' (partial)' : ''}: {series[hover].toLocaleString()}
          </div>
        </>
      )}

      <div className={`flex justify-between text-[9px] mt-0.5 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
        <span>{months[0]?.slice(0, 4)}</span>
        <span>{months[n - 1]?.slice(0, 4)}</span>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------------------------

interface BarRow {
  key: string;
  label: string;
  sublabel?: string;
  value: number;
  display: string;
  title: string;
  dimmed?: boolean;
  onClick: () => void;
}

const BarList: React.FC<{ rows: BarRow[]; color: string; isLight: boolean }> = ({ rows, color, isLight }) => {
  const max = Math.max(1e-9, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.key}>
          <button
            onClick={r.onClick}
            title={r.title}
            className={`w-full text-left rounded-md px-1 py-0.5 transition ${isLight ? 'hover:bg-slate-200/60' : 'hover:bg-slate-700/50'} ${
              r.dimmed ? 'opacity-50' : ''
            }`}
          >
            <div className="flex items-baseline justify-between text-[11px]">
              <span className={isLight ? 'text-slate-700' : 'text-slate-200'}>
                <span className="font-semibold">{r.label}</span>
                {r.sublabel && <span className={`ml-1 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>{r.sublabel}</span>}
              </span>
              <span className={`tabular-nums font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>{r.display}</span>
            </div>
            <div className={`h-1.5 rounded-full mt-0.5 ${isLight ? 'bg-slate-200' : 'bg-slate-700'}`}>
              <div className="h-1.5 rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
};
