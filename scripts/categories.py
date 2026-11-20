"""
Mapping from the app's complaint categories (src/types.ts `ComplaintCategory`) to raw
311 `complaint_type` / `descriptor` values, expressed as SoQL $where clauses.

Values were chosen from a `$group=complaint_type,descriptor` query over erm2-nwe9.
Labels must stay in sync with `ComplaintCategory` in src/types.ts.
"""

CATEGORIES = [
    {
        "label": "Rodent / Pest",
        "slug": "rodent-pest",
        "where": "complaint_type = 'Rodent' OR (complaint_type = 'UNSANITARY CONDITION' AND descriptor = 'PESTS')",
        "definition": "Rodent complaints (rat/mouse sightings, signs of rodents, conditions attracting rodents) "
        "plus housing 'Unsanitary Condition' complaints with the descriptor 'Pests'.",
    },
    {
        "label": "Noise - Residential",
        "slug": "noise-residential",
        "where": "complaint_type = 'Noise - Residential'",
        "definition": "Noise complaints about residential buildings (loud music, banging, talking, etc.).",
    },
    {
        "label": "Heat & Hot Water",
        "slug": "heat-hot-water",
        "where": "complaint_type = 'HEAT/HOT WATER'",
        "definition": "Housing complaints about missing heat or hot water.",
    },
    {
        "label": "Illegal Parking",
        "slug": "illegal-parking",
        "where": "complaint_type = 'Illegal Parking'",
        "definition": "Illegal parking complaints (hydrants, bike lanes, double parking, etc.).",
    },
    {
        "label": "Blocked Driveway",
        "slug": "blocked-driveway",
        "where": "complaint_type = 'Blocked Driveway'",
        "definition": "Complaints about vehicles blocking a driveway.",
    },
    {
        "label": "Sanitation / Dirty Conditions",
        "slug": "sanitation",
        "where": "complaint_type IN ('Dirty Condition', 'Dirty Conditions', 'Sanitation Condition', 'Illegal Dumping')",
        "definition": "Dirty streets and lots, sanitation conditions, and illegal dumping.",
    },
]
