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

// Ensures Leaflet is available globally
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
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
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
  } catch (e) { console.warn("Cache save failed:", e); }
};

const loadFromCache = async (): Promise<{ data: any[], lastModified: string } | null> => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const dataReq = store.get('alerts');
    const dateReq = store.get('lastModified');
    return new Promise((resolve) => {
      let r: any = { data: null, lastModified: null };
      dataReq.onsuccess = () => { r.data = dataReq.result; };
      dateReq.onsuccess = () => { r.lastModified = dateReq.result; };
      tx.oncomplete = () => (r.data && r.lastModified) ? resolve(r) : resolve(null);
      tx.onerror = () => resolve(null);
    });
  } catch (e) { return null; }
};

// --- Constants & Dictionaries ---
const daysHe = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const translations = {
  he: {
    title: "מגן ישראל | דשבורד חקר נתונים", search: "חיפוש עיר/אזור:", threat: "סוג איום:", source: "מקור איום:",
    operation: "מערכה:", all: "הכל", loading: "טוען נתונים...", totalAlerts: "סה\"כ התרעות", smartInsight: "תובנה חכמה 🎯",
    lastAlert: "זמן התרעה אחרונה", mapTitle: "מפת מוקדים", liveAlert: "צבע אדום", tickerTitle: "מבזק התרעות",
    timeSeries: "התפלגות לאורך זמן", topCities: "היישובים המותקפים (Top 15)", threatDist: "סוגי איום", 
    sourceDist: "מקור איום", years: "שנים", months: "חודשים", days: "ימים", hours: "שעות", minutes: "דקות",
    satellite: "לוויין", streets: "רחובות", compare: "השוואה", showerIndex: "מדד המקלחת 🚿",
    showerDesc: "הזמן הבטוח למקלחת", generate: "ייצר תובנות", generating: "מנתח...", 
    noData: "אין נתונים", warningTime: "זמן התגוננות", dateRange: "טווח תאריכים"
  },
  en: {
    title: "Shield of Israel | Analytics", search: "Search City:", threat: "Threat Type:", source: "Source:",
    operation: "Campaign:", all: "All", loading: "Loading...", totalAlerts: "Total Alerts", smartInsight: "Insight 🎯",
    lastAlert: "Last Alert", mapTitle: "Hotspots Map", liveAlert: "Red Alert", tickerTitle: "Ticker",
    timeSeries: "Over Time", topCities: "Top 15 Locations", threatDist: "Threat Distribution",
    sourceDist: "Threat Source", years: "Years", months: "Months", days: "Days", hours: "Hours", minutes: "Minutes",
    satellite: "Satellite", streets: "Streets", compare: "Compare", showerIndex: "Shower Index 🚿",
    showerDesc: "Safest shower time", generate: "Insights", generating: "Analyzing...",
    noData: "No Data", warningTime: "Warning Time", dateRange: "Date Range"
  }
};

const threatDict: Record<string, string> = { "0":"ירי רקטות וטילים","1":"ירי רקטות וטילים","2":"חדירת כלי טיס עוין","3":"רעידת אדמה","4":"אירוע רדיולוגי","5":"חדירת מחבלים","6":"צונאמי","7":"אירוע חומרים מסוכנים","8":"אירוע לא קונבנציונלי" };

const operationsDict = [
  { name: "חגורה שחורה (2019)", start: new Date("2019-11-12"), end: new Date("2019-11-14T23:59:59") },
  { name: "שומר החומות (2021)", start: new Date("2021-05-10"), end: new Date("2021-05-21T23:59:59") },
  { name: "עלות השחר (2022)", start: new Date("2022-08-05"), end: new Date("2022-08-07T23:59:59") },
  { name: "מגן וחץ (2023)", start: new Date("2023-05-09"), end: new Date("2023-05-13T23:59:59") },
  { name: "מלחמת חרבות ברזל (2023+)", start: new Date("2023-10-07"), end: new Date("2099-12-31T23:59:59") },
  { name: "מתקפת אפריל (2024)", start: new Date("2024-04-13"), end: new Date("2024-04-14T23:59:59") },
  { name: "מתקפת אוקטובר (2024)", start: new Date("2024-10-01"), end: new Date("2024-10-01T23:59:59") }
];

const baseCoords: Record<string, [number, number]> = { "שדרות":[31.5282,34.5956],"אשקלון":[31.6693,34.5715],"נתיבות":[31.4167,34.5833],"באר שבע":[31.2518,34.7913],"אשדוד":[31.7915,34.6394],"אילת":[29.5577,34.9519],"קרית שמונה":[33.2073,35.5694],"מטולה":[33.2801,35.5786],"צפת":[32.9646,35.4960],"נהריה":[33.0151,35.0941],"חיפה":[32.7940,34.9896],"תל אביב":[32.0853,34.7818],"ירושלים":[31.7683,35.2137] };

const customTooltipPosition = (point: any, params: any, dom: any, rect: any, size: any) => {
  const obj: any = { top: 10 };
  obj[['left', 'right'][+(point[0] < size.viewSize[0] / 2)]] = 5;
  return obj;
};

const getGroupedData = (data: any[], res: string) => {
  const grouped: Record<string, number> = {};
  data.forEach(d => {
    if (!d.dateObj) return;
    let key = "";
    if (res === 'year') key = d.year || "Unknown";
    else if (res === 'month') key = d.month || "Unknown";
    else if (res === 'weekday') key = (d.dayOfWeek !== undefined) ? daysHe[d.dayOfWeek] : "Unknown";
    else if (res === 'hour') key = String(d.hour || 0).padStart(2, '0') + ":00";
    else if (res === 'minute') key = String(d.hour || 0).padStart(2, '0') + ":" + String(Math.floor((d.dateObj?.getMinutes() || 0)/10)*10).padStart(2, '0');
    grouped[key] = (grouped[key] || 0) + 1;
  });
  return grouped;
};

// --- MultiSelect Component ---
const MultiSelect = ({ label, options, selected = ['all'], onChange, icon: Icon, isRtl }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const safeSelected = Array.isArray(selected) ? selected : ['all'];
  const toggle = (val: string) => {
    if (val === 'all') onChange(['all']);
    else {
      const filtered = safeSelected.filter(s => s !== 'all');
      const newSelected = safeSelected.includes(val) ? filtered.filter(s => s !== val) : [...filtered, val];
      onChange(newSelected.length === 0 ? ['all'] : newSelected);
    }
  };
  return (
    <div className="relative">
      <button onClick={() => setIsOpen(!isOpen)} className="glass-card flex items-center justify-between gap-2 px-3 py-1.5 text-[10px] font-black hover:bg-white/10 transition-all min-w-[120px] h-9">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={14} className="text-primary-azure" />}
          <span className="truncate max-w-[80px]">{safeSelected.includes('all') ? label : `${safeSelected.length} ${isRtl ? 'נבחרו' : 'Selected'}`}</span>
        </div>
        <ChevronDown size={12} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute top-full mt-2 glass-card z-[100] p-2 min-w-[220px] max-h-[300px] overflow-y-auto shadow-2xl border border-white/10 backdrop-blur-3xl">
            <button onClick={() => { toggle('all'); setIsOpen(false); }} className={`w-full flex justify-between p-2 rounded-lg text-xs ${safeSelected.includes('all') ? 'text-primary-azure bg-white/5' : 'text-white/60'}`}>
              <span>{isRtl ? 'הכל' : 'All'}</span> {safeSelected.includes('all') && <Check size={14}/>}
            </button>
            <div className="h-px bg-white/5 my-1" />
            {options.map((o: string) => (
              <button key={o} onClick={() => toggle(o)} className={`w-full flex justify-between p-2 rounded-lg text-xs ${safeSelected.includes(o) ? 'text-white bg-white/10 font-bold' : 'text-white/60 hover:bg-white/5'}`}>
                <span className="truncate">{o}</span> {safeSelected.includes(o) && <Check size={14} className="text-primary-azure" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const [globalData, setGlobalData] = useState<any[]>([]);
  const [filteredData, setFilteredData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [lang, setLang] = useState<'he'|'en'>('he');
  const [darkMode, setDarkMode] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  const [threatFilter, setThreatFilter] = useState<string[]>(['all']);
  const [sourceFilter, setSourceFilter] = useState<string[]>(['all']);
  const [operationFilter, setOperationFilter] = useState<string[]>(['all']);
  const [timeResolution, setTimeResolution] = useState<'year'|'month'|'weekday'|'hour'|'minute'>('month');
  const [compareMode, setCompareMode] = useState(false);
  const [compareOperation, setCompareOperation] = useState<string[]>(['all']);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mapLayer, setMapLayer] = useState<'streets'|'satellite'>('streets');
  const [liveAlert, setLiveAlert] = useState<any>(null);

  const t = translations[lang], isRtl = lang === 'he';
  const mapRef = useRef<L.Map|null>(null);
  const timeSeriesChartRef = useRef<HTMLDivElement>(null), topCitiesChartRef = useRef<HTMLDivElement>(null);
  const threatChartRef = useRef<HTMLDivElement>(null), sourceChartRef = useRef<HTMLDivElement>(null);
  const timeSeriesInstance = useRef<echarts.ECharts|null>(null), topCitiesInstance = useRef<echarts.ECharts|null>(null);
  const threatInstance = useRef<echarts.ECharts|null>(null), sourceInstance = useRef<echarts.ECharts|null>(null);

  const getOperationNames = (date: Date) => {
    const matched = operationsDict.filter(o => date >= o.start && date <= o.end).map(o => o.name);
    return matched.length ? matched : ["שגרה (ללא מערכה)"];
  };

  const threatOptions = useMemo(() => Array.from(new Set(Object.values(threatDict))), []);
  const sourceOptions = useMemo(() => Array.from(new Set(globalData.map(d => d.sourceStr))), [globalData]);

  // --- Data Loading ---
  useEffect(() => {
    const csvUrl = 'https://raw.githubusercontent.com/yuval-harpaz/alarms/master/data/alarms.csv';
    const load = async () => {
      setLoading(true); setLoadingStatus(t.loading);
      try {
        let sha = '';
        try {
          const res = await fetch('https://api.github.com/repos/yuval-harpaz/alarms/commits?path=data/alarms.csv&per_page=1');
          if (res.ok) { const data = await res.json(); sha = data[0].sha; }
        } catch(e){}
        const cached = await loadFromCache();
        if (cached && (sha==='' || cached.lastModified===sha) && cached.data?.[0]?.operationsArray) {
          setGlobalData(cached.data); setFilteredData(cached.data); setLoading(false);
          return;
        }
        Papa.parse(csvUrl, { download:true, header:true, skipEmptyLines:true, worker:true, complete:(r)=>{
          const p = r.data.filter((d:any)=>d.time).map((d:any)=>{
            const dt = new Date(d.time), rStr = Object.values(d).join(" ").toLowerCase(), ops = getOperationNames(dt);
            let s = "מעורב / לא סווג";
            if (rStr.includes("איראן")) s="איראן"; else if (rStr.includes("לבנון")) s="לבנון"; else if (rStr.includes("עזה")) s="רצועת עזה";
            let tr = threatDict[d.threat] || "אחר";
            return { ...d, dateObj:dt, year:dt.getFullYear().toString(), month:dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0'), dayOfWeek:dt.getDay(), hour:dt.getHours(), threatStr:tr, sourceStr:s, operationsArray:ops };
          });
          setGlobalData(p); setFilteredData(p); setLoading(false); saveToCache(p, sha||'fallback');
        }});
      } catch(e){ setLoading(false); }
    };
    load();
  }, [lang]);

  // --- Filtering ---
  useEffect(() => {
    const timer = setTimeout(() => {
      const f = globalData.filter(d => {
        if (citySearch && (!d.cities || !d.cities.toLowerCase().includes(citySearch.toLowerCase()))) return false;
        if (!threatFilter.includes('all') && !threatFilter.includes(d.threatStr)) return false;
        if (!sourceFilter.includes('all') && !sourceFilter.includes(d.sourceStr)) return false;
        const dOps = d.operationsArray || [];
        if (compareMode && !compareOperation.includes('all')) {
          if (!dOps.some(o => operationFilter.includes(o)) && !dOps.some(o => compareOperation.includes(o))) return false;
        } else if (!operationFilter.includes('all')) {
          if (!dOps.some(o => operationFilter.includes(o))) return false;
        }
        if (dateRange.start && d.dateObj < new Date(dateRange.start)) return false;
        if (dateRange.end && d.dateObj > new Date(dateRange.end)) return false;
        return true;
      });
      if (f.length !== filteredData.length) setFilteredData(f);
    }, 300);
    return () => clearTimeout(timer);
  }, [citySearch, threatFilter, sourceFilter, operationFilter, compareMode, compareOperation, dateRange, globalData]);

  // --- Charts ---
  useEffect(() => {
    if (loading) return;
    const init = (r:any, i:any) => { if (r.current && !i.current) i.current = echarts.init(r.current); };
    init(timeSeriesChartRef, timeSeriesInstance); init(topCitiesChartRef, topCitiesInstance);
    init(threatChartRef, threatInstance); init(sourceChartRef, sourceInstance);

    const tsData = getGroupedData(filteredData, timeResolution);
    const xData = Object.keys(tsData).sort();
    timeSeriesInstance.current?.setOption({
      tooltip: { trigger: 'axis', position: customTooltipPosition },
      grid: { top: '10%', bottom: '15%', left: '2%', right: '2%', containLabel: true },
      xAxis: { type: 'category', data: xData, axisLabel: { color: '#94a3b8', fontSize: 10 } },
      yAxis: { type: 'value', axisLabel: { color: '#64748b' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
      series: [{ data: xData.map(k=>tsData[k]), type: 'line', smooth: true, itemStyle: { color: '#38bdf8' }, areaStyle: { color: 'rgba(56,189,248,0.2)' } }]
    });

    const tCounts: Record<string, number> = {};
    filteredData.forEach(d => tCounts[d.threatStr] = (tCounts[d.threatStr] || 0) + 1);
    threatInstance.current?.setOption({
      tooltip: { trigger: 'item', position: customTooltipPosition },
      series: [{ type: 'pie', radius: ['40%', '70%'], data: Object.entries(tCounts).map(([n, v]) => ({ name: n, value: v })), label: { show: false } }]
    });
    threatInstance.current?.off('click');
    threatInstance.current?.on('click', (p:any) => setThreatFilter([p.name]));
  }, [filteredData, loading, timeResolution, darkMode]);

  // --- Map ---
  useEffect(() => {
    if (!loading && !mapRef.current) {
      mapRef.current = L.map('map', { zoomControl: false }).setView([31.5, 34.8], 7);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(mapRef.current);
    }
  }, [loading]);

  if (loading) return <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center gap-4"><div className="w-12 h-12 border-4 border-primary-azure border-t-transparent rounded-full animate-spin"></div><div className="text-primary-azure font-black neon-text uppercase tracking-widest">{loadingStatus}</div></div>;

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-700 ${darkMode ? 'bg-slate-950 text-white' : 'bg-slate-900 text-slate-100'}`}>
      <div className="mesh-gradient opacity-40" />
      
      <header className="h-20 glass-card mx-4 mt-4 flex items-center justify-between px-8 z-50 border-none shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary-azure shadow-[0_0_20px_rgba(56,189,248,0.5)] rounded-2xl"><Shield size={28} className="text-white" /></div>
          <div><h1 className="text-xl font-black neon-text uppercase tracking-tighter">{t.title}</h1></div>
        </div>
        
        <div className="hidden md:flex items-center gap-4">
          <div className="relative">
             <input type="text" className="glass-card pl-10 pr-4 py-2 text-xs w-64 outline-none focus:ring-1 focus:ring-primary-azure" placeholder={isRtl?"חיפוש...":"Search..."} value={citySearch} onChange={e=>setCitySearch(e.target.value)} />
             <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          </div>
          <MultiSelect label={t.threat} options={threatOptions} selected={threatFilter} onChange={setThreatFilter} isRtl={isRtl} icon={Bell} />
          <button onClick={()=>setDarkMode(!darkMode)} className="p-2 glass-card">{darkMode?<Sun size={18}/>:<Moon size={18}/>}</button>
          <button onClick={()=>setLang(lang==='he'?'en':'he')} className="p-2 glass-card flex items-center gap-2 text-xs font-bold uppercase"><Languages size={16}/> {lang==='he'?'EN':'HE'}</button>
        </div>
        <button onClick={()=>setIsMobileMenuOpen(true)} className="md:hidden p-2 glass-card"><Menu size={24}/></button>
      </header>

      <main className="flex-1 flex flex-col md:flex-row p-4 gap-4 overflow-hidden">
        <div className="w-full md:w-3/4 flex flex-col gap-4 overflow-y-auto scrollbar-hide">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass-card p-4 relative overflow-hidden"><div className="text-xs text-text-muted mb-1">{t.totalAlerts}</div><div className="text-3xl font-black neon-text">{filteredData.length.toLocaleString()}</div></div>
            <div className="glass-card p-4 relative overflow-hidden"><div className="text-xs text-text-muted mb-1">{t.lastAlert}</div><div className="text-xl font-black">{filteredData.length?filteredData[filteredData.length-1].time:"-"}</div></div>
            <div className="glass-card p-4 relative overflow-hidden bg-primary-azure/5"><div className="text-xs text-primary-azure mb-1">{isRtl?"סטטיסטיקה":"Stats"}</div><div className="text-xl font-black">{isRtl?"מגמת עלייה":"Uptrend"} 📈</div></div>
          </div>
          
          <div className="flex flex-col md:flex-row gap-4 h-[400px]">
            <div className="glass-card p-4 flex-1 h-full"><div className="text-xs font-black mb-4 uppercase tracking-widest">{t.timeSeries}</div><div ref={timeSeriesChartRef} className="h-full w-full" /></div>
            <div className="glass-card p-4 w-full md:w-[300px] h-full"><div className="text-xs font-black mb-4 uppercase tracking-widest">{t.threatDist}</div><div ref={threatChartRef} className="h-full w-full" /></div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 h-[300px]">
             <div className="glass-card p-4 flex-1 h-full"><div ref={sourceChartRef} className="h-full w-full" /></div>
             <div className="glass-card p-4 flex-1 h-full"><div ref={topCitiesChartRef} className="h-full w-full" /></div>
          </div>
        </div>

        <div className="w-full md:w-1/4 glass-card relative h-[400px] md:h-full">
          <div id="map" className="h-full w-full" />
        </div>
      </main>

      <footer className="h-10 bg-black/60 flex items-center px-4 gap-4 border-t border-white/5 opacity-80 hover:opacity-100 transition-all font-mono text-[10px]">
        <div className="text-primary-azure font-black">{t.tickerTitle} |</div>
        <div className="flex-1 overflow-hidden whitespace-nowrap">
           {globalData.slice(-10).reverse().map((a,i)=>(<span key={i} className="mr-8">● {a.cities} ({a.threatStr})</span>))}
        </div>
      </footer>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setIsMobileMenuOpen(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90]" />
            <motion.div initial={{x:'100%'}} animate={{x:0}} exit={{x:'100%'}} className="fixed inset-y-0 right-0 w-[80%] glass-card z-[100] p-8 flex flex-col gap-8">
              <div className="flex justify-between items-center"><h2 className="text-2xl font-black uppercase">{isRtl?'סינון':'Filter'}</h2><button onClick={()=>setIsMobileMenuOpen(false)}><X size={24}/></button></div>
              <div className="flex flex-col gap-6">
                <input type="text" className="glass-card p-4 bg-black/20 outline-none" value={citySearch} onChange={e=>setCitySearch(e.target.value)} placeholder={isRtl?"חיפוש עיר...":"Search..."} />
                <div className="flex flex-col gap-2"><label className="text-[10px] uppercase font-black">{t.threat}</label><div className="flex flex-wrap gap-2">{threatOptions.map(o=>(<button key={o} onClick={()=>setThreatFilter([o])} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${threatFilter.includes(o)?'bg-primary-azure text-white':'bg-white/5 text-text-muted'}`}>{o}</button>))}</div></div>
                <button onClick={()=>setIsMobileMenuOpen(false)} className="mt-auto bg-primary-azure py-4 rounded-2xl font-black shadow-lg">SHOW RESULTS</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
