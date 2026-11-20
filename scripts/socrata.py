"""
Shared helpers for querying the NYC 311 dataset (erm2-nwe9) via the Socrata SoQL API.
"""

import json
import os
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT_DIR / "public" / "data"
API_URL = "https://data.cityofnewyork.us/resource/erm2-nwe9.json"
PAGE_SIZE = 50_000  # Socrata's maximum $limit

# SSL context (certifi fixes certificate verification on some macOS Pythons)
try:
    import certifi

    ssl_context = ssl.create_default_context(cafile=certifi.where())
except Exception:
    ssl_context = ssl.create_default_context()

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT_DIR / ".env")
except ImportError:
    pass


def get_app_token() -> str:
    """Read Socrata App Token from environment or .env file."""
    token = (
        os.environ.get("NYC_OPEN_DATA_APP_TOKEN")
        or os.environ.get("app_token")
        or os.environ.get("NYC_OPEN_DATA_TOKEN")
    )
    if token:
        return token.strip("\"'")

    # Fallback manual read if python-dotenv is not installed
    env_file = ROOT_DIR / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line.startswith("NYC_OPEN_DATA_APP_TOKEN=") or line.startswith("app_token="):
                return line.split("=", 1)[1].strip("\"'")
    return ""


_TOKEN = get_app_token()


def query(params: dict, retries: int = 5, timeout: int = 180) -> list[dict]:
    """Run a single SoQL request, retrying on throttling / server errors."""
    headers = {"User-Agent": "NYC-311-Gallery/1.0", "Accept": "application/json"}
    if _TOKEN:
        headers["X-App-Token"] = _TOKEN
    url = f"{API_URL}?{urllib.parse.urlencode(params)}"

    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout, context=ssl_context) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or attempt == retries - 1:
                body = e.read().decode("utf-8", "replace")[:500]
                raise RuntimeError(f"HTTP {e.code} for {url}\n{body}") from e
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt == retries - 1:
                raise
        wait = 2 ** (attempt + 1)
        print(f"  request failed, retrying in {wait}s...")
        time.sleep(wait)
    raise RuntimeError("unreachable")


def query_all(params: dict) -> list[dict]:
    """Page through a SoQL query. `params` must include a deterministic $order."""
    assert "$order" in params, "paging requires a stable $order"
    rows: list[dict] = []
    offset = 0
    while True:
        page = query({**params, "$limit": str(PAGE_SIZE), "$offset": str(offset)})
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
        offset += PAGE_SIZE


def has_token() -> bool:
    return bool(_TOKEN)
