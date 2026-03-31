# ISRAEL SHIELD — Comprehensive System Description for NotebookLM

## Overview

**Israel Shield** ("מגן ישראל") is a full-stack, real-time security intelligence dashboard built to visualize, analyze, and interpret the history of missile, rocket, drone, and terror alerts across Israel. It was developed as part of a Business Intelligence course at Ariel University, under the supervision of Dr. Guy Wachtel, using data from the IDF Home Front Command (Pikud HaOref) and a curated dataset maintained by Dr. Yuval Harpaz on GitHub.

The application runs entirely in the browser (React + TypeScript, Vite build system), requires no backend except for live alerts, and is capable of operating offline through IndexedDB caching.

---

## Who Is It For?

- **Civilians in Israel** seeking to understand safe travel windows and attack patterns in their region
- **Researchers and journalists** analyzing the historical record of security events
- **Students and educators** in security, BI, geopolitics, and data science
- **Policy analysts** comparing intensity and geography of different military operations

---

## What Data Does It Use?

### Historical Data
- **Source:** CSV from `github.com/yuval-harpaz/alarms` — a community-curated dataset of all Home Front Command alerts
- **Coverage:** 2019–2026, 10,000+ alert records
- **Fields per record:** timestamp, city name, threat type code, source indicator, raw category
- **Version management:** GitHub API SHA comparison to detect new CSV versions and auto-update the local IndexedDB cache

### Live Alert Feed
- **Source:** `oref.org.il` (IDF Home Front Command)
- **Mechanism:** 10-second polling interval via CORS proxy (`allorigins.win`)
- **Displayed as:** A scrolling live ticker at the bottom of the dashboard

### Geographic Data
- **450+ city/location coordinates** hardcoded in `baseCoords` dictionary
- **Dynamic geocoding** via OpenStreetMap Nominatim API (rate-limited, cached in localStorage)
- **Coverage:** All Israeli regions including the Gaza Envelope, Northern Border, Central Israel, Negev, Golan Heights, West Bank

---

## Core Features

### 1. Real-Time Dashboard
The top header displays a live connection indicator. A scrolling ticker at the bottom shows the 20 most recent historical alerts and any live alerts detected since the session began. The interface is always "on" — it continues polling for live alerts in the background.

### 2. Multi-Dimensional Filtering
Users can filter the entire dataset simultaneously by:
- **City or region** (multi-select with autocomplete and regional grouping)
- **Threat type** (rockets, hostile aircraft, terrorist infiltration, earthquake, radiological, etc.)
- **Threat source** (Gaza, Lebanon, Iran, Yemen, Syria, Iraq, mixed)
- **Military operation or campaign** (10 named operations from 2019 to 2026)
- **Date range** (start/end date with validation)

All filters combine with AND logic; city selections within a set combine with OR logic. Filtering is debounced at 300ms for performance.

### 3. Time-Series Analysis
The main chart visualizes alert frequency over time at six temporal resolutions:
- **Year** — total alerts per calendar year
- **Month** — normalized average per month across all years
- **Weekday** — average alerts per day of week (Mon–Sun)
- **Hour** — distribution across 24-hour bins
- **Minute** — distribution within a single hour (60 bins)
- **Daytime** — full 1440-minute resolution (HH:MM level)
- **Date** — daily counts with interactive date-zoom slider

The top 15% of frequency bins are highlighted in a pink gradient. Clicking a year bar instantly filters the data to that year.

### 4. Analytics Panel
Alongside the time series, the right panel shows:
- **Top 15 most targeted cities** (interactive bar chart; clicking a city filters the dataset)
- **Threat type distribution** (donut chart; clickable segments)
- **Threat source distribution** (donut chart; clickable segments)
- **Smart Insight** — an auto-generated text summary of the current filtered view (peak attack date, night activity detection, relative security assessment)

### 5. Shower Index ("מדד המקלחת")
A unique feature that calculates the single safest 30-minute window per day for routine activities (e.g., taking a shower). Algorithm:
- Divide 24 hours into 48 half-hour slots
- Weight each slot: `score = count × 3 + neighbor_counts`
- Prioritize waking hours (07:00–22:00)
- Find slot with minimum weighted score
- Calculate Poisson probability: `P(0 alerts) = exp(−λ)` where λ = average alerts per slot per day
- Display as time range + probability percentage (0–100%)

### 6. UAV Route Explorer
Reconstructs likely flight paths of hostile drones ("כלי טיס עוין") from the historical alert sequence using a **Strict Spatio-Temporal Chaining Model**:
- Filters to UAV-type alerts only
- Sorts chronologically (north-to-south tiebreak for simultaneous alerts)
- Chains alerts together if: time gap ≤ 10 minutes AND distance ≤ 20 km (Haversine)
- Applies multi-pass 1-2-1 coordinate smoothing to remove zigzags
- Renders routes as colored polylines on the map:
  - **Orange glow** = selected route
  - **Purple glow** = unselected routes
  - **Green circle** = departure point
  - **Red circle** = endpoint (interception or last alert)
  - Segment thickness and opacity scaled by historical frequency (how many times that city-pair appeared across all routes)

The algorithm has gone through multiple iterations: speed-constrained physics model, hybrid event-ID chaining, pure ID chaining — all were reverted in favor of the simpler but more reliable strict spatio-temporal model.

### 7. Safe Route Planner
A navigation safety advisor that answers: "If I must drive from city A to city B, what time of day has historically been safest?"

**Algorithm:**
1. Geocode start and end cities
2. Query OSRM API for real road distance and duration (6-second timeout, AbortController)
3. Fall back to Haversine × 1.35 multiplier if OSRM fails
4. Interpolate a straight-line path every 5 km
5. Find all cities within 15 km radius of any path point (impact zone)
6. Aggregate historical alert counts per hour for impact zone cities
7. Score each departure hour: `score(h) = Σ alerts[h+i]` for i in [0, duration], handling fractional last hour and midnight wrap
8. Rank all 24 departure hours; output top 12 safest with quiet probability and estimated arrival time
9. Display results as an hourly risk bar chart + ranked departure list

The planner always uses all historical data regardless of active filters (it represents the permanent statistical record, not a current filter view).

**UI:** On desktop, the planner appears inline (replacing the analytics panel) so the map stays visible. On mobile, it appears as a full-screen overlay.

### 8. Map System
The Leaflet-based map shows:
- **Alert markers** — circles sized by alert count, colored red; clicking filters the dataset to that city
- **Reference dots** — small gray dots for all 450+ known locations (navigation reference)
- **UAV route overlays** — colored polylines for drone flight path reconstruction
- **Safe route overlay** — green dashed path + amber impact zone city markers
- Two base layers: street map (CartoDB Light) and satellite imagery (ESRI)

### 9. Comparison Mode
Simultaneously chart two military operations side by side on the time series chart, using different colors (blue vs. amber) to compare attack frequency patterns across campaigns.

### 10. Multi-Language Support
Full localization in 7 languages: **Hebrew, English, Arabic, French, German, Spanish**. The interface switches between RTL (Hebrew, Arabic) and LTR automatically. All threat types, source names, operation names, city names, and UI strings are translated.

### 11. PWA & Offline Capability
- Installable as a Progressive Web App on iOS, Android, and desktop
- IndexedDB caches the full parsed dataset between sessions
- Version-controlled cache: only re-downloads CSV if the GitHub SHA has changed
- Offline browsing of cached data is possible

---

## Technical Architecture

| Layer | Technology |
|-------|------------|
| Frontend framework | React 19 + TypeScript |
| Build tool | Vite 6.2 |
| Styling | Tailwind CSS 4.1 + custom CSS variables |
| Charts | Apache ECharts 6 via echarts-for-react |
| Mapping | Leaflet 1.9 + CartoDB/ESRI tiles |
| Animations | Framer Motion |
| CSV parsing | PapaParse (web worker) |
| Data caching | IndexedDB |
| Geocoding | OpenStreetMap Nominatim |
| Routing | OSRM public API |
| Live alerts | oref.org.il via allorigins.win proxy |
| Analytics | Vercel Analytics |
| AI | Google GenAI SDK (integration placeholder) |
| Deployment | Vercel / static hosting |

---

## Statistical Models Summary

| Model | Type | Purpose |
|-------|------|---------|
| Shower Index | Poisson probability + weighted bucketing | Safest daily activity window |
| Safe Route Departure Scoring | Sliding window aggregation | Safest departure time for a trip |
| UAV Route Reconstruction | Spatio-temporal greedy chaining | Historical drone flight path reconstruction |
| Time Series Aggregation | Binning + normalization | Pattern detection by time granularity |
| Impact Zone Detection | Haversine radius search | Cities affected by a travel route |
| Top 15% Highlight | Percentile thresholding | Visual emphasis of high-frequency periods |

---

## Data Dimensions

| Dimension | Scale |
|-----------|-------|
| Historical alert records | 10,000+ |
| Time span covered | 2019–2026 (7 years) |
| Geographic locations mapped | 450+ cities/regions |
| Named military operations | 10 + "Routine" |
| Threat categories | 9 |
| Threat source classifications | 8 |
| Languages supported | 7 |
| Temporal resolutions | 7 |

---

## Innovation & Uniqueness

1. **Combined live + historical intelligence** — unique in combining the live IDF feed with 7 years of historical data in a single interface
2. **UAV flight path reconstruction** — no other public tool attempts to reconstruct drone routes from alert sequences
3. **Statistical safe-route planner** — probabilistic departure time advisor based on historical threat corridors
4. **Multi-operation comparison** — enables academic and journalistic analysis across distinct military campaigns
5. **Fully client-side with offline capability** — no proprietary backend, no subscription, runs in any browser
6. **7-language RTL/LTR interface** — accessible to the entire population of Israel and Arabic-speaking neighbors
7. **Shower Index** — a human-centric safety metric turned into a concrete, actionable daily recommendation

---

## Potential & Future Work

- **Predictive modeling:** Machine learning (LSTM, temporal convolutional nets) to forecast alert probability by hour
- **Real-time route monitoring:** Live route advisory that updates as new alerts arrive during a trip
- **Community reports integration:** Allow civilians to report additional observations
- **Extended geographic coverage:** Lebanon, Gaza, West Bank threat-side mapping
- **Emergency notification system:** Push alerts for a user's saved route or home city
- **Academic datasets:** Export filtered datasets for research
- **Integration with navigation apps:** Waze/Google Maps plugin
- **Clustering analysis:** Identify spatial clusters of attacks across operations

---

## Dedication

The application is dedicated to the memory of the victims of October 7th, 2023, and all those who have fallen in the ongoing conflict.

*Data: IDF Home Front Command (Pikud HaOref) & Dr. Yuval Harpaz's dataset.*
*Developed as part of a BI course at Ariel University, supervised by Dr. Guy Wachtel.*
