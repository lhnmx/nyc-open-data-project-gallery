import React, { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { Borough, VizMode } from '../types';

interface MapProps {
  mapStyle: 'dark' | 'light';
  vizMode: VizMode;
  sidebarOpen: boolean;
  selectedBorough: Borough;
  selectedZip?: string | null;
  onSelectBorough?: (borough: Borough) => void;
  onSelectZip?: (zip: string, boro?: string) => void;
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

export const Map: React.FC<MapProps> = ({
  mapStyle,
  vizMode,
  sidebarOpen,
  selectedBorough,
  selectedZip,
  onSelectBorough,
  onSelectZip,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const hoveredZipIdRef = useRef<number | string | null>(null);

  const addDataLayers = (
    map: maplibregl.Map,
    currentStyle: 'dark' | 'light',
    currentBoro: Borough,
    currentViz: VizMode,
    activeZip?: string | null
  ) => {
    const isLight = currentStyle === 'light';

    // ----------------------------------------------------
    // 1. NYC ZIP Codes Source (Choropleth polygons)
    // ----------------------------------------------------
    if (!map.getSource('nyc-zips')) {
      map.addSource('nyc-zips', {
        type: 'geojson',
        data: '/data/nyc_zips.geojson',
        generateId: true,
        maxzoom: 24,
      });
    }

    // Choropleth Fill Layer
    if (!map.getLayer('zip-choropleth')) {
      map.addLayer({
        id: 'zip-choropleth',
        type: 'fill',
        source: 'nyc-zips',
        layout: {
          visibility: currentViz === 'choropleth' ? 'visible' : 'none',
        },
        paint: {
          'fill-color': [
            'step',
            ['get', 'count'],
            isLight ? '#f1f5f9' : '#1e293b',
            1,
            '#fef08a',
            6,
            '#fcd34d',
            16,
            '#fb923c',
            31,
            '#f87171',
            46,
            '#dc2626',
          ],
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            0.92,
            0.72,
          ],
        },
      });
    }

    // ZIP Code Borders
    if (!map.getLayer('zip-borders')) {
      map.addLayer({
        id: 'zip-borders',
        type: 'line',
        source: 'nyc-zips',
        layout: {
          visibility: currentViz === 'choropleth' ? 'visible' : 'none',
        },
        paint: {
          'line-color': isLight ? '#94a3b8' : '#475569',
          'line-width': 0.75,
          'line-opacity': 0.7,
        },
      });
    }

    // Selected ZIP Code Highlight Border
    if (!map.getLayer('zip-selected-border')) {
      map.addLayer({
        id: 'zip-selected-border',
        type: 'line',
        source: 'nyc-zips',
        filter: ['==', ['get', 'modzcta'], activeZip || ''],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#2563eb',
          'line-width': 3.5,
          'line-opacity': 1,
        },
      });
    }

    // ZIP Code Labels (Visible when zooming in)
    if (!map.getLayer('zip-labels')) {
      map.addLayer({
        id: 'zip-labels',
        type: 'symbol',
        source: 'nyc-zips',
        minzoom: 11,
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
    // 2. Borough Boundaries Source
    // ----------------------------------------------------
    if (!map.getSource('nyc-boroughs')) {
      map.addSource('nyc-boroughs', {
        type: 'geojson',
        data: '/data/nyc_boroughs.geojson',
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
        layout: {
          visibility: currentViz !== 'choropleth' ? 'visible' : 'none',
        },
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
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': isLight ? '#94a3b8' : '#475569',
          'line-width': 1.2,
          'line-dasharray': [3, 2],
          'line-opacity': 0.7,
        },
      });
    }

    // ----------------------------------------------------
    // 3. 311 Data Source
    // ----------------------------------------------------
    if (!map.getSource('311-data')) {
      map.addSource('311-data', {
        type: 'geojson',
        data: '/data/rodent_sample.geojson',
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });
    }

    // ----------------------------------------------------
    // 4. Heatmap Layer
    // ----------------------------------------------------
    if (!map.getLayer('311-heatmap')) {
      map.addLayer({
        id: '311-heatmap',
        type: 'heatmap',
        source: '311-data',
        maxzoom: 16,
        layout: {
          visibility: currentViz === 'heatmap' ? 'visible' : 'none',
        },
        paint: {
          'heatmap-weight': 1,
          'heatmap-intensity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            9, 1,
            12, 2.2,
            15, 3.5,
          ],
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
          'heatmap-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            9, 14,
            12, 24,
            15, 42,
          ],
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
        filter: currentBoro === 'All' ? ['==', ['get', 'BoroName'], ''] : ['==', ['get', 'BoroName'], currentBoro],
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': isLight ? '#1d4ed8' : '#22d3ee',
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            9, 2.5,
            12, 3.5,
            15, 5,
            18, 6.5,
          ],
          'line-opacity': 0.95,
        },
      });
    }

    // ----------------------------------------------------
    // 6. Cluster Circles & Counts
    // ----------------------------------------------------
    if (!map.getLayer('clusters')) {
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: '311-data',
        filter: ['has', 'point_count'],
        layout: {
          visibility: currentViz === 'clusters' ? 'visible' : 'none',
        },
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#d97706',
            20,
            '#ea580c',
            50,
            '#dc2626',
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            16,
            20,
            22,
            50,
            28,
          ],
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
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 12,
        },
        paint: {
          'text-color': '#ffffff',
        },
      });
    }

    // ----------------------------------------------------
    // 7. Individual Points
    // ----------------------------------------------------
    if (!map.getLayer('unclustered-point')) {
      map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: '311-data',
        filter: ['!', ['has', 'point_count']],
        layout: {
          visibility: currentViz === 'clusters' ? 'visible' : 'none',
        },
        paint: {
          'circle-color': isLight ? '#0284c7' : '#06b6d4',
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 4,
            14, 7,
          ],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.9,
        },
      });
    }

    // ----------------------------------------------------
    // Interactivity
    // ----------------------------------------------------
    const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 12 });

    map.on('mousemove', 'zip-choropleth', (e) => {
      if (!e.features || !e.features[0]) return;
      const feat = e.features[0];
      const zipId = feat.id;

      if (hoveredZipIdRef.current !== null && hoveredZipIdRef.current !== undefined) {
        map.setFeatureState({ source: 'nyc-zips', id: hoveredZipIdRef.current }, { hover: false });
      }

      if (zipId !== undefined) {
        hoveredZipIdRef.current = zipId;
        map.setFeatureState({ source: 'nyc-zips', id: zipId }, { hover: true });
      }

      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'zip-choropleth', () => {
      if (hoveredZipIdRef.current !== null && hoveredZipIdRef.current !== undefined) {
        map.setFeatureState({ source: 'nyc-zips', id: hoveredZipIdRef.current }, { hover: false });
      }
      hoveredZipIdRef.current = null;
      map.getCanvas().style.cursor = '';
    });

    map.on('click', 'zip-choropleth', (e) => {
      if (!e.features || !e.features[0]) return;
      const props = e.features[0].properties as {
        modzcta?: string;
        label?: string;
        borough?: string;
        pop_est?: string;
        count?: number;
      };

      const count = props.count || 0;
      const pop = props.pop_est ? Number(props.pop_est).toLocaleString() : 'N/A';
      const rate = props.pop_est && Number(props.pop_est) > 0
        ? ((count / Number(props.pop_est)) * 10000).toFixed(1)
        : 'N/A';

      const zip = props.modzcta || '';
      if (zip && onSelectZip) {
        onSelectZip(zip, props.borough);
      }

      const html = `
        <div style="font-family: inherit; font-size: 12px; color: #0f172a; padding: 4px; min-width: 140px;">
          <div style="font-weight: 700; color: #1d4ed8; font-size: 13px; margin-bottom: 2px;">ZIP ${zip}</div>
          <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">${props.borough || ''} (${props.label || ''})</div>
          <div style="display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 4px; margin-bottom: 2px;">
            <span>Complaints:</span>
            <strong style="color: #dc2626;">${count}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
            <span style="color: #64748b;">Population:</span>
            <span>${pop}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #64748b;">Rate/10k:</span>
            <strong>${rate}</strong>
          </div>
        </div>
      `;
      popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
    });

    map.on('click', 'borough-fill', (e) => {
      if (!e.features || !e.features[0]) return;
      const clickedBoro = e.features[0].properties?.BoroName as Borough;
      if (clickedBoro && onSelectBorough) {
        onSelectBorough(clickedBoro);
      }
    });

    map.on('click', 'clusters', async (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
      const clusterId = features[0]?.properties?.cluster_id;
      const source = map.getSource('311-data') as maplibregl.GeoJSONSource;
      if (clusterId && source.getClusterExpansionZoom) {
        const zoom = await source.getClusterExpansionZoom(clusterId);
        const coords = (features[0].geometry as { type: string; coordinates: [number, number] }).coordinates;
        map.easeTo({ center: coords, zoom: zoom + 0.5 });
      }
    });

    map.on('click', 'unclustered-point', (e) => {
      if (!e.features || !e.features[0]) return;
      const feat = e.features[0];
      const props = feat.properties as {
        type?: string;
        desc?: string;
        borough?: string;
        zip?: string;
        date?: string;
        loc?: string;
      };
      const coords = (feat.geometry as { type: string; coordinates: [number, number] }).coordinates.slice() as [number, number];

      const html = `
        <div style="font-family: inherit; font-size: 12px; color: #0f172a; padding: 4px;">
          <div style="font-weight: 700; color: #d97706; margin-bottom: 2px;">${props.type || '311 Incident'}</div>
          <div style="font-weight: 500; margin-bottom: 4px;">${props.desc || 'No details'}</div>
          <div style="color: #64748b; font-size: 11px;">
            <div><strong>Location:</strong> ${props.loc || 'N/A'}</div>
            <div><strong>ZIP:</strong> ${props.zip || 'N/A'} (${props.borough || ''})</div>
            <div><strong>Reported:</strong> ${props.date ? new Date(props.date).toLocaleDateString() : 'N/A'}</div>
          </div>
        </div>
      `;
      popup.setLngLat(coords).setHTML(html).addTo(map);
    });
  };

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
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => addDataLayers(map, mapStyle, selectedBorough, vizMode, selectedZip));
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update style and re-add layers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.setStyle(STYLES[mapStyle]);
    map.once('style.load', () => addDataLayers(map, mapStyle, selectedBorough, vizMode, selectedZip));
  }, [mapStyle]);

  // Toggle Layer Visibility based on vizMode
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const isChoropleth = vizMode === 'choropleth';
    const isHeatmap = vizMode === 'heatmap';
    const isClusters = vizMode === 'clusters';

    if (map.getLayer('zip-choropleth')) {
      map.setLayoutProperty('zip-choropleth', 'visibility', isChoropleth ? 'visible' : 'none');
    }
    if (map.getLayer('zip-borders')) {
      map.setLayoutProperty('zip-borders', 'visibility', isChoropleth ? 'visible' : 'none');
    }
    if (map.getLayer('zip-selected-border')) {
      map.setLayoutProperty('zip-selected-border', 'visibility', isChoropleth ? 'visible' : 'none');
    }
    if (map.getLayer('zip-labels')) {
      map.setLayoutProperty('zip-labels', 'visibility', isChoropleth ? 'visible' : 'none');
    }

    if (map.getLayer('borough-fill')) {
      map.setLayoutProperty('borough-fill', 'visibility', !isChoropleth ? 'visible' : 'none');
    }

    if (map.getLayer('311-heatmap')) {
      map.setLayoutProperty('311-heatmap', 'visibility', isHeatmap ? 'visible' : 'none');
    }

    if (map.getLayer('clusters')) {
      map.setLayoutProperty('clusters', 'visibility', isClusters ? 'visible' : 'none');
    }
    if (map.getLayer('cluster-count')) {
      map.setLayoutProperty('cluster-count', 'visibility', isClusters ? 'visible' : 'none');
    }
    if (map.getLayer('unclustered-point')) {
      map.setLayoutProperty('unclustered-point', 'visibility', isClusters ? 'visible' : 'none');
    }
  }, [vizMode]);

  // Handle Selected ZIP Fly-To & Highlight
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (map.getLayer('zip-selected-border')) {
      map.setFilter('zip-selected-border', ['==', ['get', 'modzcta'], selectedZip || '']);
    }

    if (selectedZip) {
      // Find the centroid in zip_index
      fetch('/data/zip_index.json')
        .then((res) => res.json())
        .then((items: { zip: string; center: [number, number] }[]) => {
          const match = items.find((i) => i.zip === selectedZip);
          if (match && match.center) {
            map.flyTo({
              center: match.center,
              zoom: 13.5,
              essential: true,
              duration: 1200,
            });
          }
        })
        .catch(() => {});
    }
  }, [selectedZip]);

  // Update Borough Highlight Border dynamically
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const isLight = mapStyle === 'light';

    if (map.getLayer('borough-highlight-border')) {
      if (selectedBorough === 'All') {
        map.setFilter('borough-highlight-border', ['==', ['get', 'BoroName'], '']);
      } else {
        map.setFilter('borough-highlight-border', ['==', ['get', 'BoroName'], selectedBorough]);
      }
    }

    if (map.getLayer('borough-fill')) {
      if (selectedBorough === 'All') {
        map.setPaintProperty('borough-fill', 'fill-opacity', 0.0);
      } else {
        map.setPaintProperty('borough-fill', 'fill-opacity', [
          'case',
          ['==', ['get', 'BoroName'], selectedBorough],
          isLight ? 0.08 : 0.15,
          0.0,
        ]);
      }
    }

    // Only fly to borough if no specific ZIP is selected
    if (!selectedZip) {
      const target = BOROUGH_BOUNDS[selectedBorough] || BOROUGH_BOUNDS['All'];
      map.flyTo({
        center: [target[0], target[1]],
        zoom: target[2],
        essential: true,
        duration: 1200,
      });
    }
  }, [selectedBorough, mapStyle, selectedZip]);

  // Resize on sidebar collapse
  useEffect(() => {
    const timer = setTimeout(() => {
      mapInstanceRef.current?.resize();
    }, 300);
    return () => clearTimeout(timer);
  }, [sidebarOpen]);

  const isLight = mapStyle === 'light';

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Floating Choropleth Legend (Top-Right, below zoom controls) */}
      {vizMode === 'choropleth' && (
        <div
          className={`absolute top-28 right-3 z-20 backdrop-blur-md rounded-xl p-3 shadow-xl border text-xs select-none transition ${
            isLight
              ? 'bg-white/95 border-slate-200 text-slate-800'
              : 'bg-slate-900/90 border-slate-700 text-slate-200'
          }`}
        >
          <div className="font-bold text-[11px] uppercase tracking-wider mb-2 text-slate-500">
            Complaints by ZIP
          </div>
          <div className="flex items-center gap-1">
            <div className="flex flex-col items-center">
              <span className="w-5 h-3 rounded-sm bg-slate-200 border border-slate-300" />
              <span className="text-[10px] mt-1 text-slate-400">0</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="w-5 h-3 rounded-sm bg-yellow-200 border border-yellow-300" />
              <span className="text-[10px] mt-1 text-slate-400">1-5</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="w-5 h-3 rounded-sm bg-amber-400 border border-amber-500" />
              <span className="text-[10px] mt-1 text-slate-400">6-15</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="w-5 h-3 rounded-sm bg-orange-400 border border-orange-500" />
              <span className="text-[10px] mt-1 text-slate-400">16-30</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="w-5 h-3 rounded-sm bg-red-400 border border-red-500" />
              <span className="text-[10px] mt-1 text-slate-400">31-45</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="w-5 h-3 rounded-sm bg-red-600 border border-red-700" />
              <span className="text-[10px] mt-1 text-slate-400">45+</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
