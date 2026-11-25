import { SraParcelRecord, SraFieldObservation } from '../types/sra';

const DB_NAME = 'agriintelph_sra_edge_db';
const DB_VERSION = 1;
const PARCEL_STORE = 'offline_parcels';
const OBS_STORE = 'offline_observations';

function openEdgeDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PARCEL_STORE)) {
        db.createObjectStore(PARCEL_STORE, { keyPath: 'parcelId' });
      }
      if (!db.objectStoreNames.contains(OBS_STORE)) {
        db.createObjectStore(OBS_STORE, { keyPath: 'observationId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveOfflineParcel(parcel: SraParcelRecord): Promise<void> {
  const db = await openEdgeDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PARCEL_STORE, 'readwrite');
    tx.objectStore(PARCEL_STORE).put({ ...parcel, syncStatus: 'pending' });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveOfflineObservation(obs: SraFieldObservation): Promise<void> {
  const db = await openEdgeDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OBS_STORE, 'readwrite');
    tx.objectStore(OBS_STORE).put({ ...obs, syncStatus: 'pending' });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingSyncCounts(): Promise<{ parcels: number; observations: number }> {
  const db = await openEdgeDb();
  const countPending = (storeName: string) =>
    new Promise<number>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => {
        const items = req.result || [];
        resolve(items.filter((i: { syncStatus: string }) => i.syncStatus === 'pending').length);
      };
      req.onerror = () => reject(req.error);
    });

  const [parcels, observations] = await Promise.all([
    countPending(PARCEL_STORE),
    countPending(OBS_STORE),
  ]);
  return { parcels, observations };
}

/**
 * Auto-Sync Engine: Flushes pending offline records whenever connectivity returns.
 */
export async function flushEdgeSyncQueue(
  syncEndpointUrl: string,
  authToken?: string
): Promise<{ syncedParcels: number; syncedObservations: number }> {
  if (!navigator.onLine) {
    return { syncedParcels: 0, syncedObservations: 0 };
  }

  const db = await openEdgeDb();

  const getAllFromStore = <T>(storeName: string): Promise<T[]> =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

  const pendingParcels = (await getAllFromStore<SraParcelRecord>(PARCEL_STORE)).filter(
    (p) => p.syncStatus === 'pending'
  );
  const pendingObs = (await getAllFromStore<SraFieldObservation>(OBS_STORE)).filter(
    (o) => o.syncStatus === 'pending'
  );

  if (pendingParcels.length === 0 && pendingObs.length === 0) {
    return { syncedParcels: 0, syncedObservations: 0 };
  }

  const res = await fetch(syncEndpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({ parcels: pendingParcels, observations: pendingObs }),
  });

  if (!res.ok) {
    throw new Error(`Sync failed with HTTP ${res.status}`);
  }

  // Mark synced items in IndexedDB
  const markSynced = async <T extends { syncStatus: string }>(storeName: string, items: T[]) =>
    new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      items.forEach((item) => store.put({ ...item, syncStatus: 'synced' }));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

  await Promise.all([
    markSynced(PARCEL_STORE, pendingParcels),
    markSynced(OBS_STORE, pendingObs),
  ]);

  return {
    syncedParcels: pendingParcels.length,
    syncedObservations: pendingObs.length,
  };
}
