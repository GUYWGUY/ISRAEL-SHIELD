import csv
import urllib.request
from datetime import datetime
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

url = "https://raw.githubusercontent.com/yuval-harpaz/alarms/master/data/alarms.csv"
response = urllib.request.urlopen(url)
lines = [l.decode('utf-8') for l in response.readlines()]

reader = csv.reader(lines)
header = next(reader)

all_alerts = []
uav_ids = set()

for row in reader:
    if len(row) < 3: continue
    time_str, cities, threat, event_id = row[0], row[1], row[2], row[3] if len(row)>3 else ''
    
    dt = None
    try:
        dt = datetime.strptime(time_str, "%Y-%m-%d %H:%M:%S")
    except:
        continue
    
    if dt.year == 2026 and dt.month == 3 and dt.day == 26:
        raw_str = (" ".join(row)).lower()
        if "כלי טיס" in raw_str or threat == "5" or threat == "2":
            uav_ids.add(event_id)
            
        all_alerts.append({
            "dt": dt,
            "cities": cities,
            "threat": threat,
            "id": event_id,
            "raw": row
        })

print("--- Checking user claims for 26/3/2026 ---")
for a in all_alerts:
    if any(city in a["cities"] for city in ["עכו", "אושה", "קנעם", "טבעון"]):
        is_uav_related = a["id"] in uav_ids
        print(f"{a['dt'].strftime('%H:%M:%S')} | ID: {a['id']} | UAV_Linked: {is_uav_related} | City: {a['cities']} | Raw: {a['raw']}")
