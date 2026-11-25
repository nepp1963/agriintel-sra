-- SRA Institutional Extension Schema (RA 10173 & EO 119 Compliant)
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Restricted PII Vault (Accessible ONLY to authorized MDOs & Central HQ via RLS)
CREATE TABLE IF NOT EXISTS sra_planter_pii (
    planter_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sra_planter_code VARCHAR(50) UNIQUE,
    rsbsa_id VARCHAR(50),
    full_name TEXT NOT NULL,
    contact_number VARCHAR(30),
    mill_district_code VARCHAR(20) NOT NULL,
    consent_signed BOOLEAN NOT NULL DEFAULT FALSE,
    consent_timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Anonymized Spatial Parcels (Used by Satellite Worker & PhilSA GeoJSON Exports)
CREATE TABLE IF NOT EXISTS sra_parcels (
    parcel_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planter_uuid UUID REFERENCES sra_planter_pii(planter_uuid) ON DELETE SET NULL,
    mill_district_code VARCHAR(20) NOT NULL,
    sida_block_farm_id VARCHAR(50),
    variety VARCHAR(50),                -- e.g., Phil 7544, Phil 2006-2289
    crop_class VARCHAR(20),             -- Plant, Ratoon 1, Ratoon 2, Ratoon 3+
    row_spacing_type VARCHAR(30),       -- Standard 1.5m, Paired-Row 0.5m+1.5m
    planting_or_cut_date DATE,
    area_ha NUMERIC(10, 4) NOT NULL,
    geom GEOMETRY(MultiPolygon, 4326) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sra_parcels_geom ON sra_parcels USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_sra_parcels_district ON sra_parcels (mill_district_code);

-- 3. Mill Weighbridge & Sugar Recovery Reconciliation
CREATE TABLE IF NOT EXISTS sra_mill_deliveries (
    delivery_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parcel_id UUID REFERENCES sra_parcels(parcel_id) ON DELETE CASCADE,
    crop_year VARCHAR(15) NOT NULL,     -- e.g., '2026-2027'
    harvest_date DATE NOT NULL,
    actual_tons_cane NUMERIC(10, 2) NOT NULL,
    actual_tc_ha NUMERIC(8, 2) NOT NULL,
    lkg_tc NUMERIC(6, 3),               -- Sugar recovery (LKg/TC)
    mill_central_code VARCHAR(30),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sra_planter_pii ENABLE ROW LEVEL SECURITY;
ALTER TABLE sra_parcels ENABLE ROW LEVEL SECURITY;
