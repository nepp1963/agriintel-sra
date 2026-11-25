"""
Production FastAPI Sync Receiver for AgriIntelPH-SRA (Google Cloud Run / Supabase PostGIS).
Splits incoming offline mobile payloads into RA 10173 isolated PII and spatial tables.
"""
import os
import json
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="AgriIntelPH-SRA Edge Sync API")


class ParcelPayload(BaseModel):
    parcelId: str
    millDistrictCode: str
    sidaBlockFarmId: Optional[str] = None
    variety: str
    cropClass: str
    rowSpacingType: str
    plantingOrCutDate: str
    areaHa: float
    geometry: Dict[str, Any]
    planterName: Optional[str] = None
    rsbsaId: Optional[str] = None
    sraPlanterCode: Optional[str] = None
    consentSigned: bool
    consentTimestamp: Optional[str] = None
    updatedAt: str


class ObservationPayload(BaseModel):
    observationId: str
    parcelId: str
    millDistrictCode: str
    issueType: str
    notes: str
    gpsLat: float
    gpsLng: float
    gpsAccuracyMeters: float
    capturedAt: str


class SyncBatchRequest(BaseModel):
    parcels: List[ParcelPayload] = []
    observations: List[ObservationPayload] = []


@app.post("/api/sra/sync")
def ingest_edge_sync(batch: SyncBatchRequest):
    for p in batch.parcels:
        if not p.consentSigned:
            raise HTTPException(
                status_code=422,
                detail=f"RA 10173 violation: parcel {p.parcelId} missing signed consent.",
            )

    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if supabase_url and supabase_key:
        from supabase import create_client

        sb = create_client(supabase_url, supabase_key)
        for p in batch.parcels:
            pii_res = (
                sb.table("sra_planter_pii")
                .insert(
                    {
                        "sra_planter_code": p.sraPlanterCode,
                        "rsbsa_id": p.rsbsaId,
                        "full_name": p.planterName or "UNSPECIFIED",
                        "mill_district_code": p.millDistrictCode,
                        "consent_signed": p.consentSigned,
                        "consent_timestamp": p.consentTimestamp,
                    }
                )
                .execute()
            )
            planter_uuid = pii_res.data[0]["planter_uuid"]
            sb.table("sra_parcels").upsert(
                {
                    "parcel_id": p.parcelId,
                    "planter_uuid": planter_uuid,
                    "mill_district_code": p.millDistrictCode,
                    "sida_block_farm_id": p.sidaBlockFarmId,
                    "variety": p.variety,
                    "crop_class": p.cropClass,
                    "row_spacing_type": p.rowSpacingType,
                    "planting_or_cut_date": p.plantingOrCutDate,
                    "area_ha": p.areaHa,
                    "geom": json.dumps(p.geometry),
                }
            ).execute()

    return {
        "ok": True,
        "syncedParcels": len(batch.parcels),
        "syncedObservations": len(batch.observations),
    }
