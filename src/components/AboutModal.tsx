import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { Meta } from '../types';
import { formatMonth } from '../data';

interface AboutModalProps {
  meta: Meta | null;
  isLight: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ meta, isLight, onClose }) => {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const updated = meta ? new Date(meta.lastUpdated).toLocaleDateString(undefined, { dateStyle: 'long' }) : null;
  const h = `text-sm font-bold mt-5 mb-1.5 ${isLight ? 'text-slate-900' : 'text-white'}`;
  const link = isLight ? 'text-blue-700 underline' : 'text-cyan-400 underline';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="about-title">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl border shadow-2xl p-6 text-[13px] leading-relaxed ${
          isLight ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-900 border-slate-700 text-slate-300'
        }`}
      >
        <button
          ref={closeRef}
          onClick={onClose}
          className={`absolute top-4 right-4 p-1.5 rounded-md transition ${isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800'}`}
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 id="about-title" className={`text-lg font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
          About NYC 311 Explorer
        </h2>
        <p className="mt-2">
          Explore where and when New Yorkers report common quality-of-life problems to 311 — rats, noise, missing heat,
          parking and sanitation — by ZIP code, borough and month since January 2020.
        </p>

        <h3 className={h}>Data</h3>
        <p>
          Source:{' '}
          <a className={link} href="https://data.cityofnewyork.us/d/erm2-nwe9" target="_blank" rel="noreferrer">
            311 Service Requests from 2020 to Present
          </a>{' '}
          on NYC Open Data
          {meta && (
            <>
              , covering {formatMonth(meta.months[0])} – {formatMonth(meta.partialMonth)} (the latest month is still in
              progress)
            </>
          )}
          .{updated && <> Last refreshed {updated}.</>}
        </p>
        <p className="mt-2">
          Counts are aggregated directly by the NYC Open Data API; individual requests are not stored. ZIP codes are
          shown as Modified ZIP Code Tabulation Areas (MODZCTA), which group a few small ZIPs together. Population for
          per-capita rates comes from the population estimates included with the MODZCTA boundary file.
        </p>

        <h3 className={h}>Complaint types</h3>
        {meta ? (
          <dl className="space-y-1.5">
            {meta.categories.map((c) => (
              <div key={c.slug}>
                <dt className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>{c.label}</dt>
                <dd>{c.definition}</dd>
              </div>
            ))}
            <div>
              <dt className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>All tracked types</dt>
              <dd>The sum of the categories above — not every 311 complaint.</dd>
            </div>
          </dl>
        ) : (
          <p>Loading…</p>
        )}

        <h3 className={h}>How to read the map</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Per 10k residents</strong> divides complaints by population so large and small ZIPs can be compared.
            ZIP areas with fewer than 1,000 residents (parks, airports, industrial land) aren't given a rate.
          </li>
          <li>
            Colors use one scale for the whole timeline, so you can play through the months and see real change —
            seasonal patterns included.
          </li>
          <li>
            Heatmap and cluster views place complaints on a ~
            {meta ? Math.round((meta.gridSize * 111_000) / 10) * 10 : 220}m grid, not at exact addresses.
          </li>
        </ul>

        <h3 className={h}>Caveats</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            311 measures <em>reporting</em>, not how often problems actually happen. Neighborhoods differ in how likely
            residents are to call, so a high count can reflect engaged residents as much as a worse problem.
          </li>
          <li>The same problem is often reported more than once; duplicates are not removed.</li>
          <li>
            A small share of requests has no usable ZIP code or location. They are included in city and borough totals
            but can't be placed on the map.
          </li>
          <li>Category definitions are our own groupings of 311 complaint types (listed above).</li>
        </ul>

        <p className={`mt-5 text-[11px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
          A Columbia University EDAV project for the NYC Open Data Project Gallery.
        </p>
      </div>
    </div>
  );
};
