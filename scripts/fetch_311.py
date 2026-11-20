"""
NYC 311 Data Ingestion & Pre-processing Script
Fetches 311 calls (defaults to Rodent / Pest complaints) from NYC Open Data (Socrata API).
Outputs cleaned GeoJSON into public/data/ for the static web app.
"""

import json

import socrata

OUTPUT_DIR = socrata.OUTPUT_DIR

def fetch_311_sample(complaint_type: str = "Rodent", limit: int = 1500):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    params = {
        "$limit": str(limit),
        "$order": "created_date DESC",
        "$where": f"complaint_type = '{complaint_type}' AND latitude IS NOT NULL",
        "$select": "unique_key,created_date,complaint_type,descriptor,incident_zip,borough,latitude,longitude,location_type",
    }
    print(f"Fetching {limit} records for '{complaint_type}' from NYC Open Data...")
    raw_data = socrata.query(params)

    print(f"Downloaded {len(raw_data)} records.")
    
    features = []
    for row in raw_data:
        try:
            lat = float(row.get("latitude"))
            lng = float(row.get("longitude"))
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [lng, lat]
                },
                "properties": {
                    "id": row.get("unique_key"),
                    "date": row.get("created_date"),
                    "type": row.get("complaint_type"),
                    "desc": row.get("descriptor"),
                    "zip": row.get("incident_zip"),
                    "borough": row.get("borough"),
                    "loc": row.get("location_type")
                }
            })
        except (ValueError, TypeError):
            continue
            
    geojson = {
        "type": "FeatureCollection",
        "features": features
    }
    
    out_file = OUTPUT_DIR / f"{complaint_type.lower()}_sample.geojson"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(geojson, f)
        
    file_size_kb = out_file.stat().st_size / 1024
    print(f"Saved {len(features)} valid points to {out_file} ({file_size_kb:.1f} KB)")

if __name__ == "__main__":
    fetch_311_sample("Rodent", limit=1500)
