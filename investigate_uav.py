import csv
from datetime import datetime

csv_path = "public/alarms.csv"

alerts = []
with open(csv_path, 'r', encoding='utf-8') as f:
    reader = csv.reader(f)
    header = next(reader)
    for row in reader:
        if len(row) < 3: continue
        time_str, cities, threat = row[0], row[1], row[2]
        
        try:
            dt = datetime.strptime(time_str, "%d/%m/%Y %H:%M:%S")
        except:
            continue
            
        if dt.year == 2026 and dt.month == 3 and dt.day == 17:
            if "כלי טיס" in threat or "טיס עוין" in threat:
                if 19 <= dt.hour <= 21: # Look between 19:00 and 21:59
                    alerts.append({
                        "time": dt,
                        "cities": cities,
                        "threat": threat
                    })

alerts.sort(key=lambda x: x["time"])

print(f"Found {len(alerts)} UAV alerts on 17/03/2026 between 19:00 and 21:59:")
for a in alerts:
    print(f"{a['time'].strftime('%H:%M:%S')} - {a['cities']}")
