import * as turf from '@turf/turf';

/**
 * Calculates accurate area in hectares using Turf.js geodesic area.
 */
export function calculateHectares(
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon
): number {
  const sqMeters = turf.area(turf.feature(geom));
  return Number((sqMeters / 10000).toFixed(4));
}

/**
 * Checks if a newly surveyed or edited farm polygon overlaps any existing
 * parcel in the same Mill District (ignores negligible < 5 sq.m edge jitter).
 */
export function findOverlappingParcels(
  candidate: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  existingParcels: Array<{ parcelId: string; geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon }>
): string[] {
  const candidateFeat = turf.feature(candidate);
  const overlappingIds: string[] = [];

  for (const existing of existingParcels) {
    try {
      const existingFeat = turf.feature(existing.geometry);
      const intersection = turf.intersect(
        turf.featureCollection([candidateFeat, existingFeat])
      );
      if (intersection && turf.area(intersection) > 5) {
        overlappingIds.push(existing.parcelId);
      }
    } catch {
      // Skip malformed legacy rings safely
    }
  }
  return overlappingIds;
}
