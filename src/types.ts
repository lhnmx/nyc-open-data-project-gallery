export type Borough = 'All' | 'Manhattan' | 'Brooklyn' | 'Queens' | 'Bronx' | 'Staten Island';

export type ComplaintCategory =
  | 'All'
  | 'Rodent / Pest'
  | 'Noise - Residential'
  | 'Heat & Hot Water'
  | 'Illegal Parking'
  | 'Blocked Driveway'
  | 'Sanitation / Dirty Conditions';

export type VizMode = 'choropleth' | 'heatmap' | 'clusters';

export interface FilterState {
  searchQuery: string;
  selectedZip?: string | null;
  borough: Borough;
  category: ComplaintCategory;
  selectedMonthIndex: number;
  mapStyle: 'dark' | 'light';
  vizMode: VizMode;
}

export interface TimelineMonth {
  label: string;
  shortLabel: string;
  year: number;
  month: number;
}

export interface ZipEntry {
  zip: string;
  label: string;
  borough: string;
  count: number;
  pop: number;
  center: [number, number];
}
