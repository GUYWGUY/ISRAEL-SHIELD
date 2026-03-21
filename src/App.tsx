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
  Shield, Filter, X, ChevronDown, Calendar, Search, 
  Map as MapIcon, BarChart3, PieChart as PieChartIcon, 
  Info, Bell, Menu, Sun, Moon, Languages, Layers, TrendingUp, Check, Globe
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
    hours: "שעות ביממה",
    minutes: "דקות בשעה",
    daytime: "זמן ביממה",
    satellite: "לוויין",
    streets: "רחובות",
    compare: "השוואה",
    date: "לפי תאריכים",
    showerIndex: "מדד המקלחת 🚿",
    showerDesc: "הזמן הבטוח ביותר למקלחת שקטה",
    generate: "ייצר תובנות",
    generating: "מנתח נתונים...",
    noData: "אין נתונים להצגה",
    warningTime: "זמן התגוננות (שניות)",
    cacheStatus: "מטמון נתונים:",
    cacheOn: "פעיל",
    cacheOff: "טוען...",
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
    hours: "Hour of Day",
    minutes: "Min in Hour",
    daytime: "Daytime (HH:MM)",
    satellite: "Satellite",
    streets: "Streets",
    compare: "Compare",
    date: "By Date",
    showerIndex: "Shower Index 🚿",
    showerDesc: "Safest time for a quiet shower",
    generate: "Generate Insights",
    generating: "Analyzing data...",
    noData: "No data to display",
    warningTime: "Warning Time (Seconds)",
    cacheStatus: "Data Cache:",
    cacheOn: "Active",
    cacheOff: "Loading...",
  },
  ar: {
    title: "درع إسرائيل | لوحة تحليل البيانات",
    search: "بحث مدينة/منطقة:",
    threat: "نوع التهديد:",
    source: "مصدر التهديد:",
    operation: "العملية:",
    all: "الكل",
    loading: "جارٍ تحميل البيانات...",
    totalAlerts: "إجمالي التنبيهات",
    smartInsight: "رؤية إحصائية ذكية 🎯",
    lastAlert: "وقت آخر تنبيه",
    mapTitle: "خريطة البؤر الساخنة",
    liveAlert: "إنذار حي",
    tickerTitle: "شريط التنبيهات",
    timeSeries: "توزيع التنبيهات عبر الزمن",
    topCities: "أكثر المواقع استهدافاً (Top 15)",
    threatDist: "توزيع أنواع التهديد",
    sourceDist: "مصدر التهديد",
    years: "سنوات",
    months: "أشهر",
    days: "أيام",
    hours: "ساعات اليوم",
    minutes: "دقائق الساعة",
    daytime: "وقت اليوم",
    satellite: "قمر صناعي",
    streets: "شوارع",
    compare: "مقارنة",
    date: "حسب التاريخ",
    showerIndex: "مؤشر الاستحمام 🚿",
    showerDesc: "أأمن وقت للاستحمام",
    generate: "توليد رؤى",
    generating: "تحليل البيانات...",
    noData: "لا توجد بيانات",
    warningTime: "وقت التحذير (ث)",
    cacheStatus: "ذاكرة التخزين:",
    cacheOn: "نشط",
    cacheOff: "جارٍ التحميل...",
  },
  fr: {
    title: "Bouclier d'Israël | Tableau de bord analytique",
    search: "Rechercher ville/zone :",
    threat: "Type de menace :",
    source: "Source de menace :",
    operation: "Campagne :",
    all: "Tout",
    loading: "Chargement des données...",
    totalAlerts: "Total des alertes",
    smartInsight: "Aperçu statistique intelligent 🎯",
    lastAlert: "Dernière alerte",
    mapTitle: "Carte des points chauds",
    liveAlert: "Alerte en direct",
    tickerTitle: "Fil d'alertes",
    timeSeries: "Distribution des alertes dans le temps",
    topCities: "Sites les plus ciblés (Top 15)",
    threatDist: "Distribution des types de menace",
    sourceDist: "Source de menace",
    years: "Années",
    months: "Mois",
    days: "Jours",
    hours: "Heure du jour",
    minutes: "Mod. Minute",
    daytime: "Heure du jour",
    satellite: "Satellite",
    streets: "Rues",
    compare: "Comparer",
    date: "Par date",
    showerIndex: "Indice douche 🚿",
    showerDesc: "Moment le plus sûr pour une douche tranquille",
    generate: "Générer des insights",
    generating: "Analyse en cours...",
    noData: "Aucune donnée",
    warningTime: "Temps d'alerte (s)",
    cacheStatus: "Cache :",
    cacheOn: "Actif",
    cacheOff: "Chargement...",
  },
  de: {
    title: "Schild Israels | Daten-Dashboard",
    search: "Stadt/Region suchen:",
    threat: "Bedrohungstyp:",
    source: "Bedrohungsquelle:",
    operation: "Operation:",
    all: "Alle",
    loading: "Daten werden geladen...",
    totalAlerts: "Gesamtanzahl Warnungen",
    smartInsight: "Smarte statistische Einblicke 🎯",
    lastAlert: "Letzte Warnung",
    mapTitle: "Karte der Hotspots",
    liveAlert: "Live-Alarm",
    tickerTitle: "Warnmeldungen",
    timeSeries: "Verteilung der Warnungen über Zeit",
    topCities: "Meistangegriffene Orte (Top 15)",
    threatDist: "Verteilung der Bedrohungstypen",
    sourceDist: "Bedrohungsquelle",
    years: "Jahre",
    months: "Monate",
    days: "Tage",
    hours: "Stunde des Tages",
    minutes: "Min. in Std.",
    daytime: "Tageszeit",
    satellite: "Satellit",
    streets: "Straßen",
    compare: "Vergleichen",
    date: "Nach Datum",
    showerIndex: "Duschindex 🚿",
    showerDesc: "Sicherste Zeit für eine ruhige Dusche",
    generate: "Einblicke generieren",
    generating: "Analyse läuft...",
    noData: "Keine Daten",
    warningTime: "Warnzeit (s)",
    cacheStatus: "Cache:",
    cacheOn: "Aktiv",
    cacheOff: "Lädt...",
  },
  es: {
    title: "Escudo de Israel | Panel de análisis de datos",
    search: "Buscar ciudad/zona:",
    threat: "Tipo de amenaza:",
    source: "Fuente de amenaza:",
    operation: "Campaña:",
    all: "Todo",
    loading: "Cargando datos...",
    totalAlerts: "Total de alertas",
    smartInsight: "Perspectiva estadística inteligente 🎯",
    lastAlert: "Última alerta",
    mapTitle: "Mapa de puntos calientes",
    liveAlert: "Alerta en vivo",
    tickerTitle: "Ticker de alertas",
    timeSeries: "Distribución de alertas en el tiempo",
    topCities: "Lugares más atacados (Top 15)",
    threatDist: "Distribución por tipo de amenaza",
    sourceDist: "Fuente de amenaza",
    years: "Años",
    months: "Meses",
    days: "Días",
    hours: "Hora del día",
    minutes: "Minuto de la hora",
    daytime: "Hora del día",
    satellite: "Satélite",
    streets: "Calles",
    compare: "Comparar",
    date: "Por fecha",
    showerIndex: "Índice ducha 🚿",
    showerDesc: "El momento más seguro para una ducha tranquila",
    generate: "Generar insights",
    generating: "Analizando datos...",
    noData: "Sin datos",
    warningTime: "Tiempo de alerta (s)",
    cacheStatus: "Caché:",
    cacheOn: "Activo",
    cacheOff: "Cargando...",
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

const customTooltipPosition = (point: any, params: any, dom: any, rect: any, size: any) => {
  const obj: any = { top: 10 };
  obj[['left', 'right'][+(point[0] < size.viewSize[0] / 2)]] = 5;
  return obj;
};

const MONTH_NAMES_HE = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const MONTH_NAMES_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// --- Multi-language Data Dictionaries ---
type LangCode = 'he' | 'en' | 'ar' | 'fr' | 'de' | 'es';

// Threat type translations (Hebrew key → translations)
const threatTranslations: Record<string, Partial<Record<LangCode, string>>> = {
  "ירי רקטות וטילים":    { en: "Rocket & Missile Fire",          ar: "إطلاق صواريخ",          fr: "Tirs de roquettes",       de: "Raketen-/Raketenbeschuss",  es: "Fuego de cohetes y misiles" },
  "חדירת כלי טיס עוין":   { en: "Hostile Aircraft Intrusion",     ar: "اختراق طائرة معادية",   fr: "Intrusion aéronef hostile", de: "Feindlicher Luftangriff",   es: "Intrusión de aeronave hostil" },
  "רעידת אדמה":          { en: "Earthquake",                     ar: "زلزال",                  fr: "Séisme",                  de: "Erdbeben",                  es: "Terremoto" },
  "אירוע רדיולוגי":       { en: "Radiological Incident",          ar: "حادث إشعاعي",           fr: "Incident radiologique",   de: "Radiologischer Vorfall",    es: "Incidente de materiales peligrosos" },
  "חדירת מחבלים":         { en: "Terrorist Infiltration",         ar: "تسلل إرهابي",           fr: "Infiltration terroriste",  de: "Terroristeneindringen",     es: "Infiltración terrorista" },
  "צונאמי":              { en: "Tsunami",                        ar: "تسونامي",               fr: "Tsunami",                 de: "Tsunami",                   es: "Tsunami" },
  "אירוע חומרים מסוכנים": { en: "Hazardous Materials Incident",   ar: "حادث مواد خطرة",        fr: "Incident matières dangereuses", de: "Gefahrstoffvorfall",    es: "Incidente de materiales peligrosos" },
  "אירוע לא קונבנציונלי": { en: "Non-Conventional Event",         ar: "حدث غير تقليدي",        fr: "Événement non-conventionnel", de: "Nicht-konventionelles Ereignis", es: "Evento no convencional" },
  "אחר":                  { en: "Other",                          ar: "أخرى",                  fr: "Autre",                   de: "Sonstige",                  es: "Otro" },
};

// Threat source translations
const sourceTranslations: Record<string, Partial<Record<LangCode, string>>> = {
  "רצועת עזה":         { en: "Gaza Strip",      ar: "قطاع غزة",   fr: "Bande de Gaza",   de: "Gazastreifen",       es: "Franja de Gaza" },
  "לבנון":             { en: "Lebanon",          ar: "لبنان",      fr: "Liban",           de: "Libanon",            es: "Líbano" },
  "איראן":             { en: "Iran",             ar: "إيران",      fr: "Iran",            de: "Iran",               es: "Irán" },
  "תימן":              { en: "Yemen",            ar: "اليمن",      fr: "Yémen",           de: "Jemen",              es: "Yemen" },
  "תימן / עיראק":      { en: "Yemen / Iraq",    ar: "اليمن/العراق", fr: "Yémen / Irak",   de: "Jemen / Irak",       es: "Yemen / Irak" },
  "עיראק":             { en: "Iraq",             ar: "العراق",     fr: "Irak",            de: "Irak",               es: "Irak" },
  "סוריה":             { en: "Syria",            ar: "سوريا",      fr: "Syrie",           de: "Syrien",             es: "Siria" },
  "מעורב / לא סווג":   { en: "Mixed / Unclassified", ar: "مختلط / غير مصنف", fr: "Mixte / Non classé", de: "Gemischt / Unklassifiziert", es: "Mixto / No clasificado" },
};

// Operation name translations
const operationTranslations: Record<string, Partial<Record<LangCode, string>>> = {
  "חגורה שחורה (2019)":                      { en: "Black Belt (2019)",           ar: "الحزام الأسود (2019)",        fr: "Ceinture Noire (2019)",         de: "Schwarzer Gürtel (2019)",      es: "Cinturón Negro (2019)" },
  "שומר החומות (2021)":                      { en: "Guardian of the Walls (2021)", ar: "حارس الأسوار (2021)",         fr: "Gardien des Murs (2021)",        de: "Hüter der Mauern (2021)",      es: "Guardián de los Muros (2021)" },
  "עלות השחר (2022)":                        { en: "Breaking Dawn (2022)",        ar: "الفجر المنبثق (2022)",         fr: "Aube Naissante (2022)",          de: "Aufbruch der Morgendämmerung (2022)", es: "Amanecer (2022)" },
  "מגן וחץ (2023)":                          { en: "Shield and Arrow (2023)",     ar: "الدرع والسهم (2023)",          fr: "Bouclier et Flèche (2023)",      de: "Schild und Pfeil (2023)",      es: "Escudo y Flecha (2023)" },
  "מלחמת חרבות ברזל (2023+)":               { en: "Iron Swords War (2023+)",     ar: "حرب السيوف الحديدية (2023+)", fr: "Guerre des Épées de Fer (2023+)", de: "Eisenschwerter-Krieg (2023+)", es: "Guerra de Espadas de Hierro (2023+)" },
  "מתקפת אפריל (איראן 2024)":               { en: "April Attack – Iran (2024)",  ar: "هجوم أبريل – إيران (2024)",   fr: "Attaque d'Avril – Iran (2024)",  de: "April-Angriff – Iran (2024)",  es: "Ataque de Abril – Irán (2024)" },
  "מתקפת אוקטובר (איראן 2024)":             { en: "October Attack – Iran (2024)", ar: "هجوم أكتوبر – إيران (2024)", fr: "Attaque d'Octobre – Iran (2024)", de: "Oktober-Angriff – Iran (2024)", es: "Ataque de Octubre – Irán (2024)" },
  "ימי תשובה (איראן 2024)":                 { en: "Days of Repentance – Iran (2024)", ar: "أيام التوبة – إيران (2024)", fr: "Jours de Repentir – Iran (2024)", de: "Bußtage – Iran (2024)", es: "Días de Arrepentimiento – Irán (2024)" },
  "עם כלביא (איראן 2025)":                  { en: "True Promise II – Iran (2025)", ar: "الوعد الصادق 2 (2025)",     fr: "Vraie Promesse II (2025)",       de: "Wahres Versprechen II (2025)", es: "Promesa Verdadera II (2025)" },
  "כארי ישאג / שאגת הארי (איראן 2026)":     { en: "Lion's Roar – Iran (2026)",   ar: "زئير الأسد – إيران (2026)",   fr: "Rugissement du Lion (2026)",     de: "Löwengebrüll (2026)",          es: "Rugido del León (2026)" },
  "שגרה (ללא מערכה)":                        { en: "Routine (No Operation)",      ar: "روتين (بدون عملية)",          fr: "Routine (Hors opération)",       de: "Routine (Keine Operation)",    es: "Rutina (Sin operación)" },
};

// City name translations: Hebrew → {en (also FR/DE/ES fallback), ar}
const cityTranslations: Record<string, { en: string; ar?: string }> = {
  // Major cities
  "תל אביב": { en: "Tel Aviv", ar: "تل أبيب" },
  "תל אביב - יפו": { en: "Tel Aviv–Jaffa", ar: "تل أبيب–يافا" },
  "ירושלים": { en: "Jerusalem", ar: "القدس" },
  "חיפה": { en: "Haifa", ar: "حيفا" },
  "באר שבע": { en: "Be'er Sheva", ar: "بئر السبع" },
  "אשדוד": { en: "Ashdod", ar: "أشدود" },
  "אשקלון": { en: "Ashkelon", ar: "عسقلان" },
  "נתניה": { en: "Netanya", ar: "نتانيا" },
  "ראשון לציון": { en: "Rishon LeZion", ar: "ريشون ليتسيون" },
  "פתח תקווה": { en: "Petah Tikva", ar: "بتاح تكفا" },
  "בני ברק": { en: "Bnei Brak", ar: "بني براك" },
  "חולון": { en: "Holon", ar: "حولون" },
  "בת ים": { en: "Bat Yam", ar: "بات يام" },
  "רמת גן": { en: "Ramat Gan", ar: "رمات غان" },
  "הרצליה": { en: "Herzliya", ar: "هرتسليا" },
  "רחובות": { en: "Rehovot", ar: "رحوبوت" },
  "מודיעין": { en: "Modi'in", ar: "موديعين" },
  "לוד": { en: "Lod", ar: "اللد" },
  "רמלה": { en: "Ramla", ar: "الرملة" },
  "כפר סבא": { en: "Kfar Saba", ar: "كفار سابا" },
  "רעננה": { en: "Ra'anana", ar: "راعنانا" },
  "הוד השרון": { en: "Hod HaSharon", ar: "هود هاشارون" },
  "נס ציונה": { en: "Nes Ziona", ar: "نيس تسيونا" },
  "יבנה": { en: "Yavne", ar: "يبنة" },
  "גבעתיים": { en: "Givatayim", ar: "غيفعتايم" },
  "רמת השרון": { en: "Ramat HaSharon", ar: "رامات هاشارون" },
  "קרית גת": { en: "Kiryat Gat", ar: "كريات جات" },
  "קרית מלאכי": { en: "Kiryat Malakhi", ar: "كريات ملاخي" },
  "בית שמש": { en: "Beit Shemesh", ar: "بيت شيمش" },
  // South
  "שדרות": { en: "Sderot", ar: "سديروت" },
  "נתיבות": { en: "Netivot", ar: "نتيفوت" },
  "אופקים": { en: "Ofakim", ar: "أوفاكيم" },
  "אילת": { en: "Eilat", ar: "إيلات" },
  "דימונה": { en: "Dimona", ar: "ديمونا" },
  "ערד": { en: "Arad", ar: "عراد" },
  "ירוחם": { en: "Yeruham", ar: "يروحام" },
  "מצפה רמון": { en: "Mitzpe Ramon", ar: "متسبي رامون" },
  "עוטף עזה": { en: "Gaza Envelope", ar: "غلاف غزة" },
  "כפר עזה": { en: "Kfar Aza", ar: "كفار عزة" },
  "בארי": { en: "Be'eri", ar: "بئيري" },
  "נחל עוז": { en: "Nahal Oz", ar: "ناحال عوز" },
  "ניר עוז": { en: "Nir Oz", ar: "نير عوز" },
  "רעים": { en: "Re'im", ar: "ريئيم" },
  "גן יבנה": { en: "Gan Yavne", ar: "غان يبنة" },
  "זיקים": { en: "Zikim", ar: "زيكيم" },
  "יד מרדכי": { en: "Yad Mordechai", ar: "ياد مردخاي" },
  // North
  "קרית שמונה": { en: "Kiryat Shmona", ar: "كريات شمونة" },
  "מטולה": { en: "Metula", ar: "متولا" },
  "צפת": { en: "Safed", ar: "صفد" },
  "נהריה": { en: "Nahariya", ar: "نهاريا" },
  "עכו": { en: "Acre", ar: "عكا" },
  "כרמיאל": { en: "Karmiel", ar: "كرميئيل" },
  "טבריה": { en: "Tiberias", ar: "طبريا" },
  "ראש פינה": { en: "Rosh Pinna", ar: "روش بينا" },
  "קרית מוצקין": { en: "Kiryat Motzkin", ar: "كريات موتسكين" },
  "קרית ביאליק": { en: "Kiryat Bialik", ar: "كريات بياليك" },
  "מעלות תרשיחא": { en: "Ma'alot-Tarshiha", ar: "معلوت-ترشيحا" },
  "שלומי": { en: "Shlomi", ar: "شلومي" },
  "קצרין": { en: "Katzrin", ar: "كتسرين" },
  // Center/North
  "חדרה": { en: "Hadera", ar: "خضيرة" },
  "נצרת": { en: "Nazareth", ar: "الناصرة" },
  "נוף הגליל": { en: "Nof HaGalil", ar: "نوف هغاليل" },
  "עפולה": { en: "Afula", ar: "عفولة" },
  "בית שאן": { en: "Beit She'an", ar: "بيت شان" },
  "מגדל העמק": { en: "Migdal HaEmek", ar: "مجدل هاعيمق" },
  "אום אל-פחם": { en: "Umm al-Fahm", ar: "أم الفحم" },
  "סח'נין": { en: "Sakhnin", ar: "سخنين" },
  "שפרעם": { en: "Shfar'am", ar: "شفاعمرو" },
  "טמרה": { en: "Tamra", ar: "طمرة" },
  // Regions
  "גליל עליון": { en: "Upper Galilee", ar: "الجليل الأعلى" },
  "גליל מערבי": { en: "Western Galilee", ar: "الجليل الغربي" },
  "גולן": { en: "Golan Heights", ar: "هضبة الجولان" },
  "העמקים": { en: "The Valleys", ar: "الأودية" },
  "שרון": { en: "Sharon", ar: "شارون" },
  "שפלה": { en: "Shephelah", ar: "السهل الساحلي" },
  "נגב": { en: "Negev", ar: "النقب" },
  "לכיש": { en: "Lachish", ar: "لخيش" },
};

// Helper: get localized string from a translation map, with EN fallback, then original
const localizeStr = (
  heStr: string,
  dict: Record<string, Partial<Record<LangCode, string>>>,
  lang: LangCode
): string => {
  if (lang === 'he') return heStr;
  const entry = dict[heStr];
  if (!entry) return entry?.en ?? heStr;
  return entry[lang] ?? entry.en ?? heStr;
};

// Helper: get city display name for non-Hebrew languages
const localizeCity = (heCity: string, lang: LangCode): string => {
  if (lang === 'he') return heCity;
  const entry = cityTranslations[heCity];
  if (!entry) return heCity; // Untranslated: keep Hebrew (readable in non-Arabic) or fallback
  if (lang === 'ar') return entry.ar ?? entry.en ?? heCity;
  return entry.en ?? heCity; // FR/DE/ES use English transliteration
};

const getGroupedData = (data: any[], res: string, lang: string) => {
  const grouped: Record<string, number> = {};
  data.forEach(d => {
    let key = "";
    if (res === 'year') key = d.year;
    else if (res === 'month') {
      // Generic month distribution: aggregate all years by month name
      const monthIdx = d.dateObj.getMonth();
      key = lang === 'he' ? MONTH_NAMES_HE[monthIdx] : MONTH_NAMES_EN[monthIdx];
    }
    else if (res === 'weekday') key = daysHe[d.dayOfWeek];
    else if (res === 'hour') key = String(d.dateObj.getHours()).padStart(2, '0') + ":00";
    else if (res === 'minute') {
      const min = d.dateObj.getMinutes();
      key = String(min).padStart(2, '0');
    }
    else if (res === 'daytime') {
      const h = String(d.dateObj.getHours()).padStart(2, '0');
      const m = String(d.dateObj.getMinutes()).padStart(2, '0');
      key = `${h}:${m}`;
    }
    else if (res === 'date') {
      // YYYY-MM-DD for correct chronological sorting
      const y = d.dateObj.getFullYear();
      const mo = String(d.dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(d.dateObj.getDate()).padStart(2, '0');
      key = `${y}-${mo}-${day}`;
    }
    grouped[key] = (grouped[key] || 0) + 1;
  });

  // Fill in all missing bins with 0 for fixed-range resolutions
  if (res === 'hour') {
    for (let h = 0; h < 24; h++) {
      const k = String(h).padStart(2, '0') + ':00';
      if (!(k in grouped)) grouped[k] = 0;
    }
  } else if (res === 'minute') {
    for (let m = 0; m < 60; m++) {
      const k = String(m).padStart(2, '0');
      if (!(k in grouped)) grouped[k] = 0;
    }
  } else if (res === 'weekday') {
    daysHe.forEach(day => { if (!(day in grouped)) grouped[day] = 0; });
  } else if (res === 'month') {
    const names = lang === 'he' ? MONTH_NAMES_HE : MONTH_NAMES_EN;
    names.forEach(name => { if (!(name in grouped)) grouped[name] = 0; });
  } else if (res === 'daytime') {
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m++) {
        const k = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        if (!(k in grouped)) grouped[k] = 0;
      }
    }
  }

  return grouped;
};

// --- MultiSelect Component ---
const MultiSelect = ({ label, options, selected, onChange, icon: Icon, isRtl }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const toggle = (val: string) => {
    if (val === 'all') {
      onChange(['all']);
    } else {
      const newSelected = selected.includes(val) 
        ? selected.filter((s: string) => s !== val) 
        : [...selected.filter((s: string) => s !== 'all'), val];
      onChange(newSelected.length === 0 ? ['all'] : newSelected);
    }
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="glass-card flex items-center justify-between gap-2 px-3 py-1.5 text-[10px] font-black hover:bg-white/10 transition-all min-w-[120px] shadow-sm uppercase tracking-wider h-9"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon size={14} className="text-primary-azure" />}
          <span className="truncate max-w-[80px]">
            {selected.includes('all') ? label : `${selected.length} ${isRtl ? 'נבחרו' : 'Selected'}`}
          </span>
        </div>
        <ChevronDown size={12} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className={`absolute top-full mt-2 ${isRtl ? 'right-0' : 'left-0'} z-50 p-2 min-w-[220px] max-h-[300px] overflow-y-auto shadow-2xl rounded-2xl border border-white/15 backdrop-blur-xl`}
              style={{ background: 'rgba(10,15,30,0.88)' }}
            >
              <div 
                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors ${selected.includes('all') ? 'text-primary-azure bg-white/5' : 'text-white/70'}`}
                onClick={() => { toggle('all'); setIsOpen(false); }}
              >
                <span className="text-xs font-black uppercase tracking-widest">{isRtl ? 'הכל' : 'ALL'}</span>
                {selected.includes('all') && <Check size={14} />}
              </div>
              <div className="h-[1px] bg-white/5 my-1" />
              {options.map((opt: string) => (
                <div 
                  key={opt}
                  className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer hover:bg-white/5 transition-colors mb-1 last:mb-0 ${selected.includes(opt) ? 'text-primary-azure bg-white/10' : 'text-white/80'}`}
                  onClick={() => toggle(opt)}
                >
                  <span className="text-sm font-medium">{opt}</span>
                  {selected.includes(opt) && <Check size={14} />}
                </div>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
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
  const [threatFilter, setThreatFilter] = useState<string[]>(['all']);
  const [sourceFilter, setSourceFilter] = useState<string[]>(['all']);
  const [operationFilter, setOperationFilter] = useState<string[]>(['all']);
  const [timeResolution, setTimeResolution] = useState<'year' | 'month' | 'weekday' | 'hour' | 'minute' | 'date'>('date');

  // New Features State
  const [darkMode, setDarkMode] = useState(true);
  const [lang, setLang] = useState<'he' | 'en' | 'ar' | 'fr' | 'de' | 'es'>('he');
  const [mapLayer, setMapLayer] = useState<'streets' | 'satellite'>('streets');
  const [compareMode, setCompareMode] = useState(false);
  const [compareOperation, setCompareOperation] = useState<string[]>(['all']);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);
  const [activeSearchSource, setActiveSearchSource] = useState<'desktop' | 'mobile' | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('neon');
    else document.documentElement.classList.remove('neon');
  }, [darkMode]);

  const t = translations[lang];
  const isRtl = lang === 'he' || lang === 'ar';

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

  const geoCache = useRef<any>(null);
  if (geoCache.current === null) {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('alertsGeoCache') : null;
      geoCache.current = saved ? JSON.parse(saved) : {};
    } catch (e) {
      geoCache.current = {};
    }
  }

  const operationOptions = useMemo(() => [...operationsDict.map(op => op.name), "שגרה (ללא מערכה)"], []);
  const threatOptions = useMemo(() => Array.from(new Set(Object.values(threatDict))), []);
  const sourceOptions = useMemo(() => Array.from(new Set(globalData.map(d => d.sourceStr))), [globalData]);
  const allCities = useMemo(() => {
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

  const popularRegions = ["מרחב דן", "מרחב ירושלים", "מרחב חיפה", "מרחב נגב", "מרחב השפלה", "מרחב לכיש", "מרחב ירקון", "עוטף עזה", "גליל עליון", "גליל מערבי", "גולן"];

  const handleCitySearchChange = (val: string, source: 'desktop' | 'mobile') => {
    setCitySearch(val);
    setActiveSearchSource(source);
    if (val.trim().length > 0) {
      const filtered = allCities.filter(c => c.toLowerCase().includes(val.toLowerCase())).slice(0, 10);
      setCitySuggestions(filtered);
      setShowSuggestions(true);
    } else {
      const activeRegions = popularRegions.filter(r => allCities.includes(r));
      setCitySuggestions(activeRegions.length > 0 ? [...activeRegions, "---"] : []);
      setShowSuggestions(true);
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

        if (!cacheIsGood) {
          console.log("Cache status: Outdated or Missing.", {
            hasCache: !!cached,
            remoteVersion,
            cachedVersion: cached?.lastModified,
            match: cached?.lastModified === remoteVersion
          });
        }

        if (cacheIsGood && cached) {
          console.log("Cache hit! Loading", cached.data.length, "rows from local storage.");
          setLoadingStatus(lang === 'he' ? "טוען מהמטמון (מהיר)..." : "Loading from cache (fast)...");
          
          // CRITICAL: Hydrate Date objects and ensure structure
          const hydrated = cached.data.map((d: any) => {
            const dt = new Date(d.dateObj || d.time);
            return {
              ...d,
              dateObj: dt,
              hour: dt.getHours(),
              minute: dt.getMinutes(),
              operationsArray: d.operationsArray || []
            };
          });
          
          setGlobalData(hydrated);
          setFilteredData(hydrated);
          setIsFromCache(true);
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
                minute: dt.getMinutes(),
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




  // --- Filtering Logic (Debounced) ---
  useEffect(() => {
    const timer = setTimeout(() => {
      const filtered = globalData.filter(d => {
        let matchCity = true, matchThreat = true, matchSource = true, matchOperation = true, matchDate = true;
        if (citySearch) matchCity = d.cities && d.cities.toLowerCase().includes(citySearch.toLowerCase());
        
        const dThreat = d.threatStr || 'אחר';
        const dSource = d.sourceStr || 'מעורב / לא סווג';
        const dOps = d.operationsArray || ['שגרה'];

        if (!threatFilter.includes('all')) matchThreat = threatFilter.includes(dThreat);
        if (!sourceFilter.includes('all')) matchSource = sourceFilter.includes(dSource);
        
        if (compareMode && !compareOperation.includes('all')) {
          matchOperation = dOps.some(op => operationFilter.includes(op)) || 
                           dOps.some(op => compareOperation.includes(op));
        } else if (!operationFilter.includes('all')) {
          matchOperation = dOps.some(op => operationFilter.includes(op));
        }

        if (dateRange.start) matchDate = matchDate && d.dateObj >= new Date(dateRange.start);
        if (dateRange.end) matchDate = matchDate && d.dateObj <= new Date(dateRange.end);

        return matchCity && matchThreat && matchSource && matchOperation && matchDate;
      });
      
      // Avoid infinite loop if results haven't changed in length
      // For large datasets, a more robust check might be needed, but length + console log for debug
      if (filtered.length !== filteredData.length || (filtered.length > 0 && filteredData.length > 0 && filtered[0].time !== filteredData[0].time)) {
         console.log("Filtering complete. Result size:", filtered.length);
         setFilteredData(filtered);
      }
    }, 300);
    return () => clearTimeout(timer);
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
          .bindTooltip(`<b>${localizeCity(city, lang as LangCode)}</b><br>${lang === 'he' ? 'התרעות' : 'Alerts'}: ${cityCounts[city].toLocaleString()}`, { direction: 'top' });
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
    
    const chartTextColor = darkMode ? '#e2e8f0' : '#475569';
    const chartAxisColor = darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

    const commonAxis = {
      axisLabel: { color: chartTextColor, fontSize: 10, fontFamily: 'Assistant' },
      axisLine: { lineStyle: { color: chartAxisColor } },
      splitLine: { lineStyle: { color: chartAxisColor, type: 'dashed' } }
    };

    // Click events for cross-filtering

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
  }, [loading, darkMode]); // Added darkMode to dependencies for chart re-initialization

  useEffect(() => {
    if (!timeSeriesInstance.current) return;
    
    const chartTextColor = darkMode ? '#e2e8f0' : '#475569';
    const chartAxisColor = darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

    const commonAxis = {
      axisLabel: { color: chartTextColor, fontSize: 10, fontFamily: 'Assistant' },
      axisLine: { lineStyle: { color: chartAxisColor } },
      splitLine: { lineStyle: { color: chartAxisColor, type: 'dashed' } }
    };

    const datasets: { name: string; data: any[]; color: string }[] = [];
    
    if (compareMode && !compareOperation.includes('all')) {
      // Comparison Mode Logic
      const op1Data = filteredData.filter(d => d.operationsArray.some(op => operationFilter.includes(op)));
      const op2Data = filteredData.filter(d => d.operationsArray.some(op => compareOperation.includes(op)));
      
      const g1 = getGroupedData(op1Data, timeResolution, lang);
      const g2 = getGroupedData(op2Data, timeResolution, lang);
      
      const allKeys = Array.from(new Set([...Object.keys(g1), ...Object.keys(g2)]));
      if (['year', 'month', 'hour', 'minute', 'date'].includes(timeResolution)) allKeys.sort();
      else if (timeResolution === 'weekday') allKeys.sort((a, b) => daysHe.indexOf(a) - daysHe.indexOf(b));

      datasets.push({ 
        name: operationFilter.includes('all') ? 'Base' : operationFilter.join(', '), 
        data: allKeys.map(k => g1[k] || 0), 
        color: '#38bdf8' 
      });
      datasets.push({ 
        name: compareOperation.join(', '), 
        data: allKeys.map(k => g2[k] || 0), 
        color: '#fbbf24' 
      });

      let zoomStart = 0;
      if (timeResolution === 'date' && allKeys.length > 0) {
         const d = new Date(); d.setFullYear(d.getFullYear() - 1);
         const thr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
         const idx = allKeys.findIndex(k => k >= thr);
         if (idx !== -1) zoomStart = (idx / allKeys.length) * 100;
      }

      timeSeriesInstance.current.setOption({
        legend: { show: true, bottom: 0, textStyle: { color: chartTextColor } },
        tooltip: { 
          trigger: 'axis', 
          axisPointer: { type: 'cross', label: { backgroundColor: '#0f172a' } }, 
          appendToBody: true, 
          position: customTooltipPosition,
          backgroundColor: darkMode ? '#1e293b' : '#ffffff',
          borderColor: 'rgba(56,189,248,0.2)',
          textStyle: { color: chartTextColor }
        },
        grid: { top: '10%', bottom: (compareMode || timeResolution === 'date') ? '25%' : '5%', left: '2%', right: '2%', containLabel: true },
        dataZoom: timeResolution === 'date' ? [
          { type: 'slider', show: true, bottom: 20, height: 15, borderColor: 'transparent', backgroundColor: 'rgba(0,0,0,0.1)', fillerColor: 'rgba(56,189,248,0.2)', handleStyle: { color: '#38bdf8' }, textStyle: { color: chartTextColor, fontSize: 10 }, start: zoomStart, end: 100 },
          { type: 'inside', start: zoomStart, end: 100 }
        ] : [],
        xAxis: { 
          data: allKeys,
          ...commonAxis,
          axisLabel: { ...commonAxis.axisLabel, rotate: (timeResolution === 'hour' || timeResolution === 'date') ? 45 : 0 }
        },
        yAxis: { 
          type: 'value', 
          ...commonAxis
        },
        series: datasets.map(ds => ({
          name: ds.name,
          type: 'line',
          smooth: true,
          data: ds.data,
          itemStyle: { color: ds.color },
          lineStyle: { width: 3, color: ds.color, shadowBlur: 10, shadowColor: `${ds.color}80` },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: ds.color + '66' },
              { offset: 1, color: ds.color + '00' }
            ])
          }

        }))
      }, true);
    } else {
      const grouped = getGroupedData(filteredData, timeResolution, lang);
      let xData: string[];
      if (timeResolution === 'month') {
        // Sort by canonical month order
        const monthOrder = lang === 'he' ? MONTH_NAMES_HE : MONTH_NAMES_EN;
        xData = monthOrder.filter(m => m in grouped);
        // fill any missing months with 0
        monthOrder.forEach(m => { if (!(m in grouped)) grouped[m] = 0; });
        xData = monthOrder; // full 12 months always
      } else if (timeResolution === 'hour') {
        // Always output exactly 24 bins 00:00–23:00 in order
        xData = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0') + ':00');
      } else if (timeResolution === 'minute') {
        // Always output exactly 60 bins 00–59 in order
        xData = Array.from({ length: 60 }, (_, m) => String(m).padStart(2, '0'));
      } else if (timeResolution === 'daytime') {
        // Full day minutes: 00:00 - 23:59
        xData = Array.from({ length: 1440 }, (_, i) => {
          const h = Math.floor(i / 60);
          const m = i % 60;
          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        });
      } else if (timeResolution === 'weekday') {
        xData = daysHe.filter(d => d in grouped);
        daysHe.forEach(d => { if (!(d in grouped)) grouped[d] = 0; });
        xData = daysHe;
      } else {
        xData = Object.keys(grouped);
        if (['year', 'date'].includes(timeResolution)) xData.sort();
      }
      
      const yData = xData.map(k => grouped[k]);

      // Highlight top 15% most frequent bins in pinkish color
      const sortedVals = [...yData].sort((a, b) => b - a);
      const threshold15 = sortedVals[Math.max(0, Math.floor(sortedVals.length * 0.15) - 1)] || 0;
      const isBarType = ['hour', 'weekday', 'minute', 'month'].includes(timeResolution);

      // For date display on X-axis: convert YYYY-MM-DD back to readable DD/MM
      const displayXData = timeResolution === 'date'
        ? xData.map(k => { const [y,m,d] = k.split('-'); return `${d}/${m}/${y.slice(2)}`; })
        : xData;

      let zoomStart = 0;
      if (timeResolution === 'date' && xData.length > 0) {
         const d = new Date(); d.setFullYear(d.getFullYear() - 1);
         const thr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
         const idx = xData.findIndex(k => k >= thr);
         if (idx !== -1) zoomStart = (idx / xData.length) * 100;
      }

      timeSeriesInstance.current.setOption({
        legend: { show: false },
        tooltip: { 
          trigger: 'axis', 
          axisPointer: { type: 'cross', label: { backgroundColor: '#0f172a' } }, 
          appendToBody: true, 
          position: customTooltipPosition,
          backgroundColor: darkMode ? '#1e293b' : '#ffffff',
          borderColor: 'rgba(56,189,248,0.2)',
          textStyle: { color: chartTextColor }
        },
        grid: { top: '10%', bottom: timeResolution === 'date' ? '25%' : '5%', left: '2%', right: '2%', containLabel: true },
        dataZoom: (timeResolution === 'date' || timeResolution === 'daytime') ? [
          { 
             type: 'slider', 
             show: true, 
             bottom: 20, 
             height: 15, 
             borderColor: 'transparent', 
             backgroundColor: 'rgba(0,0,0,0.1)', 
             fillerColor: 'rgba(56,189,248,0.2)', 
             handleStyle: { color: '#38bdf8' }, 
             textStyle: { color: chartTextColor, fontSize: 10 },
             start: timeResolution === 'date' ? zoomStart : 0,
             end: 100
          },
          { type: 'inside', start: timeResolution === 'date' ? zoomStart : 0, end: 100 }
        ] : [],
        xAxis: { 
          data: displayXData,
          ...commonAxis,
          axisLabel: { 
            ...commonAxis.axisLabel, 
            rotate: (timeResolution === 'hour' || timeResolution === 'date' || timeResolution === 'daytime') ? 45 : 0,
            interval: timeResolution === 'daytime' ? 59 : 'auto' // show only hours on daytime
          }
        },
        yAxis: { 
          type: 'value', 
          ...commonAxis
        },
        series: [{
          name: 'התרעות',
          data: yData.map((v, i) => ({
            value: v,
            itemStyle: v >= threshold15 && yData.filter(x => x >= threshold15).length > 0 ? {
              color: isBarType
                ? {
                    type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [
                      { offset: 0, color: '#f472b6' },
                      { offset: 1, color: '#ec4899' }
                    ]
                  }
                : '#f472b6',
              borderRadius: [8,8,0,0],
              shadowBlur: 12,
              shadowColor: 'rgba(244,114,182,0.5)'
            } : null
          })),
          type: isBarType ? 'bar' : 'line',
          smooth: true,
          itemStyle: { 
            color: '#38bdf8',
            borderRadius: [8, 8, 0, 0],
            shadowBlur: 10,
            shadowColor: 'rgba(56, 189, 248, 0.4)'
          },
          areaStyle: isBarType ? undefined : {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(56,189,248,0.45)' },
              { offset: 1, color: 'rgba(56,189,248,0)' }
            ])
          }

        }]
      }, true);

      timeSeriesInstance.current.off('click');
      timeSeriesInstance.current.on('click', (params: any) => {
        if (timeResolution === 'date' && params.name) {
           const parts = params.name.split('/');
           if (parts.length === 3) {
             const year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
             const dateStr = `${year}-${parts[1]}-${parts[0]}`;
             setDateRange(prev => prev.start === dateStr && prev.end === dateStr ? { start: "", end: "" } : { start: dateStr, end: dateStr });
           }
        }
      });
    }
  }, [filteredData, globalData, timeResolution, compareMode, compareOperation, operationFilter, darkMode, lang]);

  useEffect(() => {
    if (!topCitiesInstance.current) return;
    const counts: Record<string, number> = {};
    filteredData.forEach(d => { if (d.cities) counts[d.cities] = (counts[d.cities] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15);
    // Localized labels for display (X-axis), keeping Hebrew keys for filter logic
    const sortedDisplay = sorted.map(([heName, count]) => [localizeCity(heName, lang as LangCode), count] as [string, number]);
    
    const chartTextColor = darkMode ? '#e2e8f0' : '#475569';
    const chartAxisColor = darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

    const commonAxis = {
      axisLabel: { color: chartTextColor, fontSize: 10, fontFamily: 'Assistant' },
      axisLine: { lineStyle: { color: chartAxisColor } },
      splitLine: { lineStyle: { color: chartAxisColor, type: 'dashed' } }
    };

    topCitiesInstance.current.setOption({
      tooltip: { 
        trigger: 'axis', 
        axisPointer: { type: 'shadow' }, 
        appendToBody: true,
        backgroundColor: darkMode ? '#1e293b' : '#ffffff',
        borderWidth: 0,
        textStyle: { color: chartTextColor },
        position: customTooltipPosition
      },
      grid: { top: '15%', bottom: '15%', left: '2%', right: '2%', containLabel: true },
      xAxis: {
        type: 'category',
        data: sortedDisplay.map(s => s[0]),
        ...commonAxis,
        axisLabel: {
          ...commonAxis.axisLabel,
          interval: 0, rotate: 30,
          formatter: (v: string) => v.length > 8 ? v.substring(0, 8) + '...' : v
        }
      },
      yAxis: { 
        type: 'value', 
        ...commonAxis,
        axisLabel: { show: false } 
      },
      series: [{
        type: 'bar',
        data: sorted.map((s, i) => ({
          value: s[1],
          itemStyle: i < Math.ceil(sorted.length * 0.15) ? {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: '#f472b6' },
                { offset: 1, color: '#ec4899' }
              ]
            },
            borderRadius: [6, 6, 0, 0],
            shadowBlur: 14,
            shadowColor: 'rgba(244,114,182,0.5)'
          } : {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(56,189,248,0.12)' },
                { offset: 1, color: 'rgba(59,130,246,0.06)' }
              ]
            },
            borderRadius: [6, 6, 0, 0],
            shadowBlur: 6,
            shadowColor: 'rgba(56,189,248,0.15)'
          }
        })),
        label: { 
          show: true, 
          position: 'top', 
          fontSize: 10,
          fontWeight: 'bold',
          color: '#38bdf8',
          formatter: '{c}'
        }
      }]
    }, true);

    topCitiesInstance.current.off('click');
    topCitiesInstance.current.on('click', (params: any) => {
      if (params.dataIndex !== undefined && sorted[params.dataIndex]) {
         const heCity = sorted[params.dataIndex][0];
         setCitySearch(prev => prev === heCity ? "" : heCity);
      }
    });
  }, [filteredData, darkMode, lang]);

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
    // Localized pie data — names shown in UI, but click filter still uses Hebrew via heKey property
    const localizeEntries = (counts: Record<string, number>, dict: Record<string, Partial<Record<LangCode, string>>>) =>
      Object.entries(counts).map(([heKey, v]) => ({
        name: localizeStr(heKey, dict, lang as LangCode),
        value: v,
        heKey // keep for click filtering
      }));

    const pieOpt = (data: any[], colors: string[]) => ({
      tooltip: { 
        trigger: 'item', 
        appendToBody: true,
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        borderWidth: 0,
        textStyle: { color: '#fff' },
        position: customTooltipPosition,
        formatter: (p: any) => `${p.name}:<br/><b>${p.value} ${lang === 'he' ? 'התרעות' : 'alerts'}</b> (${p.percent}%)`
      },
      series: [{
        type: 'pie', 
        radius: ['45%', '75%'], 
        avoidLabelOverlap: false,
        minAngle: 15,
        itemStyle: { borderRadius: 8, borderColor: 'rgba(0,0,0,0)', borderWidth: 2 },
        label: { 
          show: false,
          position: 'center'
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 12,
            fontWeight: 'bold',
            formatter: '{b}\n{d}%',
            color: '#fff'
          }
        },
        labelLine: { show: false },
        data, 
        color: colors
      }]
    });

    const neonColors = ['#f87171', '#38bdf8', '#fbbf24', '#3b82f6', '#94a3b8', '#10b981'];
    const classicColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6'];
    const currentColors = darkMode ? neonColors : classicColors;

    threatInstance.current.setOption(pieOpt(localizeEntries(tCounts, threatTranslations), currentColors), true);
    sourceInstance.current.setOption(pieOpt(localizeEntries(sCounts, sourceTranslations), currentColors), true);

    // Interactive Filtering — use heKey to match Hebrew filter values
    threatInstance.current.off('click');
    threatInstance.current.on('click', (params: any) => {
      const heKey = params.data?.heKey ?? params.name;
      if (heKey) setThreatFilter((prev: string[]) => {
        let newF;
        if (prev.includes(heKey)) newF = prev.filter((s: string) => s !== heKey);
        else newF = [...prev.filter((s: string) => s !== 'all'), heKey];
        return newF.length === 0 ? ['all'] : newF;
      });
    });
    sourceInstance.current.off('click');
    sourceInstance.current.on('click', (params: any) => {
      const heKey = params.data?.heKey ?? params.name;
      if (heKey) setSourceFilter((prev: string[]) => {
        let newF;
        if (prev.includes(heKey)) newF = prev.filter((s: string) => s !== heKey);
        else newF = [...prev.filter((s: string) => s !== 'all'), heKey];
        return newF.length === 0 ? ['all'] : newF;
      });
    });
  }, [filteredData, darkMode, lang]);

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
    const loadingPhrases = {
      he: 'מנתח נתוני בטחון...\u200e 🛡️',
      en: '🛡️ Initializing Defense Analytics...',
      ar: '🛡️ جارٍ تحليل بيانات الدفاع...',
      fr: '🛡️ Initialisation de l’analyse...',
      de: '🛡️ Verteidigungs-Analyse wird geladen...',
      es: '🛡️ Iniciando análisis de defensa...',
    };
    return (
      <div className="fixed inset-0 bg-bg-color z-50 flex flex-col justify-center items-center text-primary-deep-blue font-bold text-xl transition-colors duration-300">
        <div className="spinner mb-5" />
        <div className="animate-pulse text-center" dir="rtl">{loadingPhrases[lang] ?? loadingPhrases.he}</div>
      </div>
    );
  }

  return (
    <>
    <div className="mesh-gradient" />
    <div className={`flex flex-col h-screen bg-bg-color font-sans transition-colors duration-500 overflow-hidden relative ${darkMode ? 'neon' : 'light'}`} dir={isRtl ? 'rtl' : 'ltr'}>
      
      {/* Header */}
      <header className="glass-card mx-4 mt-4 px-6 py-3 flex justify-between items-center z-30 flex-shrink-0 border-none shadow-2xl">
        <div className="flex items-center gap-3">
          <motion.div 
            initial={{ rotate: -20, scale: 0.8 }}
            animate={{ rotate: 0, scale: 1 }}
            className="bg-gradient-to-br from-primary-azure to-primary-deep-blue p-2.5 rounded-2xl shadow-[0_0_15px_rgba(56,189,248,0.5)]"
          >
            <Shield size={24} className="text-white" />
          </motion.div>
          <div>
            <h1 className="text-xl md:text-2xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-primary-azure to-primary-deep-blue neon-text">
              {t.title}
            </h1>
            <div className="hidden md:flex items-center gap-2 mt-0.5">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">{isRtl ? 'מחובר לנתוני אמת' : 'CONNECTED TO LIVE DATA'}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4">
          <button 
            className="md:hidden p-2.5 hover:bg-white/10 rounded-xl transition-all text-text-main glass-card border-none"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X size={20} /> : <Filter size={20} />}
          </button>

          <div className="hidden md:flex items-center gap-3">
             <div className="flex items-center gap-2 bg-black/20 rounded-xl px-3 py-1.5 border border-white/5">
                <Search size={14} className="text-text-muted" />
                <div className="relative">
                  <input 
                    type="text" 
                    className="bg-transparent border-none text-sm outline-none w-32 md:w-44 text-text-main placeholder:text-text-muted/50"
                    placeholder={isRtl ? "חיפוש עיר..." : "Search city..."}
                    value={citySearch}
                    onChange={(e) => handleCitySearchChange(e.target.value, 'desktop')}
                    onFocus={() => {
                        handleCitySearchChange(citySearch, 'desktop');
                    }}
                  />
                  <AnimatePresence>
                    {showSuggestions && activeSearchSource === 'desktop' && citySuggestions.length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute top-full left-0 right-0 glass-card mt-2 p-2 z-50 max-h-60 overflow-y-auto min-w-[200px]"
                      >
                        {citySuggestions.map((city, idx) => (
                          city === "---" ? (
                            <div key={idx} className="my-1 border-t border-white/20" />
                          ) : (
                            <div 
                              key={idx} 
                              className="px-4 py-2 hover:bg-white/10 rounded-lg cursor-pointer text-text-main text-sm transition-colors"
                              onClick={() => selectCity(city)}
                            >
                              {city}
                            </div>
                          )
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
             </div>

              <MultiSelect 
                label={t.operation} 
                options={operationOptions}
                selected={operationFilter}
                onChange={setOperationFilter}
                icon={BarChart3}
                isRtl={isRtl}
             />

             {compareMode && (
               <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                 <MultiSelect 
                    label={isRtl ? "להשוות מול..." : "Compare vs..."} 
                    options={operationOptions}
                    selected={compareOperation}
                    onChange={setCompareOperation}
                    icon={TrendingUp}
                    isRtl={isRtl}
                 />
               </motion.div>
             )}

             <MultiSelect 
                label={t.threat} 
                options={threatOptions}
                selected={threatFilter}
                onChange={setThreatFilter}
                icon={PieChartIcon}
                isRtl={isRtl}
             />

             <MultiSelect 
                label={t.source} 
                options={sourceOptions}
                selected={sourceFilter}
                onChange={setSourceFilter}
                icon={Globe}
                isRtl={isRtl}
             />
          </div>

          <div className="h-8 w-[1px] bg-white/10 hidden md:block" />

          {/* Icon group: evenly spaced — dark/light + 6 language flags */}
          <div className="hidden md:flex items-center gap-3">
            {deferredPrompt && (
              <motion.button
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleInstallClick}
                className="flex items-center gap-2 bg-primary-azure/20 text-primary-azure border border-primary-azure/30 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-primary-azure/30 transition-all mr-2"
              >
                <Bell size={14} className="animate-bounce" />
                {lang === 'he' ? 'התקן אפליקציה' : 'Install App'}
              </motion.button>
            )}

            <button 
              onClick={() => {
                setDarkMode(!darkMode);
                document.documentElement.classList.toggle('neon');
              }}
              className="p-2.5 hover:bg-white/10 rounded-xl transition-all text-text-main glass-card border-none flex-shrink-0"
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? <Moon size={20} className="text-accent-gold neon-text" /> : <Sun size={20} className="text-primary-azure" />}
            </button>


            {([
              { code: 'he', flag: 'il', label: 'עברית' },
              { code: 'en', flag: 'us', label: 'English' },
              { code: 'ar', flag: 'sa', label: 'العربية' },
              { code: 'fr', flag: 'fr', label: 'Français' },
              { code: 'de', flag: 'de', label: 'Deutsch' },
              { code: 'es', flag: 'es', label: 'Español' },
            ] as const).map(({ code, flag, label }) => (
              <button
                key={code}
                onClick={() => setLang(code)}
                className={`w-7 h-7 rounded-lg transition-all flex-shrink-0 ${
                  lang === code
                    ? 'ring-2 ring-primary-azure ring-offset-1 ring-offset-transparent opacity-100 shadow-[0_0_8px_rgba(56,189,248,0.5)]'
                    : 'opacity-35 hover:opacity-80'
                }`}
                title={label}
              >
                <img src={`https://flagcdn.com/w40/${flag}.png`} alt={code.toUpperCase()} className="w-full h-full object-cover rounded-md" />
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden p-4 gap-4">
        
        {/* Left Panel: Analytics */}
        <div className="w-full md:w-3/4 flex flex-col gap-4 md:h-full order-1 md:order-2 min-h-min">
          
          {/* Mobile Header Icons: Language & Theme */}
          <div className="md:hidden flex items-center justify-between gap-3 mb-2 flex-shrink-0 w-full overflow-x-auto pb-2 px-2">
            <div className="flex items-center gap-3">
              {([
                { code: 'he', flag: 'il', label: 'עברית' },
                { code: 'en', flag: 'us', label: 'English' },
                { code: 'ar', flag: 'sa', label: 'العربية' },
                { code: 'fr', flag: 'fr', label: 'Français' },
                { code: 'de', flag: 'de', label: 'Deutsch' },
                { code: 'es', flag: 'es', label: 'Español' },
              ] as const).map(({ code, flag, label }) => (
                <button
                  key={`mobile-${code}`}
                  onClick={() => setLang(code)}
                  className={`w-9 h-9 rounded-lg transition-all flex-shrink-0 ${
                    lang === code
                      ? 'ring-2 ring-primary-azure ring-offset-1 ring-offset-transparent opacity-100 shadow-[0_0_8px_rgba(56,189,248,0.5)]'
                      : 'opacity-50 hover:opacity-100'
                  }`}
                  title={label}
                >
                  <img src={`https://flagcdn.com/w40/${flag}.png`} alt={code.toUpperCase()} className="w-full h-full object-cover rounded-md" />
                </button>
              ))}
            </div>

            <button 
              onClick={() => {
                setDarkMode(!darkMode);
                document.documentElement.classList.toggle('neon');
              }}
              className="p-2 hover:bg-white/10 rounded-xl transition-all text-text-main glass-card border-none flex-shrink-0"
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? <Moon size={20} className="text-accent-gold neon-text" /> : <Sun size={20} className="text-primary-azure" />}
            </button>
          </div>

          {/* KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 flex-shrink-0">
            {/* ... KPIs ... */}
            <motion.div whileHover={{ y: -5 }} className="glass-card p-3 relative overflow-hidden group">
              <div className="absolute top-0 bottom-0 left-0 w-1 bg-primary-azure group-hover:w-2 transition-all shadow-[0_0_15px_var(--primary-azure)]" />
              <div className="text-[10px] text-text-muted font-bold tracking-widest uppercase mb-1">{t.totalAlerts}</div>
              <div className="text-2xl font-black text-text-main neon-text">{filteredData.length.toLocaleString()}</div>
            </motion.div>
            
            <motion.div whileHover={{ y: -5 }} className="glass-card p-3 relative group z-10 hover:z-50">
              <div className="absolute top-0 bottom-0 left-0 w-1 bg-sky-400 shadow-[0_0_15px_#38bdf8]" />
              <div className="flex justify-between items-center mb-1">
                <div className="text-[10px] text-text-muted font-bold tracking-widest uppercase">{t.showerIndex}</div>
                <div className="relative group/tooltip">
                  <Info size={14} className="text-sky-400 cursor-help" />
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-52 bg-slate-900/95 border border-sky-400/30 text-sky-100 text-[10px] rounded-xl p-3 shadow-2xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-200 pointer-events-none z-[100] leading-relaxed">
                    {isRtl
                      ? 'חלון זמן של 30 דקות שבו מספר ההתרעות ההיסטורי נמוך ביותר — הזמן הבטוח ביותר למקלחת שקטה.'
                      : 'A 30-minute window with the historically lowest alert frequency — the safest time for a quiet shower.'}
                  </div>
                </div>
              </div>
              <div className="flex flex-col">
                {showerIndex ? (
                   <>
                    <div className="text-xl font-black text-text-main leading-none">{showerIndex.time}</div>
                    <div className="text-[9px] text-text-muted font-bold mt-1.5 flex items-center gap-2">
                       <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                        {showerIndex.probability}% {isRtl ? 'סיכוי לשקט' : 'Quiet Chance'}
                       </span>
                    </div>
                   </>
                ) : (
                  <span className="text-xs italic opacity-50">{t.noData}</span>
                )}
              </div>
            </motion.div>

            <motion.div whileHover={{ y: -5 }} className="glass-card p-3 relative overflow-hidden group sm:col-span-2 md:col-span-1">
              <div className="absolute top-0 bottom-0 left-0 w-1 bg-alert-red shadow-[0_0_15px_#f87171]" />
              <div className="text-[10px] text-text-muted font-bold tracking-widest uppercase mb-1">{t.lastAlert}</div>
              <div className="flex flex-col">
                {filteredData.length > 0 ? (() => {
                  const lastD = filteredData[filteredData.length-1].dateObj;
                  const dateStr = lastD.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                  const timeStr = lastD.toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <>
                      <div className="text-xl font-black text-text-main leading-none">{timeStr}</div>
                      <div className="text-[10px] text-text-muted mt-1">{dateStr}</div>
                    </>
                  );
                })() : <span className="text-xl font-black text-text-main">-</span>}
              </div>
            </motion.div>
          </div>

          <div className="flex-1 grid grid-cols-2 md:grid-cols-12 md:grid-rows-5 gap-4 min-h-0 overflow-visible md:overflow-hidden pb-4 md:pb-0">
            {/* Time Series */}
            <div className="glass-card p-4 flex flex-col col-span-2 md:col-span-8 md:row-span-3 h-[300px] md:h-full neon-border overflow-hidden">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex gap-1 p-0.5 bg-black/20 rounded-xl border border-white/5">
                    {(['date', 'year', 'month', 'weekday', 'hour', 'minute', 'daytime'] as const).map(res => (
                      <button 
                        key={res}
                        className={`px-2.5 py-0.5 rounded-lg text-[9px] font-bold transition-all ${timeResolution === res ? 'bg-primary-azure text-text-main shadow-[0_0_10px_rgba(56,189,248,0.4)]' : 'text-text-muted hover:text-text-main'}`}
                        onClick={() => setTimeResolution(res)}
                      >
                        {res === 'year' ? t.years : res === 'month' ? t.months : res === 'date' ? t.date : res === 'weekday' ? t.days : res === 'hour' ? t.hours : res === 'minute' ? t.minutes : t.daytime}
                      </button>
                    ))}
                  </div>
                  <button 
                      onClick={() => setCompareMode(!compareMode)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-xl text-[9px] font-black transition-all ${compareMode ? 'bg-accent-gold text-text-main shadow-[0_0_10px_#fbbf24]' : 'bg-black/20 text-text-muted border border-white/5 hover:border-white/20'}`}
                  >
                      <TrendingUp size={11} />
                      {t.compare}
                  </button>
                </div>
                <div ref={timeSeriesChartRef} className="flex-1 w-full min-h-0" />
              </div>

            {/* Threat */}
            <div className="glass-card p-3 flex flex-col col-span-1 md:col-span-4 md:row-span-3 h-[250px] md:h-full overflow-hidden">
                <div className="flex items-center gap-2 mb-3">
                   <PieChartIcon size={14} className="text-alert-red" />
                   <span className="font-black text-text-main text-[10px] uppercase tracking-widest">{t.threatDist}</span>
                </div>
                <div ref={threatChartRef} className="flex-1 w-full min-h-0" />
            </div>

            {/* Source */}
            <div className="glass-card p-4 flex flex-col col-span-1 md:col-span-4 md:row-span-2 h-[250px] md:h-full overflow-hidden">
                <div className="flex items-center gap-2 mb-3">
                   <Globe size={16} className="text-primary-azure" />
                   <span className="font-black text-text-main text-xs uppercase tracking-widest">{t.sourceDist}</span>
                </div>
                <div ref={sourceChartRef} className="flex-1 w-full min-h-0" />
              </div>
            {/* Top Cities */}
            <div className="glass-card p-4 flex flex-col col-span-2 md:col-span-8 md:row-span-2 h-[300px] md:h-full overflow-hidden">
                <div className="flex items-center gap-2 mb-3">
                   <MapIcon size={16} className="text-primary-azure" />
                   <span className="font-black text-text-main text-xs uppercase tracking-widest">{t.topCities}</span>
                </div>
                <div ref={topCitiesChartRef} className="flex-1 w-full min-h-0" />
            </div>
          </div>
        </div>

        {/* Right Panel: Map */}
        <div className="w-full md:w-1/4 glass-card flex flex-col overflow-hidden h-[400px] md:h-full relative flex-shrink-0 order-last md:order-1 border-none shadow-xl mb-6 md:mt-0 mt-4">
          <div className="px-5 py-2 bg-black/20 border-b border-white/5 flex justify-between items-center">
            <span className="font-black text-text-main text-[10px] uppercase tracking-widest">{t.mapTitle}</span>
            <button 
                onClick={() => setMapLayer(mapLayer === 'streets' ? 'satellite' : 'streets')}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-all text-text-muted"
            >
                <Layers size={14} />
            </button>
          </div>
          <div 
            id="map" 
            className="flex-1 z-10 transition-all duration-700 grayscale-[0.5] invert-[0.1]" 
            style={darkMode ? { filter: 'invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%)' } : {}}
          />
          {geocodingStatus && (
            <div className="absolute bottom-4 left-4 right-4 glass-card px-4 py-2 text-[10px] font-black text-primary-azure z-20 flex items-center gap-3 border-none bg-black/60 shadow-2xl">
              <div className="mini-spinner" /> {geocodingStatus}
            </div>
          )}
        </div>
      </main>

      {/* Ticker */}
      <footer className={`h-12 flex items-center overflow-hidden z-30 shadow-[0_-10px_30px_rgba(0,0,0,0.5)] transition-all duration-1000 ${liveAlert ? 'live-flash' : 'ticker-footer'}`}>
        <div className="bg-black/30 backdrop-blur-md h-full px-6 flex items-center font-black text-xs uppercase tracking-widest text-white z-10 border-r border-white/10 shadow-[5px_0_15px_rgba(0,0,0,0.3)]">
          {liveAlert ? `🚨 ${t.liveAlert}` : t.tickerTitle}
        </div>
        <div className="ticker-move flex-1 text-white py-1">
          {liveAlert ? (
            <span className="inline-block px-10 text-base font-black neon-text">
              {liveAlert.title}: <span className="text-pink-300">{liveAlert.cities}</span>
            </span>
          ) : (
            globalData.slice(-20).reverse().map((alert, i) => {
              const d = alert.dateObj;
              const shortDate = d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: '2-digit', month: '2-digit' });
              const timeStr = d.toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
              return (
                <span key={i} className="inline-block px-8 text-xs font-semibold opacity-90 hover:opacity-100 transition-opacity">
                  <span className="text-pink-400">●</span>{' '}
                  <b className="text-white">{localizeCity(alert.cities, lang as LangCode)}</b>
                  <span className="text-pink-200/70 font-normal"> · {shortDate} · {timeStr}</span>
                </span>
              );
            })
          )}
        </div>
        
        {/* Cache Indicator */}
        <div className="hidden md:flex items-center gap-2 px-6 h-full border-l border-white/10 text-[9px] font-bold tracking-widest uppercase">
          <span className="text-pink-200/60">{t.cacheStatus}</span>
          <span className={isFromCache ? "text-emerald-400" : "text-amber-400"}>
            {isFromCache ? t.cacheOn : t.cacheOff}
          </span>
          <div className={`w-2 h-2 rounded-full ${isFromCache ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-amber-400 animate-pulse"}`} />
        </div>
      </footer>

      {/* Mobile Menu Backdrop */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] md:hidden"
            />
            <motion.div 
              initial={{ x: isRtl ? '100%' : '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: isRtl ? '100%' : '-100%' }}
              className="fixed inset-y-0 right-0 w-[85%] max-w-sm z-[100] glass-card m-4 p-8 flex flex-col gap-8 md:hidden overflow-y-auto border-none shadow-[w-full_0_50px_rgba(0,0,0,0.5)]"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black text-white neon-text uppercase tracking-tighter">{isRtl ? 'מסננים' : 'Filters'}</h2>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 hover:bg-white/10 rounded-xl transition-all">
                  <X size={24} className="text-white" />
                </button>
              </div>
              
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">{t.search}</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      className="w-full glass-card bg-black/30 border-none px-4 py-3 text-white outline-none focus:ring-1 focus:ring-primary-azure shadow-inner"
                      placeholder={isRtl ? "חיפוש עיר..." : "Search city..."}
                      value={citySearch}
                      onChange={(e) => handleCitySearchChange(e.target.value, 'mobile')}
                      onFocus={() => {
                        handleCitySearchChange(citySearch, 'mobile');
                      }}
                    />
                    <AnimatePresence>
                      {showSuggestions && activeSearchSource === 'mobile' && citySuggestions.length > 0 && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute top-full left-0 right-0 bg-slate-900 shadow-2xl border border-white/10 rounded-xl mt-2 p-2 z-[110] max-h-40 overflow-y-auto"
                        >
                          {citySuggestions.map((city, idx) => (
                            city === "---" ? (
                              <div key={idx} className="my-2 border-t border-white/20" />
                            ) : (
                              <div 
                                key={idx} 
                                className="px-4 py-3 hover:bg-white/10 rounded-lg cursor-pointer text-white text-sm transition-colors"
                                onClick={() => selectCity(city)}
                              >
                                {city}
                              </div>
                            )
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">{t.operation}</label>
                    <div className="flex flex-wrap gap-2">
                        {["all", ...operationsDict.map(op => op.name)].map(opt => (
                            <button 
                                key={opt}
                                onClick={() => {
                                    if (opt === 'all') setOperationFilter(['all']);
                                    else {
                                        const newOps = operationFilter.includes(opt) 
                                            ? operationFilter.filter(o => o !== opt)
                                            : [...operationFilter.filter(o => o !== 'all'), opt];
                                        setOperationFilter(newOps.length === 0 ? ['all'] : newOps);
                                    }
                                }}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${operationFilter.includes(opt) ? 'bg-primary-azure text-white shadow-lg' : 'bg-black/40 text-text-muted border border-white/5'}`}
                            >
                                {opt === 'all' ? 'הכל' : opt}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">{t.threat}</label>
                    <div className="flex flex-wrap gap-2">
                        {["all", ...Array.from(new Set(Object.values(threatDict)))].map(opt => (
                            <button 
                                key={opt}
                                onClick={() => {
                                    if (opt === 'all') setThreatFilter(['all']);
                                    else {
                                        const newThreats = threatFilter.includes(opt) 
                                            ? threatFilter.filter(t => t !== opt)
                                            : [...threatFilter.filter(t => t !== 'all'), opt];
                                        setThreatFilter(newThreats.length === 0 ? ['all'] : newThreats);
                                    }
                                }}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${threatFilter.includes(opt) ? 'bg-primary-azure text-white shadow-lg' : 'bg-black/40 text-text-muted border border-white/5'}`}
                            >
                                {opt === 'all' ? 'הכל' : opt}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">{t.dateRange}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input 
                      type="date" 
                      className="glass-card bg-black/30 border-none px-3 py-2 text-xs text-white"
                      value={dateRange.start}
                      onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    />
                    <input 
                      type="date" 
                      className="glass-card bg-black/30 border-none px-3 py-2 text-xs text-white"
                      value={dateRange.end}
                      onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    />
                  </div>
                </div>

                <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="mt-6 bg-gradient-to-r from-primary-azure to-primary-deep-blue text-white font-black py-4 rounded-2xl shadow-[0_10px_30px_rgba(56,189,248,0.4)] active:scale-95 transition-all text-sm uppercase tracking-widest"
                >
                  {isRtl ? 'הצג תוצאות' : 'Show Results'}
                </button>

                {deferredPrompt && (
                  <button 
                    onClick={handleInstallClick}
                    className="mt-4 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-black py-3 rounded-2xl shadow-lg active:scale-95 transition-all text-sm uppercase tracking-widest flex items-center justify-center gap-2"
                  >
                    <Bell size={18} className="animate-bounce" />
                    {lang === 'he' ? 'התקן אפליקציה' : 'Install App'}
                  </button>
                )}

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
    </>
  );
}
