import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ShieldCheck,
  Wifi,
  WifiOff,
  RefreshCw,
  MapPin,
  ClipboardCheck,
  AlertTriangle,
  Crosshair,
  RotateCcw,
  Trash2,
  Download,
  Upload,
} from 'lucide-react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { FarmBoundaryEditor } from '../../components/FarmBoundaryEditor';
import { useLocation } from '../../context/LocationContext';
import {
  SraUserRole,
  SugarcaneCropClass,
  RowSpacingType,
  SraFieldObservation,
} from '../types/sra';
import {
  saveOfflineParcel,
  saveOfflineObservation,
  getPendingSyncCounts,
  flushEdgeSyncQueue,
} from '../offline/sraSyncQueue';
import { calculateHectares, findOverlappingParcels } from '../utils/sraGeometry';

interface SraFieldDrawerProps {
  defaultDistrictCode?: string;
  existingParcels?: Array<{
    parcelId: string;
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  }>;
  syncEndpointUrl?: string;
}

interface LatLngPoint {
  lat: number;
  lng: number;
}

function MapClickVertexAdder({
  enabled,
  onAddVertex,
}: {
  enabled: boolean;
  onAddVertex: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (enabled) {
        onAddVertex(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

function MapRecenterController({
  targetCenter,
  triggerKey,
}: {
  targetCenter: LatLngPoint;
  triggerKey: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (triggerKey > 0) {
      map.flyTo([targetCenter.lat, targetCenter.lng], 17, { duration: 0.8 });
    }
  }, [triggerKey, targetCenter.lat, targetCenter.lng, map]);
  return null;
}

export const SraFieldDrawer: React.FC<SraFieldDrawerProps> = ({
  defaultDistrictCode = 'MD-04-PAMPANGA',
  existingParcels = [],
  syncEndpointUrl = '/api/sra/sync',
}) => {
  const { location } = useLocation();
  const baseLat = location?.lat ?? 15.148;
  const baseLng = location?.lng ?? 120.6885;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [role, setRole] = useState<SraUserRole>('field_tech');
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingCounts, setPendingCounts] = useState<{
    parcels: number;
    observations: number;
  }>({ parcels: 0, observations: 0 });
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Live Interactive Boundary Coordinates
  const [coords, setCoords] = useState<LatLngPoint[]>([
    { lat: baseLat - 0.002, lng: baseLng - 0.0025 },
    { lat: baseLat - 0.002, lng: baseLng + 0.0025 },
    { lat: baseLat + 0.002, lng: baseLng + 0.0025 },
    { lat: baseLat + 0.002, lng: baseLng - 0.0025 },
  ]);
  const [recenterKey, setRecenterKey] = useState<number>(0);
  const [isDrawingMode, setIsDrawingMode] = useState<boolean>(true);
  const [mapLayer, setMapLayer] = useState<'satellite' | 'street'>('satellite');
  const [hidePointers, setHidePointers] = useState<boolean>(false);

  // Parcel & RA 10173 Consent State
  const [millDistrictCode, setMillDistrictCode] = useState<string>(defaultDistrictCode);
  const [sidaBlockFarmId, setSidaBlockFarmId] = useState<string>('');
  const [variety, setVariety] = useState<string>('Phil 7544');
  const [cropClass, setCropClass] = useState<SugarcaneCropClass>('Plant');
  const [rowSpacingType, setRowSpacingType] =
    useState<RowSpacingType>('Paired-Row (0.5m + 1.5m)');
  const [planterName, setPlanterName] = useState<string>('');
  const [rsbsaId, setRsbsaId] = useState<string>('');
  const [consentSigned, setConsentSigned] = useState<boolean>(false);

  // Field Observation State
  const [issueType, setIssueType] =
    useState<SraFieldObservation['issueType']>('healthy');
  const [notes, setNotes] = useState<string>('');

  // Convert live vertices into valid closed GeoJSON Polygon
  const livePolygon: GeoJSON.Polygon | null = useMemo(() => {
    if (coords.length < 3) return null;
    const ring = coords.map((c) => [c.lng, c.lat]);
    ring.push([coords[0].lng, coords[0].lat]);
    return {
      type: 'Polygon',
      coordinates: [ring],
    };
  }, [coords]);

  const computedHa = useMemo(
    () => (livePolygon ? calculateHectares(livePolygon) : 0),
    [livePolygon]
  );

  const overlaps = useMemo(
    () => (livePolygon ? findOverlappingParcels(livePolygon, existingParcels) : []),
    [livePolygon, existingParcels]
  );

  const centroid = useMemo(() => {
    if (coords.length === 0) return { lat: baseLat, lng: baseLng };
    const sum = coords.reduce(
      (acc, c) => ({ lat: acc.lat + c.lat, lng: acc.lng + c.lng }),
      { lat: 0, lng: 0 }
    );
    return { lat: sum.lat / coords.length, lng: sum.lng / coords.length };
  }, [coords, baseLat, baseLng]);

  const refreshCounts = async () => {
    const counts = await getPendingSyncCounts();
    setPendingCounts(counts);
  };

  useEffect(() => {
    refreshCounts();
    const handleOnline = () => {
      setIsOnline(true);
      flushEdgeSyncQueue(syncEndpointUrl)
        .then(() => refreshCounts())
        .catch(() => {});
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncEndpointUrl]);

  const handleVertexDragEnd = (index: number, newLat: number, newLng: number) => {
    setCoords((prev) =>
      prev.map((pt, idx) => (idx === index ? { lat: newLat, lng: newLng } : pt))
    );
  };

  const handleCaptureGpsCorner = () => {
    if (!navigator.geolocation) {
      setStatusMessage('Device GPS not available in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords((prev) => [
          ...prev,
          { lat: pos.coords.latitude, lng: pos.coords.longitude },
        ]);
        setStatusMessage(
          `Captured GPS corner (${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}) ±${pos.coords.accuracy.toFixed(1)}m.`
        );
      },
      () => {
        setStatusMessage('Unable to read GPS fix — ensure location permission is allowed.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Export current boundary + non-PII agronomic metadata as portable JSON
  const handleSaveLocationJson = () => {
    if (coords.length === 0) {
      setStatusMessage('No boundary corners on the map to save.');
      return;
    }

    const exportPayload = {
      schema: 'AgriIntelPH-SRA-Location-v1',
      exportedAt: new Date().toISOString(),
      millDistrictCode,
      sidaBlockFarmId: sidaBlockFarmId.trim() || null,
      variety,
      cropClass,
      rowSpacingType,
      areaHa: computedHa,
      centroid,
      coords,
      geometry: livePolygon,
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeDistrict = millDistrictCode.replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateTag = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `${safeDistrict}_parcel_${dateTag}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setStatusMessage(
      `Saved ${coords.length}-corner location (${computedHa.toFixed(4)} ha) to ${link.download}.`
    );
  };

  // Load boundary JSON (supports AgriIntelPH-SRA JSON, GeoJSON Feature/Polygon, or [{lat, lng}])
  const handleLoadLocationJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        let loadedCoords: LatLngPoint[] = [];

        if (Array.isArray(parsed.coords)) {
          loadedCoords = parsed.coords
            .filter(
              (pt: unknown): pt is LatLngPoint =>
                typeof pt === 'object' &&
                pt !== null &&
                typeof (pt as LatLngPoint).lat === 'number' &&
                typeof (pt as LatLngPoint).lng === 'number'
            )
            .map((pt: LatLngPoint) => ({ lat: pt.lat, lng: pt.lng }));
        } else if (Array.isArray(parsed)) {
          loadedCoords = parsed
            .filter(
              (pt: unknown): pt is LatLngPoint =>
                typeof pt === 'object' &&
                pt !== null &&
                typeof (pt as LatLngPoint).lat === 'number' &&
                typeof (pt as LatLngPoint).lng === 'number'
            )
            .map((pt: LatLngPoint) => ({ lat: pt.lat, lng: pt.lng }));
        } else {
          const geom =
            parsed.geometry?.type === 'Polygon'
              ? parsed.geometry
              : parsed.type === 'Feature' && parsed.geometry?.type === 'Polygon'
              ? parsed.geometry
              : parsed.type === 'Polygon'
              ? parsed
              : parsed.type === 'FeatureCollection' &&
                parsed.features?.[0]?.geometry?.type === 'Polygon'
              ? parsed.features[0].geometry
              : null;

          if (geom && Array.isArray(geom.coordinates?.[0])) {
            const ring: number[][] = geom.coordinates[0];
            // Strip duplicate closing vertex if present
            const openRing =
              ring.length > 1 &&
              ring[0][0] === ring[ring.length - 1][0] &&
              ring[0][1] === ring[ring.length - 1][1]
                ? ring.slice(0, -1)
                : ring;

            loadedCoords = openRing.map(([lng, lat]) => ({ lat, lng }));
          }
        }

        if (loadedCoords.length < 3) {
          setStatusMessage(
            'Invalid location JSON: file must contain at least 3 valid polygon coordinates.'
          );
          return;
        }

        setCoords(loadedCoords);
        if (typeof parsed.millDistrictCode === 'string') {
          setMillDistrictCode(parsed.millDistrictCode);
        }
        if (typeof parsed.sidaBlockFarmId === 'string') {
          setSidaBlockFarmId(parsed.sidaBlockFarmId);
        }
        if (typeof parsed.variety === 'string') {
          setVariety(parsed.variety);
        }
        if (
          parsed.cropClass === 'Plant' ||
          parsed.cropClass === 'Ratoon 1' ||
          parsed.cropClass === 'Ratoon 2' ||
          parsed.cropClass === 'Ratoon 3+'
        ) {
          setCropClass(parsed.cropClass);
        }
        if (
          parsed.rowSpacingType === 'Paired-Row (0.5m + 1.5m)' ||
          parsed.rowSpacingType === 'Standard (1.5m)' ||
          parsed.rowSpacingType === 'Other'
        ) {
          setRowSpacingType(parsed.rowSpacingType);
        }

        setRecenterKey((k) => k + 1);
        setStatusMessage(
          `Loaded ${loadedCoords.length} corners from "${file.name}" and centered map.`
        );
      } catch {
        setStatusMessage(`Could not parse "${file.name}" — please select a valid JSON file.`);
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  const handleSaveParcelOffline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!livePolygon || coords.length < 3) {
      setStatusMessage('Draw or capture at least 3 boundary corners on the map first.');
      return;
    }
    if (!consentSigned) {
      setStatusMessage(
        'RA 10173 notice: Farmer informed consent must be checked before saving parcel records.'
      );
      return;
    }

    const parcelId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `sra-${Date.now()}`;

    await saveOfflineParcel({
      parcelId,
      millDistrictCode,
      sidaBlockFarmId: sidaBlockFarmId.trim() || undefined,
      variety,
      cropClass,
      rowSpacingType,
      plantingOrCutDate: new Date().toISOString().slice(0, 10),
      areaHa: computedHa,
      geometry: livePolygon,
      planterName: planterName.trim() || undefined,
      rsbsaId: rsbsaId.trim() || undefined,
      consentSigned: true,
      consentTimestamp: new Date().toISOString(),
      syncStatus: 'pending',
      updatedAt: new Date().toISOString(),
    });

    setPlanterName('');
    setRsbsaId('');
    setSidaBlockFarmId('');
    setNotes('');
    await refreshCounts();
    setStatusMessage(
      `Saved parcel (${computedHa.toFixed(4)} ha, ${coords.length} vertices) to offline queue.`
    );
  };

  const handleSaveObservationOffline = async () => {
    const obsId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `obs-${Date.now()}`;

    await saveOfflineObservation({
      observationId: obsId,
      parcelId: 'active-mapped-parcel',
      millDistrictCode,
      issueType,
      notes: notes.trim() || `Field check: ${issueType}`,
      gpsLat: Number(centroid.lat.toFixed(6)),
      gpsLng: Number(centroid.lng.toFixed(6)),
      gpsAccuracyMeters: 4.2,
      syncStatus: 'pending',
      capturedAt: new Date().toISOString(),
    });

    setNotes('');
    await refreshCounts();
    setStatusMessage(
      `Logged "${issueType}" field observation at (${centroid.lat.toFixed(4)}, ${centroid.lng.toFixed(4)}).`
    );
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const result = await flushEdgeSyncQueue(syncEndpointUrl);
      await refreshCounts();
      setStatusMessage(
        `Sync complete: ${result.syncedParcels} parcel(s), ${result.syncedObservations} observation(s) pushed to RA 10173 vault.`
      );
    } catch {
      setStatusMessage(
        'Offline or sync endpoint unreachable — items remain safely queued in IndexedDB.'
      );
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 text-slate-100">
      {/* Hidden JSON File Input for Load Location */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.geojson,application/json"
        onChange={handleLoadLocationJson}
        className="hidden"
      />

      {/* Top Status & Role Bar */}
      <div className="bg-slate-900 border border-emerald-800/60 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-emerald-300 flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            SRA Mill District Field &amp; Compliance Console
          </h2>
          <p className="text-xs text-slate-400">
            Edge-Capable Field Data Capture with Auto-Sync &bull; RA 10173 PII Separation
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Active SRA Role"
            value={role}
            onChange={(e) => setRole(e.target.value as SraUserRole)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
          >
            <option value="field_tech">Role: MDO Field Tech</option>
            <option value="block_farm_lead">Role: SIDA Block Farm Lead</option>
            <option value="mdo">Role: Mill District Officer (MDO)</option>
            <option value="central_hq">Role: SRA Central HQ</option>
          </select>

          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
              isOnline
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                : 'bg-amber-950 text-amber-300 border border-amber-700/60'
            }`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {isOnline ? 'Online' : 'Offline Mode'}
          </span>

          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            Sync ({pendingCounts.parcels + pendingCounts.observations})
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="bg-emerald-950/60 border border-emerald-700/60 rounded-lg px-4 py-2.5 text-xs text-emerald-200 flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      {overlaps.length > 0 && (
        <div className="bg-amber-950/60 border border-amber-700/60 rounded-lg px-4 py-2.5 text-xs text-amber-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>Boundary overlap detected with {overlaps.length} existing parcel(s).</span>
        </div>
      )}

      {/* Interactive Leaflet Parcel Boundary Map */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Live Farm Boundary Mapper ({coords.length} corners)
            </h3>
            <p className="text-[11px] text-slate-400">
              Click map to add corners, drag blue markers to adjust edges, or save/load boundary JSON.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={handleSaveLocationJson}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-800/80 hover:bg-emerald-700 border border-emerald-600/70 text-emerald-100 font-medium cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Save Location (JSON)
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-800/80 hover:bg-indigo-700 border border-indigo-600/70 text-indigo-100 font-medium cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Load Location (JSON)
            </button>

            <button
              type="button"
              onClick={() =>
                setMapLayer((prev) => (prev === 'satellite' ? 'street' : 'satellite'))
              }
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer"
            >
              {mapLayer === 'satellite' ? 'Street Basemap' : 'Satellite Basemap'}
            </button>

            <button
              type="button"
              onClick={() => setHidePointers((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-lg border font-medium cursor-pointer ${
                hidePointers
                  ? "bg-amber-900/70 border-amber-600 text-amber-200"
                  : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200"
              }`}
            >
              {hidePointers ? "Show Pointers" : "Hide Pointers"}
            </button>

            <button
              type="button"
              onClick={handleCaptureGpsCorner}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-600 text-white font-medium cursor-pointer"
            >
              <Crosshair className="w-3.5 h-3.5" />
              + GPS Corner
            </button>

            <button
              type="button"
              onClick={() => setCoords((prev) => prev.slice(0, -1))}
              disabled={coords.length === 0}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Undo
            </button>

            <button
              type="button"
              onClick={() => {
                setCoords([]);
                setIsDrawingMode(true);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800/70 text-rose-200 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          </div>
        </div>

        <div className={`w-full h-[380px] sm:h-auto sm:aspect-[2/1] rounded-lg overflow-hidden border border-slate-800 ${hidePointers ? "sra-hide-pointers" : ""}`}>
          <MapContainer
            key={hidePointers ? "sra-map-no-pins" : "sra-map-pins"}
            center={[baseLat, baseLng]}
            zoom={16}
            style={{ height: '100%', width: '100%' }}
          >
            {mapLayer === 'satellite' ? (
              <TileLayer
                attribution="Esri World Imagery"
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              />
            ) : (
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
            )}

            <MapRecenterController targetCenter={centroid} triggerKey={recenterKey} />

            <MapClickVertexAdder
              enabled={isDrawingMode}
              onAddVertex={(lat, lng) => setCoords((prev) => [...prev, { lat, lng }])}
            />

            {coords.length > 0 && (
              <FarmBoundaryEditor
                coords={coords}
                isEditing={!hidePointers}
                onVertexDragEnd={handleVertexDragEnd}
              />
            )}
          </MapContainer>
        </div>
      </div>

      {/* Parcel & RA 10173 Form */}
      <form
        onSubmit={handleSaveParcelOffline}
        className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h3 className="text-sm font-semibold text-white">
            1. Parcel Boundary &amp; Agronomic Record
          </h3>
          <span className="text-xs font-mono text-emerald-400">
            Computed Area: {computedHa.toFixed(4)} ha
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">Mill District Code</label>
            <input
              type="text"
              value={millDistrictCode}
              onChange={(e) => setMillDistrictCode(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
              required
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Sugarcane Variety</label>
            <input
              type="text"
              value={variety}
              onChange={(e) => setVariety(e.target.value)}
              placeholder="e.g., Phil 7544"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Crop Class</label>
            <select
              value={cropClass}
              onChange={(e) => setCropClass(e.target.value as SugarcaneCropClass)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
            >
              <option value="Plant">Plant Cane</option>
              <option value="Ratoon 1">Ratoon 1</option>
              <option value="Ratoon 2">Ratoon 2</option>
              <option value="Ratoon 3+">Ratoon 3+</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Row Spacing</label>
            <select
              value={rowSpacingType}
              onChange={(e) => setRowSpacingType(e.target.value as RowSpacingType)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
            >
              <option value="Paired-Row (0.5m + 1.5m)">Paired-Row (0.5m + 1.5m)</option>
              <option value="Standard (1.5m)">Standard (1.5m)</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">SIDA Block Farm ID (Optional)</label>
            <input
              type="text"
              value={sidaBlockFarmId}
              onChange={(e) => setSidaBlockFarmId(e.target.value)}
              placeholder="e.g., SIDA-BF-019"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1">RSBSA ID (Restricted PII)</label>
            <input
              type="text"
              value={rsbsaId}
              onChange={(e) => setRsbsaId(e.target.value)}
              placeholder="Optional RSBSA reference"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">
              Planter / Block Lead Name (Isolated PII Vault)
            </label>
            <input
              type="text"
              value={planterName}
              onChange={(e) => setPlanterName(e.target.value)}
              placeholder="Stored separately from spatial geometry"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
            />
          </div>
        </div>

        {/* RA 10173 Informed Consent Checkbox */}
        <label className="flex items-start gap-2.5 bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={consentSigned}
            onChange={(e) => setConsentSigned(e.target.checked)}
            className="mt-0.5 accent-emerald-500"
          />
          <span className="text-slate-300 leading-relaxed">
            <strong className="text-emerald-300 inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> RA 10173 Informed Consent:
            </strong>{' '}
            Planter/representative consents to parcel boundary mapping, agronomic monitoring, and
            district-level yield analysis under SRA &amp; Data Privacy Act safeguards.
          </span>
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="text-[11px] text-slate-400">
            Queued: {pendingCounts.parcels} parcel(s) &bull; {pendingCounts.observations} observation(s)
          </span>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
          >
            Save Parcel to Offline Queue
          </button>
        </div>
      </form>

      {/* Field Pest & Stress Observation Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
        <h3 className="text-sm font-semibold text-white">
          2. Field Pest / Stress Ground-Truth Log
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-slate-400 mb-1">Condition / Pest Flag</label>
            <select
              value={issueType}
              onChange={(e) =>
                setIssueType(e.target.value as SraFieldObservation['issueType'])
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
            >
              <option value="healthy">Healthy Canopy</option>
              <option value="rssi_scale">RSSI (Red-Striped Soft Scale)</option>
              <option value="smut">Smut</option>
              <option value="pokkah_boeng">Pokkah Boeng</option>
              <option value="waterlogging">Waterlogging / Drainage</option>
              <option value="drought_stress">Moisture / Dry-Off Stress</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-slate-400 mb-1">Field Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Canopy yellowing on east block edge; GPS pin verified"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSaveObservationOffline}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white cursor-pointer"
          >
            Log Field Observation Offline
          </button>
        </div>
      </div>
    </div>
  );
};
