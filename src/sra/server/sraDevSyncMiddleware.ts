import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Plugin } from 'vite';

/**
 * Local & Supabase-ready Edge Sync Receiver (/api/sra/sync).
 * Enforces RA 10173 PII isolation even during offline-to-local development testing.
 */
export function sraSyncPlugin(): Plugin {
  return {
    name: 'agriintelph-sra-sync-endpoint',
    configureServer(server) {
      server.middlewares.use('/api/sra/sync', (req, res, next) => {
        if (req.method !== 'POST') {
          return next();
        }

        let rawBody = '';
        req.on('data', (chunk) => {
          rawBody += chunk;
        });

        req.on('end', async () => {
          try {
            const payload = JSON.parse(rawBody || '{}');
            const parcels = Array.isArray(payload.parcels) ? payload.parcels : [];
            const observations = Array.isArray(payload.observations)
              ? payload.observations
              : [];

            const vaultDir = path.resolve(process.cwd(), 'backend-sra/local_vault');
            fs.mkdirSync(vaultDir, { recursive: true });

            const piiFile = path.join(vaultDir, 'sra_planter_pii.json');
            const parcelsFile = path.join(vaultDir, 'sra_parcels_anonymized.json');
            const obsFile = path.join(vaultDir, 'sra_field_observations.json');

            const readJson = (filePath: string) =>
              fs.existsSync(filePath)
                ? JSON.parse(fs.readFileSync(filePath, 'utf-8'))
                : [];

            const existingPii = readJson(piiFile);
            const existingParcels = readJson(parcelsFile);
            const existingObs = readJson(obsFile);

            for (const p of parcels) {
              const planterUuid = crypto.randomUUID();

              // 1. Restricted RA 10173 PII Vault entry
              existingPii.push({
                planter_uuid: planterUuid,
                sra_planter_code: p.sraPlanterCode || null,
                rsbsa_id: p.rsbsaId || null,
                full_name: p.planterName || 'REDACTED_UNSPECIFIED',
                mill_district_code: p.millDistrictCode,
                consent_signed: Boolean(p.consentSigned),
                consent_timestamp: p.consentTimestamp || new Date().toISOString(),
              });

              // 2. Anonymized Spatial Parcel entry (safe for satellite worker & PhilSA export)
              existingParcels.push({
                parcel_id: p.parcelId,
                planter_uuid: planterUuid,
                mill_district_code: p.millDistrictCode,
                sida_block_farm_id: p.sidaBlockFarmId || null,
                variety: p.variety,
                crop_class: p.cropClass,
                row_spacing_type: p.rowSpacingType,
                planting_or_cut_date: p.plantingOrCutDate,
                area_ha: p.areaHa,
                geometry: p.geometry,
                updated_at: p.updatedAt,
              });
            }

            for (const o of observations) {
              existingObs.push({
                observation_id: o.observationId,
                parcel_id: o.parcelId,
                mill_district_code: o.millDistrictCode,
                issue_type: o.issueType,
                notes: o.notes,
                gps_lat: o.gpsLat,
                gps_lng: o.gpsLng,
                gps_accuracy_meters: o.gpsAccuracyMeters,
                captured_at: o.capturedAt,
              });
            }

            fs.writeFileSync(piiFile, JSON.stringify(existingPii, null, 2));
            fs.writeFileSync(parcelsFile, JSON.stringify(existingParcels, null, 2));
            fs.writeFileSync(obsFile, JSON.stringify(existingObs, null, 2));

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: true,
                syncedParcels: parcels.length,
                syncedObservations: observations.length,
                vaultSplit: 'RA-10173-ISOLATED',
              })
            );
          } catch (err) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: false,
                error: err instanceof Error ? err.message : 'Invalid sync payload',
              })
            );
          }
        });
      });
    },
  };
}
