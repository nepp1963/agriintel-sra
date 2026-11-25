import { SraParcelRecord, SraFieldObservation } from '../types/sra';

export interface SupabaseSyncConfig {
  url: string;
  anonKey: string;
  accessToken?: string;
}

export function getSupabaseSyncConfig(): SupabaseSyncConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey) return null;
  return {
    url: url.trim().replace(/\/+$/, ''),
    anonKey: anonKey.trim(),
  };
}

export async function pushBatchToSupabaseRpc(
  config: SupabaseSyncConfig,
  parcels: SraParcelRecord[],
  observations: SraFieldObservation[]
): Promise<{ syncedParcels: number; syncedObservations: number }> {
  const bearer = config.accessToken || config.anonKey;
  const res = await fetch(`${config.url}/rest/v1/rpc/upsert_sra_sync_batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.anonKey,
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({
      payload: {
        parcels,
        observations,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Supabase PostGIS sync failed (HTTP ${res.status}): ${errText}`);
  }

  const data = await res.json().catch(() => null);
  return {
    syncedParcels: data?.syncedParcels ?? parcels.length,
    syncedObservations: data?.syncedObservations ?? observations.length,
  };
}
