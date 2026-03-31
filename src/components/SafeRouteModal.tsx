import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { RouteImpactData } from '../utils/routePlanner';
import { X, Navigation, Info, Star, AlertTriangle, Clock, Route } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

interface SafeRouteModalProps {
  onClose: () => void;
  onCalculate: (start: string, end: string) => void;
  safeRouteData: RouteImpactData | null;
  citySuggestions: string[];
  darkMode: boolean;
  lang: 'he' | 'en';
  layout?: 'overlay' | 'inline';
}

function formatDuration(hours: number, lang: 'he' | 'en'): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (lang === 'he') {
    if (h === 0) return `${m} דק'`;
    if (m === 0) return `${h} שע'`;
    return `${h} שע' ${m} דק'`;
  }
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function padH(n: number) { return String(n).padStart(2, '0'); }

const RANK_COLORS = [
  '#10b981','#22c55e','#34d399','#4ade80','#6ee7b7',
  '#86efac','#a7f3d0','#bbf7d0','#d1fae5','#ecfdf5',
  '#d4f1e9','#c6f0e1',
];
const RANK_BG = [
  'rgba(16,185,129,0.15)','rgba(34,197,94,0.12)',
  'rgba(52,211,153,0.10)','rgba(74,222,128,0.09)',
  'rgba(110,231,183,0.08)','rgba(134,239,172,0.07)',
  'rgba(167,243,208,0.06)','rgba(187,247,208,0.06)',
  'rgba(209,250,229,0.05)','rgba(236,253,245,0.05)',
  'rgba(212,241,233,0.05)','rgba(198,240,225,0.05)',
];

export const SafeRouteModal: React.FC<SafeRouteModalProps> = ({
  onClose,
  onCalculate,
  safeRouteData,
  citySuggestions,
  darkMode,
  lang,
  layout = 'overlay',
}) => {
  const [startCity, setStartCity] = useState('');
  const [endCity, setEndCity] = useState('');
  const [startMatches, setStartMatches] = useState<string[]>([]);
  const [endMatches, setEndMatches] = useState<string[]>([]);
  const [calcLoading, setCalcLoading] = useState(false);

  const isHe = lang === 'he';
  const isRtl = isHe;

  useEffect(() => {
    setStartMatches(startCity.length > 1
      ? citySuggestions.filter(c => c.includes(startCity)).slice(0, 6) : []);
  }, [startCity, citySuggestions]);

  useEffect(() => {
    setEndMatches(endCity.length > 1
      ? citySuggestions.filter(c => c.includes(endCity)).slice(0, 6) : []);
  }, [endCity, citySuggestions]);

  const handleCalculate = async () => {
    if (!startCity || !endCity) return;
    setCalcLoading(true);
    await onCalculate(startCity, endCity);
    setCalcLoading(false);
  };

  const chartOptions = safeRouteData ? {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const v = params[0];
        return `${v.name}<br/>${isHe ? 'התרעות' : 'Alerts'}: <b>${v.value}</b>`;
      },
    },
    grid: { left: '2%', right: '2%', bottom: '8%', top: '8%', containLabel: true },
    xAxis: {
      type: 'category',
      data: safeRouteData.hourlyRisk.map(h => `${h.hour}:00`),
      axisLabel: { color: darkMode ? '#94a3b8' : '#64748b', fontSize: 8, interval: 3 },
      axisLine: { lineStyle: { color: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: darkMode ? '#94a3b8' : '#64748b', fontSize: 8 },
      splitLine: { lineStyle: { color: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' } },
    },
    series: [{
      type: 'bar', barMaxWidth: 14,
      data: safeRouteData.hourlyRisk.map(h => {
        const rank = safeRouteData.top5SafestHours.find(t => t.hour === h.hour);
        const isRisky = h.hour === safeRouteData.riskiestHour;
        const color = rank ? RANK_COLORS[rank.rank - 1]
          : isRisky ? '#ef4444'
          : (darkMode ? '#3b82f6' : '#0038B8');
        return {
          value: h.count,
          itemStyle: {
            color,
            borderRadius: [5, 5, 0, 0],
            opacity: rank ? 1 : isRisky ? 0.85 : 0.4,
            shadowBlur: rank ? (rank.rank === 1 ? 10 : 6) : isRisky ? 8 : 0,
            shadowColor: rank ? RANK_COLORS[rank.rank - 1] + '99'
              : isRisky ? 'rgba(239,68,68,0.5)' : 'transparent',
            shadowOffsetY: -1,
          },
        };
      }),
    }],
  } : {};

  // ─── JSX blocks (NOT inner components — avoids unmount/remount on state change) ──

  const headerJsx = (
    <div className={`flex-shrink-0 px-5 py-3 flex items-center justify-between border-b ${darkMode ? 'bg-slate-900/95 border-white/10' : 'bg-white/95 border-slate-200'}`}>
      <div className="flex items-center gap-3">
        <div className="bg-emerald-500/20 p-2 rounded-xl">
          <Navigation size={18} className="text-emerald-400 animate-pulse" />
        </div>
        <div>
          <h2 className={`text-sm font-black ${darkMode ? 'text-white' : 'text-slate-800'}`}>
            {isHe ? 'תכנון נסיעה בטוחה' : 'Safe Route Planner'}
          </h2>
          <p className={`text-[9px] font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            {isHe ? 'ניתוח סטטיסטי היסטורי' : 'Historical statistical analysis'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <div className="relative group/info">
          <button className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-slate-400 hover:text-sky-400' : 'text-slate-400 hover:text-sky-600'}`}>
            <Info size={16} />
          </button>
          <div className={`absolute ${isRtl ? 'left-0' : 'right-0'} top-9 w-72 rounded-xl p-3 shadow-2xl z-50 border text-[10px] leading-relaxed pointer-events-none opacity-0 group-hover/info:opacity-100 transition-opacity duration-150 ${darkMode ? 'bg-slate-800 border-sky-500/30 text-sky-100' : 'bg-sky-50 border-sky-200 text-sky-900'}`}>
            <div className="flex items-center gap-1.5 mb-1.5 font-bold text-amber-400">
              <AlertTriangle size={12} />{isHe ? 'שימו לב' : 'Note'}
            </div>
            <ul className="space-y-1">
              <li>• {isHe ? 'נתונים סטטיסטיים היסטוריים בלבד.' : 'Historical statistics only.'}</li>
              <li>• {isHe ? 'מסלול כללי (רדיוס 15 ק"מ), לא כביש ספציפי.' : 'General corridor (15km radius), not a specific road.'}</li>
              <li>• {isHe ? 'אין התחשבות במידע בזמן אמת.' : 'No real-time data (events, holidays, targeted fire).'}</li>
            </ul>
          </div>
        </div>
        <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-slate-400 hover:text-red-400' : 'text-slate-400 hover:text-red-500'}`}>
          <X size={17} />
        </button>
      </div>
    </div>
  );

  const inputFormJsx = (
    <div className="flex flex-col gap-2.5">
      {/* Origin */}
      <div className="relative">
        <label className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 block ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          {isHe ? 'מוצא' : 'Origin'}
        </label>
        <input
          type="text"
          value={startCity}
          onChange={e => setStartCity(e.target.value)}
          placeholder={isHe ? "שם עיר..." : "City name..."}
          className={`w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all ${darkMode ? 'bg-slate-800 border-white/10 text-white placeholder:text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400'}`}
        />
        {startMatches.length > 0 && startCity !== startMatches[0] && (
          <ul className={`absolute top-full mt-1 left-0 right-0 rounded-lg shadow-xl z-50 overflow-hidden border ${darkMode ? 'bg-slate-800 border-white/10' : 'bg-white border-slate-200'}`}>
            {startMatches.map(m => (
              <li key={m} onClick={() => { setStartCity(m); setStartMatches([]); }}
                className={`px-3 py-1.5 text-sm cursor-pointer ${darkMode ? 'text-white hover:bg-emerald-500/20' : 'text-slate-700 hover:bg-emerald-50'}`}>
                {m}
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* Destination */}
      <div className="relative">
        <label className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 block ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          {isHe ? 'יעד' : 'Destination'}
        </label>
        <input
          type="text"
          value={endCity}
          onChange={e => setEndCity(e.target.value)}
          placeholder={isHe ? "שם עיר..." : "City name..."}
          className={`w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all ${darkMode ? 'bg-slate-800 border-white/10 text-white placeholder:text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400'}`}
        />
        {endMatches.length > 0 && endCity !== endMatches[0] && (
          <ul className={`absolute top-full mt-1 left-0 right-0 rounded-lg shadow-xl z-50 overflow-hidden border ${darkMode ? 'bg-slate-800 border-white/10' : 'bg-white border-slate-200'}`}>
            {endMatches.map(m => (
              <li key={m} onClick={() => { setEndCity(m); setEndMatches([]); }}
                className={`px-3 py-1.5 text-sm cursor-pointer ${darkMode ? 'text-white hover:bg-emerald-500/20' : 'text-slate-700 hover:bg-emerald-50'}`}>
                {m}
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* Calculate button */}
      <button
        onClick={handleCalculate}
        disabled={!startCity || !endCity || calcLoading}
        className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold shadow-md shadow-emerald-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2"
      >
        {calcLoading
          ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />{isHe ? 'מחשב...' : 'Calculating...'}</>
          : (isHe ? 'חשב מסלול בטוח' : 'Calculate Safe Route')
        }
      </button>
    </div>
  );

  const travelSummaryJsx = safeRouteData ? (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[10px] flex-shrink-0 border-b ${darkMode ? 'bg-slate-800/40 border-white/5 text-slate-400' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
      <span className="flex items-center gap-1">
        <Route size={11} className="text-emerald-400" />
        <b className={darkMode ? 'text-slate-200' : 'text-slate-700'}>{Math.round(safeRouteData.estimatedDistanceKm)} ק"מ</b>
        <span className="opacity-60">{safeRouteData.isRoadBased ? (isHe ? 'כביש' : 'road') : (isHe ? 'אומדן' : 'est.')}</span>
      </span>
      <span className="flex items-center gap-1">
        <Clock size={11} className="text-sky-400" />
        <b className={darkMode ? 'text-slate-200' : 'text-slate-700'}>~{formatDuration(safeRouteData.travelDurationHours, lang)}</b>
      </span>
      <span className="opacity-60">
        {safeRouteData.impactZoneCities.length} {isHe ? 'יישובים' : 'towns'} · {safeRouteData.totalAlerts.toLocaleString()} {isHe ? 'אזעקות' : 'alerts'}
      </span>
    </div>
  ) : null;

  const hoursListJsx = safeRouteData ? (
    <div className="flex flex-col gap-1.5">
      {safeRouteData.top5SafestHours.map(opt => (
        <div
          key={opt.hour}
          className="flex items-center gap-2 rounded-xl px-2.5 py-2 border"
          style={{ background: RANK_BG[opt.rank - 1], borderColor: RANK_COLORS[opt.rank - 1] + '33' }}
        >
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0"
            style={{ background: RANK_COLORS[opt.rank - 1] + '25', color: RANK_COLORS[opt.rank - 1] }}
          >
            {opt.rank === 1 ? <Star size={11} fill="currentColor" /> : opt.rank}
          </div>
          <div className="flex flex-col flex-shrink-0" style={{ width: '80px' }}>
            <span className="font-black tabular-nums text-sm leading-none" style={{ color: RANK_COLORS[opt.rank - 1] }}>
              {padH(opt.hour)}:00
            </span>
            <span className={`text-[9px] tabular-nums ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              → {padH(opt.arrivalHour)}:{padH(opt.arrivalMin)}
            </span>
          </div>
          <div className="flex-1 flex flex-col gap-0.5 min-w-0">
            <div className="flex justify-between">
              <span className={`text-[8px] ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{isHe ? 'שקט' : 'quiet'}</span>
              <span className="text-[9px] font-black" style={{ color: RANK_COLORS[opt.rank - 1] }}>{opt.quietProbability}%</span>
            </div>
            <div className={`h-1 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
              <div className="h-full rounded-full" style={{ width: `${opt.quietProbability}%`, background: RANK_COLORS[opt.rank - 1] }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  ) : null;

  const disclaimersJsx = safeRouteData ? (
    <div className="flex flex-col gap-1.5">
      {!safeRouteData.isRoadBased && (
        <div className={`rounded-lg p-2 border flex items-start gap-1.5 text-[9px] leading-relaxed ${darkMode ? 'bg-sky-500/5 border-sky-500/20 text-sky-200/70' : 'bg-sky-50 border-sky-200 text-sky-800'}`}>
          <Info size={11} className="mt-0.5 flex-shrink-0 text-sky-400" />
          <span>{isHe
            ? 'מסלול כביש לא זמין — חושב כקו ישר ×1.35. ניתוח ההסתברות דומה בגלל אופי האיומים (ירי ממזרח למערב, מצפון לדרום).'
            : 'Road route unavailable — estimated ×1.35. Analysis comparable since threats cover broad areas.'}</span>
        </div>
      )}
      <div className={`rounded-lg p-2 border flex items-start gap-1.5 text-[9px] leading-relaxed ${darkMode ? 'bg-amber-500/5 border-amber-500/20 text-amber-200/60' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
        <AlertTriangle size={11} className="mt-0.5 flex-shrink-0 text-amber-400" />
        <span>{isHe
          ? 'המלצה סטטיסטית בלבד. הפעל שיקול דעת ועקוב אחר הנחיות פיקוד העורף.'
          : 'Statistical only. Use judgment and follow HFC guidelines.'}</span>
      </div>
    </div>
  ) : null;

  // ═══════════════════════════════════════════════════════════
  // INLINE — desktop, replaces analytics area
  // ═══════════════════════════════════════════════════════════
  if (layout === 'inline') {
    return (
      <div
        className={`flex flex-col h-full w-full overflow-hidden ${darkMode ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}`}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {headerJsx}

        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* Left 2/3: inputs + chart */}
          <div className={`flex flex-col min-h-0 overflow-hidden border-e transition-all duration-300 ${safeRouteData ? 'flex-[2]' : 'flex-1'} ${darkMode ? 'border-white/10' : 'border-slate-200'}`}>

            <div className={`flex-shrink-0 p-4 border-b ${darkMode ? 'border-white/5' : 'border-slate-100'}`}>
              {inputFormJsx}
            </div>

            <AnimatePresence>
              {safeRouteData && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex-1 min-h-0 flex flex-col"
                >
                  {travelSummaryJsx}
                  <div className={`flex-1 min-h-0 m-3 rounded-xl border p-2 ${darkMode ? 'bg-slate-800/40 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                    <ReactECharts option={chartOptions} style={{ height: '100%', width: '100%' }} />
                  </div>
                  <div className={`text-[8px] text-center pb-2 flex-shrink-0 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                    {isHe ? 'ירוק = שעות יציאה בטוחות • אדום = שעה מסוכנת' : 'Green = safe departure hours • Red = riskiest hour'}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!safeRouteData && (
              <div className={`flex-1 flex items-center justify-center ${darkMode ? 'text-slate-600' : 'text-slate-300'}`}>
                <div className="text-center">
                  <Navigation size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium opacity-50">
                    {isHe ? 'הזן יעדים וחשב מסלול' : 'Enter cities and calculate'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right 1/3: hours list + disclaimers */}
          <AnimatePresence>
            {safeRouteData && (
              <motion.div
                initial={{ opacity: 0, x: isRtl ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: isRtl ? -20 : 20 }}
                transition={{ duration: 0.2 }}
                className="flex-1 flex flex-col min-h-0 overflow-hidden"
              >
                <div className={`flex-shrink-0 px-3 pt-3 pb-2 border-b ${darkMode ? 'border-white/5' : 'border-slate-100'}`}>
                  <p className={`text-[9px] font-black uppercase tracking-widest ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {isHe ? 'חלונות יציאה מומלצים' : 'Recommended Departures'}
                  </p>
                </div>
                {/* Only this section scrolls if list is too long */}
                <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
                  {hoursListJsx}
                </div>
                <div className={`flex-shrink-0 px-3 pb-3 pt-2 border-t ${darkMode ? 'border-white/5' : 'border-slate-100'}`}>
                  {disclaimersJsx}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // OVERLAY — mobile only (md:hidden)
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="md:hidden">
      <div
        className="fixed inset-0 z-[9998]"
        style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 30 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className={`fixed z-[9999] inset-x-3 top-4 bottom-4 overflow-hidden rounded-2xl shadow-2xl flex flex-col ${darkMode ? 'bg-slate-900 border border-white/10' : 'bg-white border border-slate-200'}`}
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {headerJsx}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 flex flex-col gap-4">
            {inputFormJsx}
            <AnimatePresence>
              {safeRouteData && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
                  {travelSummaryJsx}
                  <div>
                    <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {isHe ? 'חלונות יציאה מומלצים' : 'Recommended Departures'}
                    </p>
                    {hoursListJsx}
                  </div>
                  <div className={`rounded-xl border p-2 ${darkMode ? 'bg-slate-800/40 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                    <div className="h-40 w-full">
                      <ReactECharts option={chartOptions} style={{ height: '100%', width: '100%' }} />
                    </div>
                    <div className={`text-[8px] text-center mt-1 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                      {isHe ? 'ירוק = שעות בטוחות • אדום = מסוכן' : 'Green = safe • Red = risky'}
                    </div>
                  </div>
                  {disclaimersJsx}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
