"""
NYC 311 Data Ingestion & Pre-processing Script
Fetches 311 calls (defaults to Rodent / Pest complaints) from NYC Open Data (Socrata API).
Outputs cleaned GeoJSON into public/data/ for the static web app.
"""

import json
import os
import ssl
import urllib.parse
import urllib.request
from pathlib import Path

# SSL Context for macOS certificate verification
try:
    import certifi
    ssl_context = ssl.create_default_context(cafile=certifi.where())
except Exception:
    ssl_context = ssl._create_unverified_context()

# Load environment variables using python-dotenv
try:
    from dotenv import load_dotenv
    ROOT_DIR = Path(__file__).resolve().parent.parent
    load_dotenv(ROOT_DIR / ".env")
except ImportError:
    pass

ROOT_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT_DIR / "public" / "data"
API_URL = "https://data.cityofnewyork.us/resource/erm2-nwe9.json"

def get_app_token() -> str:
    """Read Socrata App Token from environment or .env file."""
    token = (
        os.environ.get("NYC_OPEN_DATA_APP_TOKEN")
        or os.environ.get("app_token")
        or os.environ.get("NYC_OPEN_DATA_TOKEN")
    )
    if token:
        return token.strip('"\'')
    
    # Fallback manual read if python-dotenv is not installed
    env_file = ROOT_DIR / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line.startswith("NYC_OPEN_DATA_APP_TOKEN=") or line.startswith("app_token="):
                return line.split("=", 1)[1].strip('"\'')
    return ""

def fetch_311_sample(complaint_type: str = "Rodent", limit: int = 1500):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    token = get_app_token()
    headers = {
        "User-Agent": "NYC-311-Gallery-Scaffold/1.0",
        "Accept": "application/json",
    }
    if token:
        headers["X-App-Token"] = token
        print("Using Socrata App Token from .env")

    params = {
        "$limit": str(limit),
        "$order": "created_date DESC",
        "$where": f"complaint_type = '{complaint_type}' AND latitude IS NOT NULL",
        "$select": "unique_key,created_date,complaint_type,descriptor,incident_zip,borough,latitude,longitude,location_type",
    }
    
    url = f"{API_URL}?{urllib.parse.urlencode(params)}"
    print(f"Fetching {limit} records for '{complaint_type}' from NYC Open Data...")
    
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30, context=ssl_context) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP error {resp.status}")
        raw_data = json.loads(resp.read().decode("utf-8"))
        
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
