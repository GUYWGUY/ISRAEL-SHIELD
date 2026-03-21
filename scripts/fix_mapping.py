import json
import math
import re
import os
import sys

# scripts/fix_mapping.py - Standalone Geographic Auditor for settlement clusters.
# This script identifies both "orphans" (unassigned towns) and "outliers" (misplaced towns).

def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def run_audit():
    # 1. Config
    APP_TSX = 'src/App.tsx'
    HFC_JSON = 'public/hfc_cities.json' # Search order: local -> tmp
    if not os.path.exists(HFC_JSON): HFC_JSON = '/tmp/hfc_cities.json'

    if not os.path.exists(HFC_JSON):
        print("Error: hfc_cities.json not found.")
        return
    if not os.path.exists(APP_TSX):
        print(f"Error: {APP_TSX} not found. Run from project root.")
        return

    # 2. Load Coordinates
    with open(HFC_JSON, 'r', encoding='utf-8') as f:
        hfc_data = json.load(f)
    city_to_coords = {e['name']: (e['lat'], e['lng']) for e in hfc_data if 'lat' in e}

    # 3. Load Current Mapping
    with open(APP_TSX, 'r', encoding='utf-8') as f:
        content = f.read()

    match = re.search(r'const regionToCities: { \[key: string\]: string\[\] } = \{(.*?)\};', content, re.DOTALL)
    if not match:
        print("Error: Could not find regionToCities block in App.tsx")
        return
    
    region_text = match.group(1)
    region_dict = {}
    mapped_cities = set()
    for line in region_text.splitlines():
        m = re.search(r'"(.*?)"\s*:\s*\[(.*?)\]', line)
        if m:
            r_name = m.group(1)
            c_raw = [c.strip().strip('"').strip("'") for c in m.group(2).split(',') if c.strip()]
            region_dict[r_name] = c_raw
            mapped_cities.update(c_raw)

    # 4. Calculate Centroids
    centroids = {}
    for region, cities in region_dict.items():
        coords = [city_to_coords[c] for c in cities if c in city_to_coords]
        if coords:
            centroids[region] = (sum(c[0] for c in coords)/len(coords), sum(c[1] for c in coords)/len(coords))

    # 5. Identify Orphans & Outliers
    all_known_cities = set(city_to_coords.keys())
    orphans = [c for c in all_known_cities if c not in mapped_cities]
    
    moves = []
    MAX_DIST_THRESHOLD = 35.0 #km
    
    for region, cities in list(region_dict.items()):
        if region not in centroids: continue
        c_lat, c_lng = centroids[region]
        for city in list(cities):
            if city not in city_to_coords: continue
            lat, lng = city_to_coords[city]
            dist_current = haversine(lat, lng, c_lat, c_lng)
            
            # Find closest region overall
            best_r, min_d = region, dist_current
            for r2, r2_coords in centroids.items():
                d2 = haversine(lat, lng, r2_coords[0], r2_coords[1])
                if d2 < min_d:
                    min_d, best_r = d2, r2
            
            if (dist_current > MAX_DIST_THRESHOLD and best_r != region) or (dist_current - min_d > 10.0):
                moves.append({'city': city, 'from': region, 'to': best_r, 'dist_from': dist_current, 'dist_to': min_d})
                region_dict[region].remove(city)
                region_dict[best_r].append(city)

    # 6. Proposal
    if not orphans and not moves:
        print("Success: The mapping is geographically optimal!")
        return

    print(f"Audit Result: {len(orphans)} orphans and {len(moves)} outliers found.")
    
    if orphans:
        print("\nOrphan Assignments:")
        for orphan in orphans:
            lat, lng = city_to_coords[orphan]
            best_r, min_d = None, 999999
            for r, r_coords in centroids.items():
                d = haversine(lat, lng, r_coords[0], r_coords[1])
                if d < min_d: min_d, best_r = d, r
            print(f" - {orphan} -> {best_r} ({min_d:.1f}km)")
            region_dict[best_r].append(orphan)

    if moves:
        print("\nOutlier Corrections:")
        for m in moves:
            print(f" - {m['city']}: {m['from']} ({m['dist_from']:.1f}km) -> {m['to']} ({m['dist_to']:.1f}km)")

    # 7. Final JSON Export
    complete_map = {r: sorted(list(set(clt))) for r, clt in region_dict.items()}
    with open('complete_region_mapping.json', 'w', encoding='utf-8') as f:
        json.dump(complete_map, f, ensure_ascii=False, indent=2)
    
    print("\nDone! Full audited mapping saved to complete_region_mapping.json")

if __name__ == "__main__":
    run_audit()
