import React, { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import { Loader2, RotateCcw } from 'lucide-react';
import { Borough, Metric, VizMode, ZipStat } from '../types';
import { GridProps, dataUrl, escapeHtml, loadZipIndex, percentile } from '../data';

interface MapProps {
  mapStyle: 'dark' | 'light';
  vizMode: VizMode;
  sidebarOpen: boolean;
  selectedBorough: Borough;
  selectedZip?: string | null;
  resetKey?: number;
  metric: Metric;
  zipStats: Record<string, ZipStat>;
  breaks: number[];
  grid: FeatureCollection<Point, GridProps> | null;
  periodLabel: string;
  categoryLabel: string;
  gridSize: number;
  loading?: boolean;
  onSelectBorough?: (borough: Borough) => void;
  onSelectZip?: (zip: string, boro?: string) => void;
  onResetView?: () => void;
}

const STYLES = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
};

const BOROUGH_BOUNDS: Record<string, [number, number, number]> = {
  Manhattan: [-73.9712, 40.7831, 11.5],
  Brooklyn: [-73.9442, 40.6782, 11],
  Queens: [-73.7949, 40.7282, 10.5],
  Bronx: [-73.8648, 40.8448, 11],
  'Staten Island': [-74.1502, 40.5795, 11],
  All: [-73.96, 40.73, 10.5],
};

/** MODZCTA placeholder for parks, airports and other non-residential land */
const NON_RESIDENTIAL_ZIP = '99999';

/** Sidebar width (Tailwind w-96) — keeps fly-to targets centered in the visible map area */
const SIDEBAR_PX = 384;

const gridMeters = (gridSize: number) => Math.round((gridSize * 111_000) / 10) * 10;

/** Sequential choropleth palette, lightest to darkest */
const CHORO_COLORS = ['#fef08a', '#fcd34d', '#fb923c', '#f87171', '#dc2626'];
const zeroColor = (isLight: boolean) => (isLight ? '#f1f5f9' : '#1e293b');
const noDataColor = (isLight: boolean) => (isLight ? '#cbd5e1' : '#64748b');

/** Colors used for `breaks.length + 1` classes (darkest end of the palette when there are fewer). */
const classColors = (breaks: number[]) => CHORO_COLORS.slice(CHORO_COLORS.length - (breaks.length + 1));

function choroplethColorExpr(breaks: number[], isLight: boolean): maplibregl.ExpressionSpecification {
  const colors = classColors(breaks);
  const stops: (number | string)[] = [0, zeroColor(isLight), 1e-9, colors[0]];
  breaks.forEach((b, i) => stops.push(b, colors[i + 1]));
  return [
    'step',
    ['coalesce', ['feature-state', 'value'], -1],
    noDataColor(isLight),
    ...stops,
  ] as unknown as maplibregl.ExpressionSpecification;
}

function choroplethOpacityExpr(borough: Borough): maplibregl.ExpressionSpecification {
  return [
    'case',
    ['boolean', ['feature-state', 'hover'], false],
    0.92,
    borough === 'All' ? true : ['==', ['get', 'borough'], borough],
    0.75,
    0.12,
  ] as unknown as maplibregl.ExpressionSpecification;
}

const formatValue = (v: number, metric: Metric) =>
  metric === 'count' ? Math.round(v).toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 1 });

/** Scale numbers for the heatmap / clusters derived from the current grid. */
function gridScale(grid: FeatureCollection<Point, GridProps> | null) {
  const ns = grid ? grid.features.map((f) => f.properties.n) : [];
  const total = ns.reduce((a, b) => a + b, 0);
  const cellMax = Math.max(2, percentile(ns, 0.97));
  const t1 = Math.max(2, Math.round(total / 150));
  const t2 = Math.max(t1 + 1, Math.round(total / 30));
  return { total, cellMax, t1, t2 };
}

export const Map: React.FC<MapProps> = (props) => {
  const {
    mapStyle,
    vizMode,
    sidebarOpen,
    selectedBorough,
    selectedZip,
    resetKey,
    metric,
    zipStats,
    breaks,
    grid,
    periodLabel,
    categoryLabel,
    loading,
    onResetView,
  } = props;

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const hoveredZipIdRef = useRef<number | string | null>(null);
  // Always-current props for event handlers and style reloads (avoids stale closures)
  const latest = useRef(props);
  latest.current = props;

  // ----------------------------------------------------------------------------------
  // Data -> map
  // ----------------------------------------------------------------------------------

  const closePopups = () => {
    const popups = document.getElementsByClassName('maplibregl-popup');
    while (popups[0]) popups[0].remove();
  };

  /** Keep fly-to targets centered in the part of the map not covered by the sidebar */
  const flyPadding = () => {
    const covered = latest.current.sidebarOpen && window.innerWidth >= 640 ? SIDEBAR_PX : 0;
    return { left: covered, top: 0, right: 0, bottom: 0 };
  };

  const applyZipState = (map: maplibregl.Map) => {
    if (!map.getSource('nyc-zips')) return;
    const { zipStats } = latest.current;
    for (const [zip, s] of Object.entries(zipStats)) {
      map.setFeatureState({ source: 'nyc-zips', id: zip }, { value: s.value, count: s.count });
    }
  };

  const applyChoroplethStyle = (map: maplibregl.Map) => {
    if (!map.getLayer('zip-choropleth')) return;
    const { breaks, mapStyle, selectedBorough } = latest.current;
    map.setPaintProperty('zip-choropleth', 'fill-color', choroplethColorExpr(breaks, mapStyle === 'light'));
    map.setPaintProperty('zip-choropleth', 'fill-opacity', choroplethOpacityExpr(selectedBorough));
  };

  const applyGrid = (map: maplibregl.Map) => {
    const { grid } = latest.current;
    if (!grid) return;
    // Same points in two sources: clustered (cluster view) and raw (heatmap must see every cell)
    for (const id of ['311-data', '311-heat']) {
      (map.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(grid);
    }
    const { cellMax, t1, t2 } = gridScale(grid);
    if (map.getLayer('311-heatmap')) {
      map.setPaintProperty('311-heatmap', 'heatmap-weight', ['min', 1, ['/', ['get', 'n'], cellMax]]);
      // More cells = more overlap; damp intensity so dense selections don't saturate to solid red
      const k = Math.min(1.2, Math.max(0.12, Math.sqrt(1500 / Math.max(1, grid.features.length))));
      map.setPaintProperty('311-heatmap', 'heatmap-intensity', [
        'interpolate', ['linear'], ['zoom'], 9, 0.6 * k, 12, 1.2 * k, 15, 2.5 * k,
      ]);
    }
    if (map.getLayer('clusters')) {
      map.setPaintProperty('clusters', 'circle-color', ['step', ['get', 'sum'], '#d97706', t1, '#ea580c', t2, '#dc2626']);
      map.setPaintProperty('clusters', 'circle-radius', ['step', ['get', 'sum'], 16, t1, 22, t2, 28]);
    }
    if (map.getLayer('unclustered-point')) {
      map.setPaintProperty('unclustered-point', 'circle-radius', [
        'interpolate', ['linear'], ['get', 'n'], 1, 4, cellMax, 11,
      ]);
    }
  };

  const addDataLayers = (map: maplibregl.Map) => {
    const { mapStyle: currentStyle, selectedBorough: currentBoro, vizMode: currentViz, selectedZip: activeZip } =
      latest.current;
    const isLight = currentStyle === 'light';

    // ----------------------------------------------------
    // 1. NYC ZIP Code areas (MODZCTA) — choropleth polygons
    // ----------------------------------------------------
    if (!map.getSource('nyc-zips')) {
      map.addSource('nyc-zips', {
        type: 'geojson',
        data: dataUrl('nyc_zips.geojson'),
        promoteId: 'modzcta',
        maxzoom: 24,
      });
    }

    if (!map.getLayer('zip-choropleth')) {
      map.addLayer({
        id: 'zip-choropleth',
        type: 'fill',
        source: 'nyc-zips',
        layout: { visibility: currentViz === 'choropleth' ? 'visible' : 'none' },
        paint: {
          'fill-color': choroplethColorExpr(latest.current.breaks, isLight),
          'fill-opacity': choroplethOpacityExpr(currentBoro),
        },
      });
    }

    if (!map.getLayer('zip-borders')) {
      map.addLayer({
        id: 'zip-borders',
        type: 'line',
        source: 'nyc-zips',
        layout: { visibility: currentViz === 'choropleth' ? 'visible' : 'none' },
        paint: {
          'line-color': isLight ? '#94a3b8' : '#475569',
          'line-width': 0.75,
          'line-opacity': 0.7,
        },
      });
    }

    if (!map.getLayer('zip-selected-border')) {
      map.addLayer({
        id: 'zip-selected-border',
        type: 'line',
        source: 'nyc-zips',
        filter: ['==', ['get', 'modzcta'], activeZip || ''],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
          visibility: currentViz === 'choropleth' ? 'visible' : 'none',
        },
        paint: {
          'line-color': '#2563eb',
          'line-width': 3.5,
          'line-opacity': 1,
        },
      });
    }

    if (!map.getLayer('zip-labels')) {
      map.addLayer({
        id: 'zip-labels',
        type: 'symbol',
        source: 'nyc-zips',
        minzoom: 11,
        filter: ['!=', ['get', 'modzcta'], NON_RESIDENTIAL_ZIP],
        layout: {
          visibility: currentViz === 'choropleth' ? 'visible' : 'none',
          'text-field': '{modzcta}',
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 11,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': isLight ? '#0f172a' : '#f8fafc',
          'text-halo-color': isLight ? '#ffffff' : '#0f172a',
          'text-halo-width': 1.5,
        },
      });
    }

    // ----------------------------------------------------
    // 2. Borough Boundaries
    // ----------------------------------------------------
    if (!map.getSource('nyc-boroughs')) {
      map.addSource('nyc-boroughs', {
        type: 'geojson',
        data: dataUrl('nyc_boroughs.geojson'),
        generateId: true,
        maxzoom: 24,
        buffer: 512,
        tolerance: 0,
      });
    }

    if (!map.getLayer('borough-fill')) {
      map.addLayer({
        id: 'borough-fill',
        type: 'fill',
        source: 'nyc-boroughs',
        layout: { visibility: currentViz !== 'choropleth' ? 'visible' : 'none' },
        paint: {
          'fill-color': isLight ? '#2563eb' : '#06b6d4',
          'fill-opacity': currentBoro !== 'All' ? [
            'case',
            ['==', ['get', 'BoroName'], currentBoro],
            isLight ? 0.08 : 0.15,
            0.0,
          ] : 0.0,
        },
      });
    }

    if (!map.getLayer('borough-base-borders')) {
      map.addLayer({
        id: 'borough-base-borders',
        type: 'line',
        source: 'nyc-boroughs',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': isLight ? '#94a3b8' : '#475569',
          'line-width': 1.2,
          'line-dasharray': [3, 2],
          'line-opacity': 0.7,
        },
      });
    }

    // ----------------------------------------------------
    // 3. 311 grid cells (complaints snapped to a ~200m grid; `n` = complaints per cell)
    // ----------------------------------------------------
    if (!map.getSource('311-data')) {
      map.addSource('311-data', {
        type: 'geojson',
        data: latest.current.grid ?? { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
        clusterProperties: { sum: ['+', ['get', 'n']] },
      });
    }

    // Unclustered copy for the heatmap (a clustered source would feed it cluster centroids)
    if (!map.getSource('311-heat')) {
      map.addSource('311-heat', {
        type: 'geojson',
        data: latest.current.grid ?? { type: 'FeatureCollection', features: [] },
      });
    }

    // ----------------------------------------------------
    // 4. Heatmap Layer (weighted by complaints per cell)
    // ----------------------------------------------------
    if (!map.getLayer('311-heatmap')) {
      map.addLayer({
        id: '311-heatmap',
        type: 'heatmap',
        source: '311-heat',
        maxzoom: 16,
        layout: { visibility: currentViz === 'heatmap' ? 'visible' : 'none' },
        paint: {
          'heatmap-weight': 1,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 1, 12, 2.2, 15, 3.5],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(0, 0, 255, 0)',
            0.15, 'rgba(37, 99, 235, 0.45)',
            0.35, 'rgba(6, 182, 212, 0.7)',
            0.6, 'rgba(234, 179, 8, 0.85)',
            0.8, 'rgba(249, 115, 22, 0.92)',
            1, 'rgba(239, 68, 68, 0.98)',
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 9, 14, 12, 24, 15, 42],
          'heatmap-opacity': 0.85,
        },
      });
    }

    // ----------------------------------------------------
    // 5. Borough Highlight Border (ON TOP)
    // ----------------------------------------------------
    if (!map.getLayer('borough-highlight-border')) {
      map.addLayer({
        id: 'borough-highlight-border',
        type: 'line',
        source: 'nyc-boroughs',
        filter: ['==', ['get', 'BoroName'], currentBoro === 'All' ? '' : currentBoro],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': isLight ? '#1d4ed8' : '#22d3ee',
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2.5, 12, 3.5, 15, 5, 18, 6.5],
          'line-opacity': 0.95,
        },
      });
    }

    // ----------------------------------------------------
    // 6. Cluster Circles & Counts (sum of complaints, not number of points)
    // ----------------------------------------------------
    if (!map.getLayer('clusters')) {
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: '311-data',
        filter: ['has', 'point_count'],
        layout: { visibility: currentViz === 'clusters' ? 'visible' : 'none' },
        paint: {
          'circle-color': '#d97706',
          'circle-radius': 16,
          'circle-opacity': 0.88,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });
    }

    if (!map.getLayer('cluster-count')) {
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: '311-data',
        filter: ['has', 'point_count'],
        layout: {
          visibility: currentViz === 'clusters' ? 'visible' : 'none',
          'text-field': [
            'case',
            ['>=', ['get', 'sum'], 1000],
            ['concat', ['to-string', ['/', ['round', ['/', ['get', 'sum'], 100]], 10]], 'k'],
            ['to-string', ['get', 'sum']],
          ],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 12,
        },
        paint: { 'text-color': '#ffffff' },
      });
    }

    // ----------------------------------------------------
    // 7. Individual grid cells
    // ----------------------------------------------------
    if (!map.getLayer('unclustered-point')) {
      map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: '311-data',
        filter: ['!', ['has', 'point_count']],
        layout: { visibility: currentViz === 'clusters' ? 'visible' : 'none' },
        paint: {
          'circle-color': isLight ? '#0284c7' : '#06b6d4',
          'circle-radius': 5,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.9,
        },
      });
    }

    // Re-apply data-driven state (setStyle wipes feature state and sources)
    applyZipState(map);
    applyGrid(map);
  };

  // Event handlers are bound to layer ids, so they survive setStyle() and are registered once.
  const registerHandlers = (map: maplibregl.Map) => {
    const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 12 });

    map.on('mousemove', 'zip-choropleth', (e) => {
      const feat = e.features?.[0];
      if (!feat) return;
      if (hoveredZipIdRef.current !== null) {
        map.setFeatureState({ source: 'nyc-zips', id: hoveredZipIdRef.current }, { hover: false });
      }
      if (feat.id !== undefined) {
        hoveredZipIdRef.current = feat.id;
        map.setFeatureState({ source: 'nyc-zips', id: feat.id }, { hover: true });
      }
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'zip-choropleth', () => {
      if (hoveredZipIdRef.current !== null) {
        map.setFeatureState({ source: 'nyc-zips', id: hoveredZipIdRef.current }, { hover: false });
      }
      hoveredZipIdRef.current = null;
      map.getCanvas().style.cursor = '';
    });

    map.on('click', 'zip-choropleth', (e) => {
      const p = e.features?.[0]?.properties as { modzcta?: string; label?: string; borough?: string } | undefined;
      if (!p?.modzcta) return;
      if (p.modzcta === NON_RESIDENTIAL_ZIP) {
        popup
          .setLngLat(e.lngLat)
          .setHTML(
            '<div style="font-size: 12px; color: #0f172a; padding: 4px;"><strong>Non-residential area</strong>' +
              '<div style="color: #64748b; font-size: 11px;">Parks, airports and other land with no ZIP population</div></div>'
          )
          .addTo(map);
        return;
      }
      const { zipStats, periodLabel, categoryLabel, onSelectZip } = latest.current;
      const s = zipStats[p.modzcta];
      onSelectZip?.(p.modzcta, p.borough);

      const rate = s && s.pop > 0 ? ((s.count / s.pop) * 10_000).toFixed(1) : 'N/A';
      const html = `
        <div style="font-family: inherit; font-size: 12px; color: #0f172a; padding: 4px; min-width: 170px;">
          <div style="font-weight: 700; color: #1d4ed8; font-size: 13px; margin-bottom: 2px;">ZIP ${escapeHtml(p.modzcta)}</div>
          <div style="font-size: 11px; color: #64748b; margin-bottom: 2px;">${escapeHtml(p.borough)} (${escapeHtml(p.label)})</div>
          <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">${escapeHtml(categoryLabel)} · ${escapeHtml(periodLabel)}</div>
          <div style="display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 4px; margin-bottom: 2px;">
            <span>Complaints:</span>
            <strong style="color: #dc2626;">${s ? s.count.toLocaleString() : 'N/A'}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
            <span style="color: #64748b;">Population:</span>
            <span>${s && s.pop ? s.pop.toLocaleString() : 'N/A'}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #64748b;">Per 10k residents:</span>
            <strong>${rate}</strong>
          </div>
        </div>
      `;
      popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
    });

    map.on('click', 'borough-fill', (e) => {
      const clickedBoro = e.features?.[0]?.properties?.BoroName as Borough | undefined;
      if (clickedBoro) latest.current.onSelectBorough?.(clickedBoro);
    });

    map.on('click', 'clusters', async (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
      const clusterId = features[0]?.properties?.cluster_id;
      const source = map.getSource('311-data') as maplibregl.GeoJSONSource;
      if (clusterId !== undefined && source.getClusterExpansionZoom) {
        const zoom = await source.getClusterExpansionZoom(clusterId);
        const coords = (features[0].geometry as Point).coordinates as [number, number];
        map.easeTo({ center: coords, zoom: zoom + 0.5 });
      }
    });

    map.on('click', 'unclustered-point', (e) => {
      const feat = e.features?.[0];
      if (!feat) return;
      const n = Number(feat.properties?.n ?? 0);
      const coords = (feat.geometry as Point).coordinates.slice() as [number, number];
      const { periodLabel, categoryLabel, gridSize } = latest.current;
      const meters = gridMeters(gridSize);
      const html = `
        <div style="font-family: inherit; font-size: 12px; color: #0f172a; padding: 4px;">
          <div style="font-weight: 700; color: #d97706; margin-bottom: 2px;">${n.toLocaleString()} complaint${n === 1 ? '' : 's'}</div>
          <div style="color: #64748b; font-size: 11px;">
            <div>${escapeHtml(categoryLabel)}</div>
            <div>${escapeHtml(periodLabel)}</div>
            <div>Within a ~${meters}m grid cell</div>
          </div>
        </div>
      `;
      popup.setLngLat(coords).setHTML(html).addTo(map);
    });

    for (const layer of ['clusters', 'unclustered-point', 'borough-fill']) {
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
    }
  };

  // ----------------------------------------------------------------------------------
  // Effects
  // ----------------------------------------------------------------------------------

  // Mount Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: STYLES[mapStyle],
      center: [-73.96, 40.73],
      zoom: 10.5,
      pitch: 15,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: '311 data: <a href="https://data.cityofnewyork.us/d/erm2-nwe9" target="_blank">NYC Open Data</a>',
      }),
      'bottom-right'
    );

    registerHandlers(map);
    map.on('load', () => addDataLayers(map));
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update basemap style and re-add our layers on top
  const isFirstStyle = useRef(true);
  useEffect(() => {
    if (isFirstStyle.current) {
      isFirstStyle.current = false;
      return;
    }
    const map = mapInstanceRef.current;
    if (!map) return;
    map.setStyle(STYLES[mapStyle]);
    map.once('style.load', () => addDataLayers(map));
  }, [mapStyle]);

  // Popups describe a specific category/period/view; close them when that changes
  useEffect(() => {
    closePopups();
  }, [vizMode, periodLabel, categoryLabel, metric]);

  // Push ZIP numbers + color scale to the choropleth
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    applyZipState(map);
    applyChoroplethStyle(map);
  }, [zipStats, breaks, selectedBorough]);

  // Push grid points to the heatmap / clusters
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    applyGrid(map);
  }, [grid]);

  // Toggle layer visibility based on vizMode
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const visibility: Record<string, boolean> = {
      'zip-choropleth': vizMode === 'choropleth',
      'zip-borders': vizMode === 'choropleth',
      'zip-selected-border': vizMode === 'choropleth',
      'zip-labels': vizMode === 'choropleth',
      'borough-fill': vizMode !== 'choropleth',
      '311-heatmap': vizMode === 'heatmap',
      clusters: vizMode === 'clusters',
      'cluster-count': vizMode === 'clusters',
      'unclustered-point': vizMode === 'clusters',
    };
    for (const [layer, visible] of Object.entries(visibility)) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', visible ? 'visible' : 'none');
    }
  }, [vizMode]);

  // Selected ZIP: highlight + fly to
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (map.getLayer('zip-selected-border')) {
      map.setFilter('zip-selected-border', ['==', ['get', 'modzcta'], selectedZip || '']);
    }

    if (selectedZip) {
      loadZipIndex()
        .then((items) => {
          const match = items.find((i) => i.zip === selectedZip);
          if (match?.center) {
            map.flyTo({ center: match.center, zoom: 13.5, essential: true, duration: 1200, padding: flyPadding() });
          }
        })
        .catch(() => {});
    }
  }, [selectedZip]);

  // Borough highlight + fly to
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const isLight = mapStyle === 'light';

    if (map.getLayer('borough-highlight-border')) {
      map.setFilter('borough-highlight-border', ['==', ['get', 'BoroName'], selectedBorough === 'All' ? '' : selectedBorough]);
    }

    if (map.getLayer('borough-fill')) {
      map.setPaintProperty(
        'borough-fill',
        'fill-opacity',
        selectedBorough === 'All'
          ? 0.0
          : ['case', ['==', ['get', 'BoroName'], selectedBorough], isLight ? 0.08 : 0.15, 0.0]
      );
    }

    // Only fly to borough if no specific ZIP is selected
    if (!selectedZip) {
      const target = BOROUGH_BOUNDS[selectedBorough] || BOROUGH_BOUNDS['All'];
      map.flyTo({
        padding: flyPadding(),
        center: [target[0], target[1]],
        zoom: target[2],
        pitch: 15,
        bearing: 0,
        essential: true,
        duration: 1200,
      });
    }
    // mapStyle is deliberately not a dependency: a theme switch must not move the camera
    // (borough-fill opacity is re-applied by addDataLayers on style.load)
  }, [selectedBorough, selectedZip]);

  const resetMapCamera = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    closePopups();

    map.flyTo({
      padding: flyPadding(),
      center: [-73.96, 40.73],
      zoom: 10.5,
      pitch: 15,
      bearing: 0,
      essential: true,
      duration: 1200,
    });
  };

  // Trigger camera reset whenever resetKey increments
  useEffect(() => {
    if (resetKey !== undefined && resetKey > 0) {
      resetMapCamera();
    }
  }, [resetKey]);

  const handleMapResetClick = () => {
    resetMapCamera();
    onResetView?.();
  };

  // Resize on sidebar collapse
  useEffect(() => {
    const timer = setTimeout(() => {
      mapInstanceRef.current?.resize();
    }, 300);
    return () => clearTimeout(timer);
  }, [sidebarOpen]);

  const isLight = mapStyle === 'light';
  const panelClass = isLight ? 'bg-white/95 border-slate-200 text-slate-800' : 'bg-slate-900/90 border-slate-700 text-slate-200';

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" />

      {loading && (
        <div
          className={`absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-md backdrop-blur-md text-xs font-semibold ${panelClass}`}
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading data…
        </div>
      )}

      {onResetView && (
        <button
          onClick={handleMapResetClick}
          className={`absolute top-2.5 right-14 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border shadow-md backdrop-blur-md text-xs font-semibold transition ${
            isLight
              ? 'bg-white/95 hover:bg-slate-50 text-slate-700 border-slate-200 hover:text-blue-600'
              : 'bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-slate-700 hover:text-cyan-400'
          }`}
          title="Reset map camera and filters to city overview"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset View</span>
        </button>
      )}

      <Legend
        vizMode={vizMode}
        metric={metric}
        breaks={breaks}
        isLight={isLight}
        periodLabel={periodLabel}
        categoryLabel={categoryLabel}
        gridMeters={gridMeters(props.gridSize)}
        className={`absolute top-28 right-3 z-20 backdrop-blur-md rounded-xl p-3 shadow-xl border text-xs select-none transition max-w-[240px] ${panelClass}`}
      />
    </div>
  );
};

// ------------------------------------------------------------------------------------
// Legend
// ------------------------------------------------------------------------------------

interface LegendProps {
  vizMode: VizMode;
  metric: Metric;
  breaks: number[];
  isLight: boolean;
  periodLabel: string;
  categoryLabel: string;
  gridMeters: number;
  className: string;
}

const Legend: React.FC<LegendProps> = ({
  vizMode,
  metric,
  breaks,
  isLight,
  periodLabel,
  categoryLabel,
  gridMeters,
  className,
}) => {
  const title =
    vizMode === 'choropleth'
      ? metric === 'count'
        ? 'Complaints by ZIP'
        : 'Complaints per 10k residents'
      : vizMode === 'heatmap'
      ? 'Complaint density'
      : 'Complaints (clustered)';

  const colors = classColors(breaks);
  const classes = colors.map((color, i) => {
    const lo = i === 0 ? null : breaks[i - 1];
    const hi = i < breaks.length ? breaks[i] : null;
    const label =
      lo === null && hi !== null
        ? `< ${formatValue(hi, metric)}`
        : hi === null && lo !== null
        ? `${formatValue(lo, metric)}+`
        : lo !== null && hi !== null
        ? `${formatValue(lo, metric)}–${formatValue(hi, metric)}`
        : 'Any';
    return { color, label };
  });

  return (
    <div className={className}>
      <div className="font-bold text-[11px] uppercase tracking-wider text-slate-500">{title}</div>
      <div className="text-[10px] text-slate-400 mb-2 leading-tight">
        {categoryLabel} · {periodLabel}
      </div>

      {vizMode === 'choropleth' && (
        <div className="space-y-1">
          <LegendRow color={zeroColor(isLight)} label="0" />
          {classes.map((c) => (
            <LegendRow key={c.label} color={c.color} label={c.label} />
          ))}
          <LegendRow
            color={noDataColor(isLight)}
            label={metric === 'rate' ? 'Non-residential / too few residents' : 'Non-residential area'}
          />
        </div>
      )}

      {vizMode === 'heatmap' && (
        <div>
          <div
            className="h-2.5 rounded-sm"
            style={{ background: 'linear-gradient(to right, rgba(37,99,235,0.45), rgba(6,182,212,0.7), rgba(234,179,8,0.85), rgba(249,115,22,0.92), rgba(239,68,68,0.98))' }}
          />
          <div className="flex justify-between text-[10px] mt-1 text-slate-400">
            <span>Fewer</span>
            <span>More</span>
          </div>
        </div>
      )}

      {vizMode === 'clusters' && (
        <div className="text-[10px] text-slate-400 leading-snug">
          Numbers are complaints in each cluster. Zoom in or click a cluster to split it; single dots are ~
          {gridMeters}m grid cells.
        </div>
      )}
    </div>
  );
};

const LegendRow: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <div className="flex items-center gap-2">
    <span className="w-5 h-3 rounded-sm border border-black/10" style={{ background: color }} />
    <span className="text-[11px]">{label}</span>
  </div>
);
