export type SraUserRole = 'field_tech' | 'block_farm_lead' | 'mdo' | 'central_hq';

export type SugarcaneCropClass = 'Plant' | 'Ratoon 1' | 'Ratoon 2' | 'Ratoon 3+';

export type RowSpacingType = 'Standard (1.5m)' | 'Paired-Row (0.5m + 1.5m)' | 'Other';

export interface SraParcelRecord {
  parcelId: string;
  millDistrictCode: string;
  sidaBlockFarmId?: string;
  variety: string;
  cropClass: SugarcaneCropClass;
  rowSpacingType: RowSpacingType;
  plantingOrCutDate: string;
  areaHa: number;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  // Restricted PII fields (stored separately in sra_planter_pii on sync)
  planterName?: string;
  rsbsaId?: string;
  sraPlanterCode?: string;
  consentSigned: boolean;
  consentTimestamp?: string;
  syncStatus: 'pending' | 'synced' | 'error';
  updatedAt: string;
}

export interface SraFieldObservation {
  observationId: string;
  parcelId: string;
  millDistrictCode: string;
  issueType: 'healthy' | 'rssi_scale' | 'smut' | 'pokkah_boeng' | 'waterlogging' | 'drought_stress';
  notes: string;
  photoDataUrl?: string; // Compressed ~350KB JPEG for offline queue
  gpsLat: number;
  gpsLng: number;
  gpsAccuracyMeters: number;
  syncStatus: 'pending' | 'synced';
  capturedAt: string;
}
