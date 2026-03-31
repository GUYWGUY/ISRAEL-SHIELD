export interface AlertData {
  time: string;
  cities: string;
  threatStr: string;
  sourceStr: string;
  dateObj: Date;
  coords: [number, number];
  operationsArray: string[];
}

export interface HourlyRisk {
  hour: number;
  count: number;
}

export interface SafeHourOption {
  hour: number;           // departure hour (0-23)
  windowScore: number;    // weighted alert count across travel window
  quietProbability: number; // 0-100 relative to riskiest departure
  rank: number;           // 1 = safest
  arrivalHour: number;    // estimated arrival hour
  arrivalMin: number;     // estimated arrival minute
}

export interface RouteImpactData {
  impactZoneCities: string[];
  hourlyRisk: HourlyRisk[];      // raw per-hour counts (for the chart, unchanged)
  safestHour: number | null;     // best departure hour
  riskiestHour: number | null;   // worst departure hour
  totalAlerts: number;
  interpolatedPath: [number, number][];
  top5SafestHours: SafeHourOption[];
  travelDurationHours: number;
  estimatedDistanceKm: number;
  isRoadBased: boolean;
}

// Haversine distance in km
export function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Interpolate points natively between start and end (~every 5km)
function interpolatePath(start: [number, number], end: [number, number], intervalKm: number = 5): [number, number][] {
  const totalDist = getDistanceKm(start[0], start[1], end[0], end[1]);
  if (totalDist === 0) return [start];
  const steps = Math.ceil(totalDist / intervalKm);
  const path: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const fraction = i / steps;
    path.push([
      start[0] + (end[0] - start[0]) * fraction,
      start[1] + (end[1] - start[1]) * fraction,
    ]);
  }
  return path;
}

/**
 * Returns the cumulative weighted alert score for a trip departing at
 * integer hour `startH` and lasting `durationH` hours.
 * Handles fractional last hour and wraps midnight.
 */
function getWindowScore(hourCounts: number[], startH: number, durationH: number): number {
  if (durationH <= 0) return hourCounts[startH % 24];
  let score = 0;
  const fullHours = Math.floor(durationH);
  const partialFraction = durationH - fullHours;
  for (let i = 0; i < fullHours; i++) {
    score += hourCounts[(startH + i) % 24];
  }
  if (partialFraction > 0.001) {
    score += hourCounts[(startH + fullHours) % 24] * partialFraction;
  }
  return score;
}

export function calculateSafeRoute(
  startCity: string,
  endCity: string,
  getCityCoords: (city: string) => [number, number] | null | undefined,
  allCityNames: string[],
  globalData: AlertData[],
  radiusKm: number = 15,
  travelDurationHours: number = 0,
  estimatedDistanceKm: number = 0,
  isRoadBased: boolean = false,
): RouteImpactData | null {
  const startCoords = getCityCoords(startCity);
  const endCoords = getCityCoords(endCity);
  if (!startCoords || !endCoords) return null;

  // 1. Interpolated path
  const path = interpolatePath(startCoords, endCoords, 5);

  // 2. Impact zone cities within radiusKm of path
  const impactZoneCities = new Set<string>();
  allCityNames.forEach(city => {
    const coords = getCityCoords(city);
    if (!coords) return;
    for (const p of path) {
      if (getDistanceKm(p[0], p[1], coords[0], coords[1]) <= radiusKm) {
        impactZoneCities.add(city);
        break;
      }
    }
  });

  const targetCitiesArray = Array.from(impactZoneCities);
  if (targetCitiesArray.length === 0) return null;

  // 3. Filter alerts to zone
  const routeAlerts = globalData.filter(d => d.cities && impactZoneCities.has(d.cities));

  // 4. Raw per-hour counts (for the chart — unchanged)
  const hourCounts = new Array(24).fill(0);
  routeAlerts.forEach(a => {
    hourCounts[a.dateObj.getHours()]++;
  });
  const hourlyRisk: HourlyRisk[] = hourCounts.map((count, hour) => ({ hour, count }));

  // 5. Per-departure-hour window scores
  const departureScores = Array.from({ length: 24 }, (_, h) =>
    getWindowScore(hourCounts, h, travelDurationHours)
  );

  const maxScore = Math.max(...departureScores, 1);
  const minScore = Math.min(...departureScores);

  let safestHour: number | null = null;
  let riskiestHour: number | null = null;
  departureScores.forEach((score, h) => {
    if (safestHour === null || score < departureScores[safestHour!]) safestHour = h;
    if (riskiestHour === null || score > departureScores[riskiestHour!]) riskiestHour = h;
  });

  if (routeAlerts.length === 0) safestHour = 0;

  // 6. Top-5 safest departure hours
  const sorted = departureScores
    .map((score, h) => ({ h, score }))
    .sort((a, b) => a.score - b.score);

  const top5SafestHours: SafeHourOption[] = sorted.slice(0, 12).map((item, idx) => {
    const durationMins = Math.round(travelDurationHours * 60);
    const arrivalTotalMins = item.h * 60 + durationMins;
    return {
      hour: item.h,
      windowScore: item.score,
      quietProbability: maxScore > 0
        ? Math.round((1 - item.score / maxScore) * 100)
        : 100,
      rank: idx + 1,
      arrivalHour: Math.floor(arrivalTotalMins / 60) % 24,
      arrivalMin: arrivalTotalMins % 60,
    };
  });

  return {
    impactZoneCities: targetCitiesArray,
    hourlyRisk,
    safestHour,
    riskiestHour,
    totalAlerts: routeAlerts.length,
    interpolatedPath: path,
    top5SafestHours,
    travelDurationHours,
    estimatedDistanceKm,
    isRoadBased,
  };
}
