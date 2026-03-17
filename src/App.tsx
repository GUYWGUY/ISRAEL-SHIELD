/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef, useMemo } from 'react';
import L from 'leaflet';
import Papa from 'papaparse';
import * as echarts from 'echarts';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sun, Moon, Globe, Map as MapIcon, Layers, Calendar, 
  TrendingUp, Info, Search, Filter, BarChart3, PieChart, 
  MapPin, Clock, AlertTriangle, ChevronDown, ChevronUp,
  Sparkles, Languages, Flame, Shield, Menu, X
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

// Ensures Leaflet is available globally for plugins loaded via CDN
if (typeof window !== 'undefined') {
  (window as any).L = L;
}

// --- IndexedDB Helpers ---
const DB_NAME = 'israelShieldDB';
const DB_VERSION = 1;
const STORE_NAME = 'alertsCache';

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveToCache = async (data: any[], lastModified: string) => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(data, 'alerts');
    store.put(lastModified, 'lastModified');
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("Failed to save to cache:", e);
  }
};

const loadFromCache = async (): Promise<{ data: any[], lastModified: string } | null> => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const dataReq = store.get('alerts');
    const dateReq = store.get('lastModified');
    
    return new Promise((resolve) => {
      let results: any = { data: null, lastModified: null };
      dataReq.onsuccess = () => { results.data = dataReq.result; };
      dateReq.onsuccess = () => { results.lastModified = dateReq.result; };
      tx.oncomplete = () => {
        if (results.data && results.lastModified) resolve(results);
        else resolve(null);
      };
      tx.onerror = () => resolve(null);
    });
  } catch (e) {
    console.warn("Failed to load from cache:", e);
    return null;
  }
};

// --- Constants & Dictionaries ---
const daysHe = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const daysEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const translations = {
  he: {
    title: "מגן ישראל | דשבורד חקר נתונים",
    search: "חיפוש עיר/אזור:",
    threat: "סוג איום:",
    source: "מקור איום:",
    operation: "מערכה:",
    all: "הכל",
    loading: "טוען נתונים...",
    totalAlerts: "סה\"כ התרעות במאגר",
    smartInsight: "תובנה סטטיסטית חכמה 🎯",
    lastAlert: "זמן התרעה אחרונה",
    mapTitle: "מפת מוקדים",
    liveAlert: "צבע אדום",
    tickerTitle: "מבזק התרעות",
    timeSeries: "התפלגות התרעות לאורך זמן",
    topCities: "היישובים המותקפים ביותר (Top 15)",
    threatDist: "התפלגות סוגי איום",
    sourceDist: "מקור איום",
    years: "שנים",
    months: "חודשים",
    days: "ימים",
    hours: "שעות",
    minutes: "דקות",
    satellite: "לוויין",
    streets: "רחובות",
    compare: "מצב השוואה",
    showerIndex: "מדד המקלחת 🚿",
    showerDesc: "הזמן הבטוח ביותר למקלחת שקטה",
    generate: "ייצר תובנות",
    generating: "מנתח נתונים...",
    noData: "אין נתונים להצגה",
    warningTime: "זמן התגוננות (שניות)",
  },
  en: {
    title: "Shield of Israel | Data Analytics Dashboard",
    search: "Search City/Area:",
    threat: "Threat Type:",
    source: "Threat Source:",
    operation: "Campaign:",
    all: "All",
    loading: "Loading Data...",
    totalAlerts: "Total Alerts in Database",
    smartInsight: "Smart Statistical Insight 🎯",
    lastAlert: "Last Alert Time",
    mapTitle: "Alert Hotspots Map",
    liveAlert: "Red Color",
    tickerTitle: "Alert Ticker",
    timeSeries: "Alert Distribution Over Time",
    topCities: "Most Targeted Locations (Top 15)",
    threatDist: "Threat Type Distribution",
    sourceDist: "Threat Source",
    years: "Years",
    months: "Months",
    days: "Days",
    hours: "Hours",
    minutes: "Minutes",
    satellite: "Satellite",
    streets: "Streets",
    compare: "Comparison Mode",
    showerIndex: "Shower Index 🚿",
    showerDesc: "Safest time for a quiet shower",
    generate: "Generate Insights",
    generating: "Analyzing data...",
    noData: "No data to display",
    warningTime: "Warning Time (Seconds)",
  }
};

const threatDict: Record<string, string> = {
  "0": "ירי רקטות וטילים",
  "1": "ירי רקטות וטילים",
  "2": "חדירת כלי טיס עוין",
  "3": "רעידת אדמה",
  "4": "אירוע רדיולוגי",
  "5": "חדירת מחבלים",
  "6": "צונאמי",
  "7": "אירוע חומרים מסוכנים",
  "8": "אירוע לא קונבנציונלי"
};

const operationsDict = [
  { name: "חגורה שחורה (2019)", start: new Date("2019-11-12"), end: new Date("2019-11-14T23:59:59") },
  { name: "שומר החומות (2021)", start: new Date("2021-05-10"), end: new Date("2021-05-21T23:59:59") },
  { name: "עלות השחר (2022)", start: new Date("2022-08-05"), end: new Date("2022-08-07T23:59:59") },
  { name: "מגן וחץ (2023)", start: new Date("2023-05-09"), end: new Date("2023-05-13T23:59:59") },
  { name: "מלחמת חרבות ברזל (2023+)", start: new Date("2023-10-07"), end: new Date("2099-12-31T23:59:59") },
  { name: "מתקפת אפריל (איראן 2024)", start: new Date("2024-04-13"), end: new Date("2024-04-14T23:59:59") },
  { name: "מתקפת אוקטובר (איראן 2024)", start: new Date("2024-10-01"), end: new Date("2024-10-01T23:59:59") },
  { name: "ימי תשובה (איראן 2024)", start: new Date("2024-10-26"), end: new Date("2024-10-27T23:59:59") },
  { name: "עם כלביא (איראן 2025)", start: new Date("2025-06-13"), end: new Date("2025-06-24T23:59:59") },
  { name: "כארי ישאג / שאגת הארי (איראן 2026)", start: new Date("2026-02-28"), end: new Date("2026-03-31T23:59:59") }
];

const baseCoords: Record<string, [number, number]> = {
  // עוטף עזה ודרום
  "שדרות": [31.5282, 34.5956], "אשקלון": [31.6693, 34.5715], "נתיבות": [31.4167, 34.5833], "אופקים": [31.3167, 34.6167],
  "באר שבע": [31.2518, 34.7913], "אשדוד": [31.7915, 34.6394], "אילת": [29.5577, 34.9519],
  "כפר עזה": [31.4744, 34.5386], "בארי": [31.4244, 34.4953], "נחל עוז": [31.4700, 34.4969], "מפלסים": [31.5036, 34.5606],
  "ניר עוז": [31.3106, 34.3942], "נירים": [31.3322, 34.3944], "עין השלושה": [31.3522, 34.3944], "כיסופים": [31.3756, 34.3958],
  "כרם שלום": [31.2269, 34.2858], "זיקים": [31.6033, 34.5158], "כרמיה": [31.5942, 34.5458], "יד מרדכי": [31.5861, 34.5572],
  "נתיב העשרה": [31.5961, 34.5472], "סעד": [31.4731, 34.5369], "עלומים": [31.4489, 34.5264], "רעים": [31.3853, 34.4594],
  "מגן": [31.3000, 34.4333], "ניר יצחק": [31.2411, 34.3547], "סופה": [31.2386, 34.3417], "חולית": [31.2403, 34.3167],
  "שדרות איבים וניר עם": [31.5282, 34.5956],
  
  // צפון וקו עימות
  "קרית שמונה": [33.2073, 35.5694], "מטולה": [33.2801, 35.5786], "צפת": [32.9646, 35.4960], "נהריה": [33.0151, 35.0941],
  "חיפה": [32.7940, 34.9896], "עכו": [32.9271, 35.0754], "כרמיאל": [32.9167, 35.2953], "טבריה": [32.7944, 35.5333],
  "קצרין": [32.9922, 35.6917], "שלומי": [33.0744, 35.1436], "מרגליות": [33.2206, 35.5489], "משגב עם": [33.2506, 35.5489],
  "יפתח": [33.1119, 35.5564], "מנרה": [33.1969, 35.5414], "ערב אל עראמשה": [33.0906, 35.1953], "זרעית": [33.0844, 35.2750],
  "שתולה": [33.0781, 35.3119], "נטועה": [33.0644, 35.3503], "מתת": [33.0458, 35.3400], "סאסא": [33.0286, 35.3942],
  "ברעם": [33.0583, 35.4333], "יראון": [33.0758, 35.4544], "אביבים": [33.0933, 35.4644], "דובב": [33.0519, 35.3975],
  "מלכיה": [33.0967, 35.5122], "ראש פינה": [32.9697, 35.5414], "קרית מוצקין": [32.8333, 35.0833], "קרית ביאליק": [32.8333, 35.0833],
  "חורפיש": [33.0167, 35.3500], "מעלות תרשיחא": [33.0167, 35.2667], "מג'דל שמס": [33.2667, 35.7667], "ראג'ר": [33.2750, 35.6219],

  // אזורים כלליים
  "עוטף עזה": [31.4200, 34.4500], "גליל עליון": [33.0500, 35.5000], "גליל מערבי": [33.0300, 35.2000],
  "גולן": [33.1000, 35.7000], "העמקים": [32.6000, 35.3000], "שרון": [32.2500, 34.9000], 
  "דן": [32.0800, 34.7800], "שפלה": [31.9000, 34.8500], "לכיש": [31.5500, 34.7000], "נגב": [31.2000, 34.8000],

  // מרכז
  "תל אביב": [32.0853, 34.7818], "תל אביב - יפו": [32.0853, 34.7818], "ירושלים": [31.7683, 35.2137], "ראשון לציון": [31.9730, 34.7925], 
  "פתח תקווה": [32.0833, 34.8833], "חולון": [32.0167, 34.7667], "בת ים": [32.0167, 34.7333], "רמת גן": [32.0833, 34.8167],
  "הרצליה": [32.1667, 34.8333], "נתניה": [32.3329, 34.8599], "חדרה": [32.4333, 34.9167], "רעננה": [32.1833, 34.8667],
  "כפר סבא": [32.1750, 34.9069], "הוד השרון": [32.1500, 34.8833], "מודיעין": [31.8969, 35.0086], "רחובות": [31.8944, 34.8119],
  "בית שמש": [31.7456, 34.9867], "לוד": [31.9511, 34.8881], "רמלה": [31.9272, 34.8625], "קרית גת": [31.6081, 34.7644],
  "קרית מלאכי": [31.7275, 34.7447], "בני ברק": [32.0833, 34.8333], "גבעתיים": [32.0722, 34.8125],
  "רמת השרון": [32.1397, 34.8397], "נס ציונה": [31.9281, 34.7981], "יבנה": [31.8778, 34.7394],
  "גדרה": [31.8119, 34.7778], "מזכרת בתיה": [31.8539, 34.8433], "גן יבנה": [31.7856, 34.6942], 
  "ערד": [31.2608, 35.2125], "דימונה": [31.0667, 35.0333], "ירוחם": [30.9881, 34.9303], "מצפה רמון": [30.6083, 34.8028],
  "סח'נין": [32.8614, 35.3031], "שפרעם": [32.8053, 35.1706], "טמרה": [32.8536, 35.2014], "נצרת": [32.7019, 35.3033],
  "נוף הגליל": [32.7, 35.31], "עפולה": [32.6078, 35.2892], "מגדל העמק": [32.6733, 35.2417], "בית שאן": [32.4972, 35.4972],
  "אום אל-פחם": [32.5167, 35.1500], "טייבה": [32.2667, 35.0167], "קלנסווה": [32.2833, 35.0333], "באקה אל-גרביה": [32.4167, 35.0333],
  "מרחב דן": [32.0800, 34.7800], "מרחב ירקון": [32.1000, 34.8500], "מרחב לכיש": [31.6000, 34.7500], "מרחב שפלה": [31.9000, 34.8500],
  "מרחב נגב": [31.2000, 34.8000], "מרחב חיפה": [32.8000, 34.9900], "מרחב אשר": [32.9500, 35.1000], "מרחב עמקים": [32.6000, 35.3000],
  "מרחב גליל": [33.0000, 35.4000], "מרחב גולן": [33.1000, 35.7000], "מרחב יהודה": [31.5000, 35.0500], "מרחב שומרון": [32.2000, 35.2000],
  "מרחב אילת": [29.5577, 34.9519], "אלוני הבשן": [33.0444, 35.8361], "קשת": [33.0000, 35.8000], "נטור": [32.8500, 35.7500],
  "חספין": [32.8200, 35.7700], "מבוא חמה": [32.7300, 35.6500], "עין גב": [32.8100, 35.6400], "כנרת": [32.7200, 35.5800],
};

interface AlertData {
  time: string;
  cities: string;
  threat: string;
  category?: string;
  dateObj: Date;
  year: string;
  month: string;
  dayOfWeek: number;
  hour: number;
  threatStr: string;
  sourceStr: string;
  operationsArray: string[];
}

const getWarningTime = (city: string) => {
  const normalized = city.trim();
  if (normalized.includes("שדרות") || normalized.includes("עוטף עזה") || normalized.includes("נתיב העשרה")) return "15 שניות";
  if (normalized.includes("אשקלון") || normalized.includes("נתיבות") || normalized.includes("זיקים")) return "30 שניות";
  if (normalized.includes("אשדוד") || normalized.includes("באר שבע") || normalized.includes("גן יבנה")) return "45-60 שניות";
  if (normalized.includes("תל אביב") || normalized.includes("ירושלים") || normalized.includes("רמת גן")) return "90 שניות";
  if (normalized.includes("חיפה") || normalized.includes("קריות")) return "60 שניות";
  return "דקה וחצי";
};

export default function App() {
  const [globalData, setGlobalData] = useState<AlertData[]>([]);
  const [filteredData, setFilteredData] = useState<AlertData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [liveAlert, setLiveAlert] = useState<{ cities: string; title: string } | null>(null);
  const [geocodingStatus, setGeocodingStatus] = useState("");
  
  // Filters
  const [citySearch, setCitySearch] = useState("");
  const [threatFilter, setThreatFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [operationFilter, setOperationFilter] = useState("all");
  const [timeResolution, setTimeResolution] = useState<'year' | 'month' | 'weekday' | 'hour' | 'minute'>('month');

  // New Features State
  const [darkMode, setDarkMode] = useState(false);
  const [lang, setLang] = useState<'he' | 'en'>('he');
  const [mapLayer, setMapLayer] = useState<'streets' | 'satellite'>('streets');
  const [compareMode, setCompareMode] = useState(false);
  const [compareOperation, setCompareOperation] = useState("all");
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSearchSource, setActiveSearchSource] = useState<'desktop' | 'mobile' | null>(null);

  const t = translations[lang];
  const isRtl = lang === 'he';

  // Refs for charts and map
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const streetLayerRef = useRef<L.TileLayer | null>(null);
  const satelliteLayerRef = useRef<L.TileLayer | null>(null);
  const timeSeriesChartRef = useRef<HTMLDivElement>(null);
  const topCitiesChartRef = useRef<HTMLDivElement>(null);
  const threatChartRef = useRef<HTMLDivElement>(null);
  const sourceChartRef = useRef<HTMLDivElement>(null);
  
  const timeSeriesInstance = useRef<echarts.ECharts | null>(null);
  const topCitiesInstance = useRef<echarts.ECharts | null>(null);
  const threatInstance = useRef<echarts.ECharts | null>(null);
  const sourceInstance = useRef<echarts.ECharts | null>(null);

  const geoCache = useRef<Record<string, [number, number] | "NOT_FOUND">>(
    JSON.parse(localStorage.getItem('alertsGeoCache') || '{}')
  );

  // --- Helper Functions ---
  const getOperationNames = (dateObj: Date) => {
    let matchedOps = [];
    for (let op of operationsDict) {
      if (dateObj >= op.start && dateObj <= op.end) {
        matchedOps.push(op.name);
      }
    }
    return matchedOps.length > 0 ? matchedOps : ["שגרה (ללא מערכה)"];
  };

  const getCityCoords = (cityStr: string) => {
    if (!cityStr) return null;
    if (baseCoords[cityStr]) return baseCoords[cityStr];
    const cached = geoCache.current[cityStr];
    if (cached && cached !== "NOT_FOUND") return cached;
    if (cached === "NOT_FOUND") return null;
    
    for (let key in baseCoords) {
      if (cityStr.includes(key)) return baseCoords[key];
    }
    return null;
  };

  const uniqueCities = useMemo(() => {
    const cities = new Set<string>();
    // Add base coords first
    Object.keys(baseCoords).forEach(c => cities.add(c));
    // Add from data
    globalData.forEach(d => {
      if (d.cities) {
        // Handle comma separated if any, but usually it's one city string
        d.cities.split(',').forEach(c => {
          const trimmed = c.trim();
          if (trimmed) cities.add(trimmed);
        });
      }
    });
    return Array.from(cities).sort((a, b) => a.localeCompare(b, 'he'));
  }, [globalData]);

  const handleCitySearchChange = (val: string, source: 'desktop' | 'mobile') => {
    setCitySearch(val);
    setActiveSearchSource(source);
    if (val.trim().length > 0) {
      const filtered = uniqueCities.filter(c => c.includes(val)).slice(0, 10);
      setCitySuggestions(filtered);
      setShowSuggestions(true);
    } else {
      setCitySuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectCity = (city: string) => {
    setCitySearch(city);
    setShowSuggestions(false);
    setActiveSearchSource(null);
  };

  // --- Data Fetching ---
  useEffect(() => {
    const csvUrl = 'https://raw.githubusercontent.com/yuval-harpaz/alarms/master/data/alarms.csv';
    
    const loadData = async () => {
      setLoading(true);
      setLoadingStatus(t.loading);
      try {
        // 1. Check for remote version info using GitHub API
        let remoteVersion = '';
        try {
          // GitHub API returns the latest commit for this specific file
          const apiURL = 'https://api.github.com/repos/yuval-harpaz/alarms/commits?path=data/alarms.csv&per_page=1';
          const apiRes = await fetch(apiURL);
          if (apiRes.ok) {
            const apiData = await apiRes.json();
            if (apiData && apiData.length > 0) {
              remoteVersion = apiData[0].sha;
              console.log("Remote version (SHA) detected via API:", remoteVersion);
            }
          }
          
          // Fallback to HEAD request if API fails (unlikely but good for robustness)
          if (!remoteVersion) {
            const headRes = await fetch(csvUrl + "?t=" + Date.now(), { method: 'HEAD' });
            remoteVersion = headRes.headers.get('etag') || headRes.headers.get('last-modified') || '';
            console.log("Remote version detected via HEAD (fallback):", remoteVersion || "None");
          }
        } catch (err) {
          console.warn("Version check failed:", err);
        }
        
        // 2. Try loading from cache
        const cached = await loadFromCache();
        
        // --- Caching Strategy ---
        // If we have cached data:
        // A) If we GOT a remote version, it must match.
        // B) If we DID NOT get a remote version (unlikely now), use the cache if it exists.
        const cacheIsGood = cached && (
          (remoteVersion !== '' && cached.lastModified === remoteVersion) ||
          (remoteVersion === '' && cached.data && cached.data.length > 0)
        );

        if (cacheIsGood && cached) {
          console.log("Cache hit! Loading", cached.data.length, "rows from local storage.");
          setLoadingStatus(lang === 'he' ? "טוען מהמטמון (מהיר)..." : "Loading from cache (fast)...");
          setGlobalData(cached.data);
          setFilteredData(cached.data);
          setLoading(false);
          return;
        }

        // 3. Fallback to download if cache miss or outdated
        console.log("Cache miss or outdated. Downloading CSV...");
        setLoadingStatus(lang === 'he' ? "מוריד נתונים מ-GitHub..." : "Downloading data from GitHub...");
        Papa.parse(csvUrl, {
          download: true,
          header: true,
          skipEmptyLines: true,
          worker: true,
          complete: (results) => {
            const parsed = results.data.filter((d: any) => d.time).map((d: any) => {
              // ... existing mapping logic ...
              const dt = new Date(d.time);
              const opsArray = getOperationNames(dt);
              const rawStr = Object.values(d).join(" ").toLowerCase();
              const city = (d.cities || "").toLowerCase();
              let extractedSource = "מעורב / לא סווג";
              
              if (rawStr.includes("איראן") || rawStr.includes("iran")) extractedSource = "איראן";
              else if (rawStr.includes("תימן") || rawStr.includes("yemen") || rawStr.includes("חות'ים")) extractedSource = "תימן";
              else if (rawStr.includes("עיראק") || rawStr.includes("iraq")) extractedSource = "עיראק";
              else if (rawStr.includes("סוריה") || rawStr.includes("syria")) extractedSource = "סוריה";
              else if (rawStr.includes("לבנון") || rawStr.includes("lebanon") || rawStr.includes("חיזבאללה")) extractedSource = "לבנון";
              else if (rawStr.includes("עזה") || rawStr.includes("gaza") || rawStr.includes("חמאס") || rawStr.includes("ג'יהאד")) extractedSource = "רצועת עזה";
              else if (opsArray.some(op => op.includes("איראן"))) {
                if (city.includes("קרית שמונה") || city.includes("מטולה")) extractedSource = "לבנון";
                else extractedSource = "איראן";
              } else {
                if (city.includes("שדרות") || city.includes("אשקלון") || city.includes("עוטף")) extractedSource = "רצועת עזה";
                else if (city.includes("קרית שמונה") || city.includes("מטולה") || city.includes("צפת")) extractedSource = "לבנון";
                else if (city.includes("אילת")) extractedSource = "תימן / עיראק";
              }

              let rawThreatVal = String(d.threat || d.category || '').trim();
              let extractedThreat = threatDict[rawThreatVal] || rawThreatVal || 'אחר';
              if (rawStr.includes("כלי טיס") || rawStr.includes("כטב\"מ")) extractedThreat = "חדירת כלי טיס עוין";
              else if (rawStr.includes("מחבלים")) extractedThreat = "חדירת מחבלים";
              else if (rawStr.includes("חומרים מסוכנים")) extractedThreat = "אירוע חומרים מסוכנים";
              else if (rawStr.includes("רקטות") || rawStr.includes("טילים")) extractedThreat = "ירי רקטות וטילים";

              return {
                ...d,
                dateObj: dt,
                year: dt.getFullYear().toString(),
                month: dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0'),
                dayOfWeek: dt.getDay(),
                hour: dt.getHours(),
                threatStr: extractedThreat,
                sourceStr: extractedSource,
                operationsArray: opsArray 
              };
            });
            setGlobalData(parsed);
            setFilteredData(parsed);
            setLoading(false);
            // If remoteVersion is empty, use 'cached-at-' + current date as a fallback key
            const versionToSave = remoteVersion || ('cached-at-' + new Date().toISOString().split('T')[0]);
            saveToCache(parsed, versionToSave);
          }
        });
      } catch (e) {
        console.error("Data loading failed:", e);
        setLoading(false);
      }
    };

loadData();

    // Live alerts check
    const checkLive = async () => {
      try {
        const orefUrl = encodeURIComponent('https://www.oref.org.il/WarningMessages/alert/alerts.json');
        const response = await fetch(`https://api.allorigins.win/get?url=${orefUrl}`);
        if (response.ok) {
          const rawData = await response.json();
          if (rawData.contents && rawData.contents.trim().length > 0) {
            try {
              if (rawData.contents.trim().startsWith('{') || rawData.contents.trim().startsWith('[')) {
                const alertData = JSON.parse(rawData.contents);
                if (alertData?.data?.length > 0) {
                  setLiveAlert({ cities: alertData.data.join(', '), title: alertData.title || 'התרעה' });
                  return;
                }
              }
            } catch (jsonErr) {
              console.warn("Live alert JSON parse error:", jsonErr);
            }
          }
        }
        setLiveAlert(null);
      } catch (e) { 
        console.warn("Live alert fetch error (likely HTML returned instead of JSON):", e); 
        setLiveAlert(null);
      }
    };
    const interval = setInterval(checkLive, 10000);
    return () => clearInterval(interval);
  }, []);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showSuggestions) {
        // Simple delay to allow click events on suggestions to fire first
        setTimeout(() => setShowSuggestions(false), 200);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSuggestions]);

  // --- Shower Index Calculation ---
  const showerIndex = useMemo(() => {
    if (filteredData.length === 0) return null;
    
    const slots = new Array(48).fill(0);
    filteredData.forEach(d => {
      const minutes = d.hour * 60 + d.dateObj.getMinutes();
      const slotIdx = Math.floor(minutes / 30);
      if (slotIdx >= 0 && slotIdx < 48) {
        slots[slotIdx]++;
      }
    });

    const score = slots.map((val, i) => {
      const prev = slots[(i - 1 + 48) % 48];
      const next = slots[(i + 1) % 48];
      return val * 3 + prev + next;
    });
    
    // Priority range: 07:00 (slot 14) to 22:00 (slot 44)
    const preferredRange = score.slice(14, 44);
    let bestSlot;
    
    if (preferredRange.length > 0) {
      const minPreferred = Math.min(...preferredRange);
      bestSlot = score.indexOf(minPreferred, 14);
    } else {
      const minScore = Math.min(...score);
      bestSlot = score.indexOf(minScore);
    }

    const startHour = Math.floor(bestSlot / 2);
    const startMin = (bestSlot % 2) * 30;
    const endHour = Math.floor((bestSlot + 1) / 2) % 24;
    const endMin = ((bestSlot + 1) % 2) * 30;

    const timeStr = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')} - ${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
    
    return {
      time: timeStr,
      probability: Math.min(100, Math.max(0, 100 - (slots[bestSlot] * 5))) 
    };
  }, [filteredData]);

  // --- Filtering Logic ---
  useEffect(() => {
    const filtered = globalData.filter(d => {
      let matchCity = true, matchThreat = true, matchSource = true, matchOperation = true, matchDate = true;
      if (citySearch) matchCity = d.cities && d.cities.includes(citySearch);
      if (threatFilter !== 'all') matchThreat = d.threatStr === threatFilter;
      if (sourceFilter !== 'all') matchSource = d.sourceStr === sourceFilter;
      
      if (compareMode && compareOperation !== 'all') {
        matchOperation = d.operationsArray.includes(operationFilter) || d.operationsArray.includes(compareOperation);
      } else if (operationFilter !== 'all') {
        matchOperation = d.operationsArray.includes(operationFilter);
      }

      if (dateRange.start) matchDate = matchDate && d.dateObj >= new Date(dateRange.start);
      if (dateRange.end) matchDate = matchDate && d.dateObj <= new Date(dateRange.end);

      return matchCity && matchThreat && matchSource && matchOperation && matchDate;
    });
    console.log("Filtering complete. Global:", globalData.length, "Filtered:", filtered.length);
    setFilteredData(filtered);
  }, [citySearch, threatFilter, sourceFilter, operationFilter, compareOperation, compareMode, dateRange, globalData]);

  // --- Map Initialization ---
  useEffect(() => {
    if (!loading && !mapRef.current) {
      mapRef.current = L.map('map', { zoomControl: false }).setView([31.5, 34.8], 7);
      
      streetLayerRef.current = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap'
      });
      
      satelliteLayerRef.current = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri'
      });

      streetLayerRef.current.addTo(mapRef.current);
      L.control.zoom({ position: 'bottomright' }).addTo(mapRef.current);
    }
  }, [loading]);

  useEffect(() => {
    if (!mapRef.current) return;
    streetLayerRef.current?.remove();
    satelliteLayerRef.current?.remove();

    if (mapLayer === 'satellite') {
      satelliteLayerRef.current?.addTo(mapRef.current);
    } else {
      streetLayerRef.current?.addTo(mapRef.current);
    }
  }, [mapLayer]);

  // --- Map Markers & Geocoding ---
  useEffect(() => {
    if (!mapRef.current) return;
    let isCancelled = false;
    
    markersRef.current.forEach(m => mapRef.current?.removeLayer(m));
    markersRef.current = [];

    const cityCounts: Record<string, number> = {};
    filteredData.forEach(d => {
      if (d.cities) cityCounts[d.cities] = (cityCounts[d.cities] || 0) + 1;
    });

    const queue: { city: string; count: number }[] = [];
    for (let city in cityCounts) {
      const coords = getCityCoords(city);
      if (coords) {
        const marker = L.circleMarker(coords, {
          radius: Math.min(Math.max(cityCounts[city] / 50, 5), 30),
          fillColor: "#E63946",
          color: darkMode ? "#fff" : "#0038B8",
          weight: 1,
          opacity: 1,
          fillOpacity: 0.6
        }).addTo(mapRef.current)
          .bindTooltip(`<b>${city}</b><br>${lang === 'he' ? 'התרעות' : 'Alerts'}: ${cityCounts[city].toLocaleString()}`, { direction: 'top' });
        markersRef.current.push(marker);
      } else if (!geoCache.current.hasOwnProperty(city)) {
        queue.push({ city, count: cityCounts[city] });
      }
    }

    if (queue.length > 0) {
      const processQueue = async () => {
        setGeocodingStatus("מאתר מיקומים...");
        // Limit geocoding to prevent long 'stuck' processes
        const limit = 20;
        const toProcess = queue.slice(0, limit);
        
        for (let i = 0; i < toProcess.length; i++) {
          if (isCancelled) break;
          const item = toProcess[i];
          const cleanName = item.city.replace(/[0-9]/g, '').replace('מרחב', '').split('-')[0].trim();
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanName)}, ישראל`);
            if (!res.ok) throw new Error("Fetch failed");
            const data = await res.json();
            if (data?.[0]) {
              const coords: [number, number] = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
              geoCache.current[item.city] = coords;
              localStorage.setItem('alertsGeoCache', JSON.stringify(geoCache.current));
            } else {
              geoCache.current[item.city] = "NOT_FOUND";
            }
          } catch (e) { 
            console.warn(`Geocoding failed for ${cleanName}:`, e);
            break; 
          }
          await new Promise(r => setTimeout(r, 1000));
          if (!isCancelled) setGeocodingStatus(`מאתר ${Math.round(((i + 1) / toProcess.length) * 100)}%`);
        }
        if (!isCancelled) setGeocodingStatus("");
      };
      processQueue();
    }

    return () => {
      isCancelled = true;
    };
  }, [filteredData, loading, darkMode, lang]);

  // --- Charts Initialization & Updates ---
  useEffect(() => {
    if (loading) return;
    
    const initChart = (ref: React.RefObject<HTMLDivElement | null>, instanceRef: React.MutableRefObject<echarts.ECharts | null>) => {
      if (ref.current && !instanceRef.current) {
        instanceRef.current = echarts.init(ref.current);
      }
    };

    initChart(timeSeriesChartRef, timeSeriesInstance);
    initChart(topCitiesChartRef, topCitiesInstance);
    initChart(threatChartRef, threatInstance);
    initChart(sourceChartRef, sourceInstance);

    // Use ResizeObserver for robust resizing
    const observers: ResizeObserver[] = [];
    const refs = [
      { ref: timeSeriesChartRef, inst: timeSeriesInstance },
      { ref: topCitiesChartRef, inst: topCitiesInstance },
      { ref: threatChartRef, inst: threatInstance },
      { ref: sourceChartRef, inst: sourceInstance }
    ];

    refs.forEach(({ ref, inst }) => {
      if (ref.current) {
        const observer = new ResizeObserver(() => {
          inst.current?.resize();
        });
        observer.observe(ref.current);
        observers.push(observer);
      }
    });
    
    // Click events for cross-filtering
    topCitiesInstance.current?.on('click', (params: any) => setCitySearch(prev => prev === params.name ? "" : params.name));
    threatInstance.current?.on('click', (params: any) => setThreatFilter(prev => prev === params.name ? "all" : params.name));
    sourceInstance.current?.on('click', (params: any) => setSourceFilter(prev => prev === params.name ? "all" : params.name));

    return () => {
      observers.forEach(o => o.disconnect());
      timeSeriesInstance.current?.dispose();
      topCitiesInstance.current?.dispose();
      threatInstance.current?.dispose();
      sourceInstance.current?.dispose();
      timeSeriesInstance.current = null;
      topCitiesInstance.current = null;
      threatInstance.current = null;
      sourceInstance.current = null;
    };
  }, [loading]);

  // --- Tooltip Position Helper ---
  const customTooltipPosition = (point: number[], params: any, dom: any, rect: any, size: any) => {
    let x = point[0] + 15;
    let y = point[1] - size.contentSize[1] - 15;
    if (y < 0) y = point[1] + 15;
    // Prevent right overflow
    if (x + size.contentSize[0] > size.viewSize[0]) {
      x = point[0] - size.contentSize[0] - 15;
    }
    return [x, y];
  };

  useEffect(() => {
    if (!timeSeriesInstance.current) return;
    
    const grouped: Record<string, number> = {};
    if (timeResolution === 'hour') {
      for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m++) {
          grouped[String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')] = 0;
        }
      }
    } else if (timeResolution === 'minute') {
      for (let m = 0; m < 60; m++) {
        grouped[String(m).padStart(2, '0')] = 0;
      }
    }

    filteredData.forEach(d => {
      let key;
      if (timeResolution === 'year') key = d.year;
      else if (timeResolution === 'month') key = d.month;
      else if (timeResolution === 'weekday') key = daysHe[d.dayOfWeek];
      else if (timeResolution === 'hour') key = String(d.hour).padStart(2, '0') + ':' + String(d.dateObj.getMinutes()).padStart(2, '0');
      else if (timeResolution === 'minute') key = String(d.dateObj.getMinutes()).padStart(2, '0');
      if (key !== undefined) grouped[key] = (grouped[key] || 0) + 1;
    });

    const xData = Object.keys(grouped);
    if (['year', 'month', 'hour', 'minute'].includes(timeResolution)) xData.sort();
    else if (timeResolution === 'weekday') xData.sort((a, b) => daysHe.indexOf(a) - daysHe.indexOf(b));
    
    const yData = xData.map(k => grouped[k]);
    const series: any[] = [{
      name: 'התרעות',
      data: yData,
      type: ['hour', 'weekday', 'minute'].includes(timeResolution) ? 'bar' : 'line',
      smooth: true,
      itemStyle: { color: '#00AEEF', borderRadius: [4, 4, 0, 0] },
      areaStyle: timeResolution === 'month' ? {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(0,174,239,0.4)' },
          { offset: 1, color: 'rgba(0,174,239,0.05)' }
        ])
      } : null
    }];

    if (timeResolution === 'hour') {
      const trend = [];
      const win = 15;
      for (let i = 0; i < yData.length; i++) {
        let sum = 0, count = 0;
        for (let j = Math.max(0, i - win); j <= Math.min(yData.length - 1, i + win); j++) {
          sum += yData[j]; count++;
        }
        trend.push(Number((sum / count).toFixed(2)));
      }
      series.push({
        name: 'מגמה',
        data: trend,
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, color: '#E63946', type: 'dashed' }
      });
    }

    timeSeriesInstance.current.setOption({
      tooltip: { 
        trigger: 'axis', 
        axisPointer: { type: 'shadow' }, 
        appendToBody: true,
        position: customTooltipPosition
      },
      grid: { top: '10%', bottom: '5%', left: '0%', right: '2%', containLabel: true },
      yAxis: { type: 'value', axisLabel: { show: false }, splitLine: { lineStyle: { color: darkMode ? '#334155' : '#eee', type: 'dashed' } } },
      xAxis: { 
        type: 'category', 
        data: xData,
        axisLabel: { color: darkMode ? '#94a3b8' : '#7F8C8D' }
      },
      series
    });
  }, [filteredData, timeResolution, darkMode]);

  useEffect(() => {
    if (!topCitiesInstance.current) return;
    const counts: Record<string, number> = {};
    filteredData.forEach(d => { if (d.cities) counts[d.cities] = (counts[d.cities] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15);
    
    topCitiesInstance.current.setOption({
      tooltip: { 
        trigger: 'axis', 
        axisPointer: { type: 'shadow' }, 
        appendToBody: true,
        position: customTooltipPosition
      },
      grid: { top: '15%', bottom: '15%', left: '2%', right: '2%', containLabel: true },
      xAxis: {
        type: 'category',
        data: sorted.map(s => s[0]),
        axisLabel: {
          interval: 0, rotate: 30, fontSize: 10,
          color: darkMode ? '#94a3b8' : '#7F8C8D',
          formatter: (v: string) => v.length > 10 ? v.substring(0, 10) + '...' : v
        }
      },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: darkMode ? '#334155' : '#eee', type: 'dashed' } }, axisLabel: { show: false } },
      series: [{
        type: 'bar',
        data: sorted.map(s => s[1]),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#00AEEF' }, { offset: 1, color: darkMode ? '#3b82f6' : '#0038B8' }]),
          borderRadius: [4, 4, 0, 0]
        },
        label: { 
          show: true, 
          position: 'top', 
          fontSize: 10,
          formatter: (params: any) => {
            const city = sorted[params.dataIndex][0];
            return `{a|${params.value}}\n{b|${getWarningTime(city)}}`;
          },
          rich: {
            a: { fontWeight: 'bold', color: darkMode ? '#38bdf8' : '#0038B8' },
            b: { fontSize: 8, color: '#E63946', padding: [2, 0] }
          }
        }
      }]
    });
  }, [filteredData, darkMode]);

  useEffect(() => {
    if (!threatInstance.current || !sourceInstance.current) return;
    const tCounts: Record<string, number> = {};
    const sCounts: Record<string, number> = {};
    filteredData.forEach(d => {
      const t = d.threatStr || 'אחר';
      const s = d.sourceStr || 'מעורב / לא סווג';
      tCounts[t] = (tCounts[t] || 0) + 1;
      sCounts[s] = (sCounts[s] || 0) + 1;
    });

    const pieOpt = (data: any[], colors: string[]) => ({
      tooltip: { 
        trigger: 'item', 
        appendToBody: true,
        position: customTooltipPosition,
        formatter: '{b}: <br/>{c} התרעות ({d}%)'
      },
      series: [{
        type: 'pie', 
        radius: ['40%', '70%'], 
        avoidLabelOverlap: false,
        minAngle: 15,
        itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 1 },
        label: { 
          show: window.innerWidth < 768,
          position: 'outside',
          formatter: '{b}: {d}%',
          fontSize: 10,
          color: darkMode ? '#94a3b8' : '#7F8C8D'
        },
        labelLine: {
          show: window.innerWidth < 768,
          length: 5,
          length2: 5
        },
        data, 
        color: colors
      }]
    });

    threatInstance.current.setOption(pieOpt(Object.entries(tCounts).map(([n, v]) => ({ name: n, value: v })), ['#E63946', '#00AEEF', '#D4AF37', darkMode ? '#3b82f6' : '#0038B8', '#7F8C8D']));
    sourceInstance.current.setOption(pieOpt(Object.entries(sCounts).map(([n, v]) => ({ name: n, value: v })), [darkMode ? '#3b82f6' : '#0038B8', '#D4AF37', '#E63946', '#00AEEF', '#7F8C8D']));
  }, [filteredData, darkMode]);

  // --- Insights ---
  const insight = useMemo(() => {
    if (filteredData.length < 5) return "מעט מדי נתונים להפקת תובנה.";
    const total = filteredData.length;
    const dateCounts: Record<string, number> = {};
    filteredData.forEach(d => { const s = d.time.split(' ')[0]; dateCounts[s] = (dateCounts[s] || 0) + 1; });
    const maxDate = Object.keys(dateCounts).reduce((a, b) => dateCounts[a] > dateCounts[b] ? a : b);
    const maxDateCount = dateCounts[maxDate];
    if ((maxDateCount / total) > 0.1) return `<b>שיא תקיפה:</b><br>${maxDate} עם ${maxDateCount.toLocaleString()} התרעות.`;
    
    const nightCount = filteredData.filter(d => d.hour >= 23 || d.hour < 6).length;
    if (nightCount / total > 0.3) return `<b>פעילות לילית:</b><br>${Math.round((nightCount/total)*100)}% מההתרעות בלילה.`;
    
    return "שגרת ביטחון יחסית בחתך זה.";
  }, [filteredData]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-bg-color z-50 flex flex-col justify-center items-center text-primary-deep-blue font-bold text-xl transition-colors duration-300">
        <div className="spinner mb-5" />
        <div className="animate-pulse">{t.loading}</div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-screen bg-bg-color font-sans transition-colors duration-300 ${darkMode ? 'dark' : ''}`} dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="bg-surface-color text-text-main px-5 py-3 flex justify-between items-center border-b border-border-color z-30 flex-shrink-0 transition-colors duration-300">
        <div className="flex items-center gap-3">
          <div className="bg-primary-deep-blue dark:bg-primary-azure p-2 rounded-xl shadow-sm">
            <Shield size={24} className="text-white" />
          </div>
          <h1 className="text-lg md:text-xl font-extrabold tracking-tight text-primary-deep-blue dark:text-primary-azure">{t.title}</h1>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4">
          <button 
            className="md:hidden p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors text-text-main"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X size={20} /> : <Filter size={20} />}
          </button>

          <button 
            onClick={() => {
              setDarkMode(!darkMode);
              document.documentElement.classList.toggle('dark');
            }}
            className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors text-text-main"
            title={darkMode ? "Light Mode" : "Dark Mode"}
          >
            {darkMode ? <Moon size={20} className="text-accent-gold" /> : <Sun size={20} className="text-text-muted" />}
          </button>

          <div className="flex items-center gap-1 bg-black/5 dark:bg-white/10 rounded-full px-2 py-1">
            <button 
              onClick={() => setLang('he')}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-all overflow-hidden border-2 ${lang === 'he' ? 'border-primary-deep-blue scale-110 shadow-sm' : 'border-transparent opacity-60 hover:opacity-100'}`}
              title="עברית"
            >
              <img src="https://flagcdn.com/w40/il.png" alt="IL" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </button>
            <button 
              onClick={() => setLang('en')}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-all overflow-hidden border-2 ${lang === 'en' ? 'border-primary-deep-blue scale-110 shadow-sm' : 'border-transparent opacity-60 hover:opacity-100'}`}
              title="English"
            >
              <img src="https://flagcdn.com/w40/us.png" alt="US" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </button>
          </div>

          <div className="hidden md:flex flex-col items-end leading-tight">
            <span className="text-[10px] text-text-muted font-semibold uppercase tracking-wider">{isRtl ? 'מצב מערכת' : 'SYSTEM STATUS'}</span>
            <span className="text-xs font-bold flex items-center gap-1.5 text-text-main">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              {isRtl ? 'מחובר לנתוני אמת' : 'CONNECTED TO LIVE DATA'}
            </span>
          </div>
        </div>
      </header>

      {/* Filter Bar - Drawer on mobile */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ x: isRtl ? '100%' : '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: isRtl ? '100%' : '-100%' }}
            className="fixed inset-0 z-[100] bg-surface-color p-8 flex flex-col gap-6 md:hidden overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-primary-deep-blue dark:text-primary-azure">{isRtl ? 'מסננים' : 'Filters'}</h2>
              <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 bg-black/5 rounded-full"><X size={24} /></button>
            </div>
            
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="font-semibold text-sm text-text-main">{t.search}</label>
                <div className="relative">
                  <input 
                    type="text" 
                    className="w-full bg-input-bg border border-border-color rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-primary-azure text-text-main"
                    placeholder={isRtl ? "הקלד שם..." : "Type name..."}
                    value={citySearch}
                    onChange={(e) => handleCitySearchChange(e.target.value, 'mobile')}
                    onFocus={() => {
                        if (citySearch.trim().length > 0) setShowSuggestions(true);
                        setActiveSearchSource('mobile');
                    }}
                  />
                  {showSuggestions && activeSearchSource === 'mobile' && citySuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-surface-color border border-border-color mt-1 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto">
                      {citySuggestions.map((city, idx) => (
                        <div 
                          key={idx} 
                          className="px-4 py-3 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer text-text-main border-b border-border-color last:border-0"
                          onClick={() => selectCity(city)}
                        >
                          {city}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-semibold text-sm text-text-main">{t.operation}</label>
                <select 
                  className="bg-input-bg border border-border-color rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-primary-azure text-text-main"
                  value={operationFilter}
                  onChange={(e) => setOperationFilter(e.target.value)}
                >
                  <option value="all">{t.all}</option>
                  {operationsDict.map(op => <option key={op.name} value={op.name}>{op.name}</option>)}
                  <option value="שגרה (ללא מערכה)">שגרה (ללא מערכה)</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-semibold text-sm text-text-main">{t.threat}</label>
                <select 
                  className="bg-input-bg border border-border-color rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-primary-azure text-text-main"
                  value={threatFilter}
                  onChange={(e) => setThreatFilter(e.target.value)}
                >
                  <option value="all">{t.all}</option>
                  {Array.from(new Set(Object.values(threatDict))).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-semibold text-sm text-text-main">{t.source}</label>
                <select 
                  className="bg-input-bg border border-border-color rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-primary-azure text-text-main"
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                >
                  <option value="all">{t.all}</option>
                  {Array.from(new Set(globalData.map(d => d.sourceStr))).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="mt-4 bg-primary-azure text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-all"
              >
                {isRtl ? 'הצג תוצאות' : 'Show Results'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="hidden md:flex bg-surface-color px-5 py-2 border-b border-border-color gap-4 items-center flex-wrap z-20 sticky top-0 md:relative">
        <div className="flex items-center gap-2 relative">
          <label className="font-semibold text-[13px] text-text-main">{t.search}</label>
          <div className="relative">
            <input 
              type="text" 
              className="bg-input-bg border border-border-color rounded-full px-4 py-1 text-sm outline-none focus:ring-2 focus:ring-primary-azure transition-all w-40 md:w-48 text-text-main"
              placeholder={isRtl ? "הקלד שם..." : "Type name..."}
              value={citySearch}
              onChange={(e) => handleCitySearchChange(e.target.value, 'desktop')}
              onFocus={() => {
                  if (citySearch.trim().length > 0) setShowSuggestions(true);
                  setActiveSearchSource('desktop');
              }}
            />
            {showSuggestions && activeSearchSource === 'desktop' && citySuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-surface-color border border-border-color mt-1 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto min-w-[180px]">
                {citySuggestions.map((city, idx) => (
                  <div 
                    key={idx} 
                    className="px-4 py-2 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer text-text-main text-sm border-b border-border-color last:border-0"
                    onClick={() => selectCity(city)}
                  >
                    {city}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="font-semibold text-[13px] text-text-main">{t.operation}</label>
          <select 
            className="bg-input-bg border border-border-color rounded-full px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-primary-azure text-text-main"
            value={operationFilter}
            onChange={(e) => setOperationFilter(e.target.value)}
          >
            <option value="all">{t.all}</option>
            {operationsDict.map(op => <option key={op.name} value={op.name}>{op.name}</option>)}
            <option value="שגרה (ללא מערכה)">שגרה (ללא מערכה)</option>
          </select>
        </div>

        {/* Comparison Toggle */}
        <div className="flex items-center gap-2 border-l border-border-color pl-4">
          <button 
            onClick={() => setCompareMode(!compareMode)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all ${compareMode ? 'bg-accent-gold text-white' : 'bg-input-bg text-text-muted border border-border-color'}`}
          >
            <TrendingUp size={14} />
            {t.compare}
          </button>
          
          {compareMode && (
            <select 
              className="bg-input-bg border border-accent-gold rounded-full px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-accent-gold text-text-main animate-in fade-in slide-in-from-right-2"
              value={compareOperation}
              onChange={(e) => setCompareOperation(e.target.value)}
            >
              <option value="all">{t.all}</option>
              {operationsDict.map(op => <option key={op.name} value={op.name}>{op.name}</option>)}
            </select>
          )}
        </div>

        {/* Date Range */}
        <div className="flex items-center gap-2 border-l border-border-color pl-4">
          <Calendar size={14} className="text-text-muted" />
          <input 
            type="date" 
            className="bg-input-bg border border-border-color rounded-full px-2 py-0.5 text-xs text-text-main outline-none"
            value={dateRange.start}
            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
          />
          <span className="text-text-muted">-</span>
          <input 
            type="date" 
            className="bg-input-bg border border-border-color rounded-full px-2 py-0.5 text-xs text-text-main outline-none"
            value={dateRange.end}
            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="font-semibold text-[13px] text-text-main">{t.threat}</label>
          <select 
            className="bg-input-bg border border-border-color rounded-full px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-primary-azure text-text-main"
            value={threatFilter}
            onChange={(e) => setThreatFilter(e.target.value)}
          >
            <option value="all">{t.all}</option>
            {Array.from(new Set(Object.values(threatDict))).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="font-semibold text-[13px] text-text-main">{t.source}</label>
          <select 
            className="bg-input-bg border border-border-color rounded-full px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-primary-azure text-text-main"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="all">{t.all}</option>
            {Array.from(new Set(globalData.map(d => d.sourceStr))).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>

      {/* Main Container */}
      <main className="flex-1 flex flex-col md:flex-row md:overflow-hidden p-3 md:p-5 gap-4 md:gap-5">
        
        {/* Left Panel: Analytics (First on mobile) */}
        <div className="w-full md:w-3/4 flex flex-col gap-3 md:overflow-y-auto order-1 md:order-2 scrollbar-hide">
          
          {/* KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 flex-shrink-0">
            <div className="bg-surface-color p-3 rounded-[16px] shadow-[0_4px_15px_rgba(0,0,0,0.03)] text-center relative overflow-hidden transition-colors duration-300">
              <div className="absolute top-0 bottom-0 right-0 w-[6px] bg-primary-azure" />
              <div className="text-[11px] md:text-xs text-text-muted font-semibold">{t.totalAlerts}</div>
              <div className="text-xl md:text-[22px] font-extrabold text-primary-deep-blue dark:text-primary-azure mt-1">{filteredData.length.toLocaleString()}</div>
            </div>
            
            {/* Shower Index Card */}
            <div className="bg-surface-color p-3 rounded-[16px] shadow-[0_4px_15px_rgba(0,0,0,0.03)] text-center relative overflow-hidden group transition-colors duration-300">
              <div className="absolute top-0 bottom-0 right-0 w-[6px] bg-sky-400" />
              <div className="flex justify-between items-center mb-1">
                <div className="text-[11px] md:text-xs text-text-muted font-semibold">{t.showerIndex}</div>
                <div className="text-sky-400"><Info size={14} /></div>
              </div>
              <div className="flex flex-col items-center justify-center">
                {showerIndex ? (
                  <>
                    <div className="text-lg md:text-xl font-black text-primary-deep-blue dark:text-primary-azure leading-none">
                      {showerIndex.time}
                    </div>
                    <div className="text-[10px] text-text-muted font-bold mt-1 flex items-center gap-1">
                      {t.showerDesc} | <span className="text-emerald-500">{showerIndex.probability}% {isRtl ? 'שקט' : 'Quiet'}</span>
                    </div>
                  </>
                ) : (
                  <span className="text-xs opacity-50 italic">{t.noData}</span>
                )}
              </div>
            </div>

            <div className="bg-surface-color p-3 rounded-[16px] shadow-[0_4px_15px_rgba(0,0,0,0.03)] text-center relative overflow-hidden sm:col-span-2 md:col-span-1 transition-colors duration-300">
              <div className="absolute top-0 bottom-0 right-0 w-[6px] bg-alert-red" />
              <div className="text-[11px] md:text-xs text-text-muted font-semibold">{t.lastAlert}</div>
              <div className="text-base md:text-lg font-extrabold text-primary-deep-blue dark:text-primary-azure mt-1">
                {filteredData.length > 0 ? filteredData[filteredData.length-1].time : "-"}
              </div>
            </div>
          </div>

          {/* Charts Row 1: Time Series + Donuts Side-by-Side */}
          <div className="flex flex-col md:flex-row gap-3 md:flex-1 min-h-0">
            <div className="bg-surface-color p-3 rounded-[16px] shadow-[0_4px_15px_rgba(0,0,0,0.03)] flex flex-col md:flex-[2] h-[300px] md:h-auto transition-colors duration-300">
              <div className="flex gap-2 justify-center mb-1 overflow-x-auto pb-1 scrollbar-hide flex-shrink-0">
                {(['year', 'month', 'weekday', 'hour', 'minute'] as const).map(res => (
                  <button 
                    key={res}
                    className={`px-3 py-1 rounded-full text-[10px] font-semibold transition-all whitespace-nowrap ${timeResolution === res ? 'bg-primary-azure text-white' : 'bg-primary-light-blue dark:bg-primary-light-blue/20 text-primary-deep-blue dark:text-primary-azure'}`}
                    onClick={() => setTimeResolution(res)}
                  >
                    {res === 'year' ? t.years : res === 'month' ? t.months : res === 'weekday' ? t.days : res === 'hour' ? t.hours : t.minutes}
                  </button>
                ))}
              </div>
              <div ref={timeSeriesChartRef} className="flex-1 w-full min-h-0" />
            </div>

            <div className="bg-surface-color p-2 rounded-[16px] shadow-[0_4px_15px_rgba(0,0,0,0.03)] flex flex-col md:flex-1 h-[250px] md:h-auto transition-colors duration-300">
              <div className="text-center font-extrabold text-primary-deep-blue dark:text-primary-azure text-[12px] mb-1">{t.threatDist}</div>
              <div ref={threatChartRef} className="flex-1 w-full min-h-0" />
            </div>

            <div className="bg-surface-color p-2 rounded-[16px] shadow-[0_4px_15px_rgba(0,0,0,0.03)] flex flex-col md:flex-1 h-[250px] md:h-auto transition-colors duration-300">
              <div className="text-center font-extrabold text-primary-deep-blue dark:text-primary-azure text-[12px] mb-1">{t.sourceDist}</div>
              <div ref={sourceChartRef} className="flex-1 w-full min-h-0" />
            </div>
          </div>

          {/* Charts Row 2: Top Cities */}
          <div className="bg-surface-color p-3 rounded-[16px] shadow-[0_4px_15px_rgba(0,0,0,0.03)] flex flex-col md:flex-[1.2] h-[300px] md:h-auto flex-shrink-0 transition-colors duration-300">
            <div className="font-extrabold text-primary-deep-blue dark:text-primary-azure text-[13px] mb-1 px-2">{t.topCities}</div>
            <div ref={topCitiesChartRef} className="flex-1 w-full min-h-0" />
          </div>
        </div>

        {/* Right Panel: Map (Last on mobile) */}
        <div className="w-full md:w-1/4 bg-surface-color rounded-[16px] shadow-[0_4px_15px_rgba(0,0,0,0.03)] flex flex-col overflow-hidden border-t-[5px] border-primary-azure h-[300px] md:h-full relative flex-shrink-0 order-2 md:order-1 transition-colors duration-300">
          <div className="px-4 py-2 font-extrabold text-primary-deep-blue dark:text-primary-azure border-b border-border-color bg-input-bg text-sm flex justify-between items-center">
            <span>{t.mapTitle}</span>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setMapLayer(mapLayer === 'streets' ? 'satellite' : 'streets')}
                className="p-1 hover:bg-black/5 rounded transition-colors text-text-muted"
                title={mapLayer === 'streets' ? t.satellite : t.streets}
              >
                <Layers size={14} />
              </button>
            </div>
          </div>
          <div 
            id="map" 
            className="flex-1 z-10 transition-all duration-500" 
            style={darkMode ? { filter: 'invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%)' } : {}}
          />
          {geocodingStatus && (
            <div className="absolute bottom-2 left-2 right-2 bg-white/90 dark:bg-slate-800/90 p-1.5 rounded-lg text-[10px] font-bold text-primary-azure shadow-sm z-20 flex items-center gap-2 border border-primary-azure/20">
              <div className="mini-spinner" /> {geocodingStatus}
            </div>
          )}
        </div>
      </main>

      {/* Ticker */}
      <div className={`h-[40px] md:h-[45px] flex items-center overflow-hidden shadow-[0_-4px_15px_rgba(0,0,0,0.1)] transition-colors duration-500 z-30 ${liveAlert ? 'live-flash' : filteredData.length > 0 && (Date.now() - new Date(filteredData[filteredData.length-1].time).getTime() < 86400000) ? 'bg-alert-red' : 'bg-primary-azure'}`}>
        <div className="bg-black/20 h-full px-4 md:px-6 flex items-center font-extrabold text-sm md:text-base text-white whitespace-nowrap z-10 shadow-[2px_0_5px_rgba(0,0,0,0.1)]">
          {liveAlert ? `🚨 ${t.liveAlert}` : t.tickerTitle}
        </div>
        <div className="ticker-move flex-1 text-white">
          {liveAlert ? (
            <span className="inline-block px-8 text-base md:text-lg font-extrabold">
              {liveAlert.title}: <span className="text-white">{liveAlert.cities}</span>
            </span>
          ) : (
            globalData.slice(-10).reverse().map((alert, i) => (
              <span key={i} className="inline-block px-8 text-sm md:text-base font-semibold">
                🔴 {alert.operationsArray[0]} | <b>{alert.cities}</b> <span className="opacity-80 font-normal">({alert.threatStr})</span>
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
