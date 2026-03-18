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
const daysHe = ['Î¿ÎÉÎ®ÎòÎƒ', 'Î®ÎáÎÖ', 'Î®Î£ÎÖÎ®ÎÖ', 'Î¿ÎæÎÖÎóÎÖ', 'ÎùÎ×ÎÖÎ®ÎÖ', 'Î®ÎÖÎ®ÎÖ', 'Î®ÎæÎ¬'];
const daysEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const translations = {
  he: {
    title: "Î×ÎÆÎƒ ÎÖÎ®Î¿ÎÉÎ£ | ÎôÎ®ÎæÎòÎ¿Îô ÎùÎºÎ¿ ÎáÎ¬ÎòÎáÎÖÎØ",
    search: "ÎùÎÖÎñÎòÎ® ÎóÎÖÎ¿/ÎÉÎûÎòÎ¿:",
    threat: "ÎíÎòÎÆ ÎÉÎÖÎòÎØ:",
    source: "Î×ÎºÎòÎ¿ ÎÉÎÖÎòÎØ:",
    operation: "Î×ÎóÎ¿ÎøÎö:",
    all: "ÎöÎøÎ£",
    loading: "ÎÿÎòÎóÎƒ ÎáÎ¬ÎòÎáÎÖÎØ...",
    totalAlerts: "ÎíÎö\"Îø ÎöÎ¬Î¿ÎóÎòÎ¬ ÎæÎ×ÎÉÎÆÎ¿",
    smartInsight: "Î¬ÎòÎæÎáÎö ÎíÎÿÎÿÎÖÎíÎÿÎÖÎ¬ ÎùÎøÎ×Îö ­ƒÄ»",
    lastAlert: "ÎûÎ×Îƒ ÎöÎ¬Î¿ÎóÎö ÎÉÎùÎ¿ÎòÎáÎö",
    mapTitle: "Î×ÎñÎ¬ Î×ÎòÎºÎôÎÖÎØ",
    liveAlert: "ÎªÎæÎó ÎÉÎôÎòÎØ",
    tickerTitle: "Î×ÎæÎûÎº ÎöÎ¬Î¿ÎóÎòÎ¬",
    timeSeries: "ÎöÎ¬ÎñÎ£ÎÆÎòÎ¬ ÎöÎ¬Î¿ÎóÎòÎ¬ Î£ÎÉÎòÎ¿ÎÜ ÎûÎ×Îƒ",
    topCities: "ÎöÎÖÎÖÎ®ÎòÎæÎÖÎØ ÎöÎ×ÎòÎ¬ÎºÎñÎÖÎØ ÎæÎÖÎòÎ¬Î¿ (Top 15)",
    threatDist: "ÎöÎ¬ÎñÎ£ÎÆÎòÎ¬ ÎíÎòÎÆÎÖ ÎÉÎÖÎòÎØ",
    sourceDist: "Î×ÎºÎòÎ¿ ÎÉÎÖÎòÎØ",
    years: "Î®ÎáÎÖÎØ",
    months: "ÎùÎòÎôÎ®ÎÖÎØ",
    days: "ÎÖÎ×ÎÖÎØ",
    hours: "Î®ÎóÎòÎ¬",
    minutes: "ÎôÎºÎòÎ¬",
    satellite: "Î£ÎòÎòÎÖÎÖÎƒ",
    streets: "Î¿ÎùÎòÎæÎòÎ¬",
    compare: "Î×ÎªÎæ ÎöÎ®ÎòÎòÎÉÎö",
    showerIndex: "Î×ÎôÎô ÎöÎ×ÎºÎ£ÎùÎ¬ ­ƒÜ┐",
    showerDesc: "ÎöÎûÎ×Îƒ ÎöÎæÎÿÎòÎù ÎæÎÖÎòÎ¬Î¿ Î£Î×ÎºÎ£ÎùÎ¬ Î®ÎºÎÿÎö",
    generate: "ÎÖÎÖÎªÎ¿ Î¬ÎòÎæÎáÎòÎ¬",
    generating: "Î×ÎáÎ¬Îù ÎáÎ¬ÎòÎáÎÖÎØ...",
    noData: "ÎÉÎÖÎƒ ÎáÎ¬ÎòÎáÎÖÎØ Î£ÎöÎªÎÆÎö",
    warningTime: "ÎûÎ×Îƒ ÎöÎ¬ÎÆÎòÎáÎáÎòÎ¬ (Î®ÎáÎÖÎòÎ¬)",
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
    smartInsight: "Smart Statistical Insight ­ƒÄ»",
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
    showerIndex: "Shower Index ­ƒÜ┐",
    showerDesc: "Safest time for a quiet shower",
    generate: "Generate Insights",
    generating: "Analyzing data...",
    noData: "No data to display",
    warningTime: "Warning Time (Seconds)",
  }
};

const threatDict: Record<string, string> = {
  "0": "ÎÖÎ¿ÎÖ Î¿ÎºÎÿÎòÎ¬ ÎòÎÿÎÖÎ£ÎÖÎØ",
  "1": "ÎÖÎ¿ÎÖ Î¿ÎºÎÿÎòÎ¬ ÎòÎÿÎÖÎ£ÎÖÎØ",
  "2": "ÎùÎôÎÖÎ¿Î¬ ÎøÎ£ÎÖ ÎÿÎÖÎí ÎóÎòÎÖÎƒ",
  "3": "Î¿ÎóÎÖÎôÎ¬ ÎÉÎôÎ×Îö",
  "4": "ÎÉÎÖÎ¿ÎòÎó Î¿ÎôÎÖÎòÎ£ÎòÎÆÎÖ",
  "5": "ÎùÎôÎÖÎ¿Î¬ Î×ÎùÎæÎ£ÎÖÎØ",
  "6": "ÎªÎòÎáÎÉÎ×ÎÖ",
  "7": "ÎÉÎÖÎ¿ÎòÎó ÎùÎòÎ×Î¿ÎÖÎØ Î×ÎíÎòÎøÎáÎÖÎØ",
  "8": "ÎÉÎÖÎ¿ÎòÎó Î£ÎÉ ÎºÎòÎáÎæÎáÎªÎÖÎòÎáÎ£ÎÖ"
};

const operationsDict = [
  { name: "ÎùÎÆÎòÎ¿Îö Î®ÎùÎòÎ¿Îö (2019)", start: new Date("2019-11-12"), end: new Date("2019-11-14T23:59:59") },
  { name: "Î®ÎòÎ×Î¿ ÎöÎùÎòÎ×ÎòÎ¬ (2021)", start: new Date("2021-05-10"), end: new Date("2021-05-21T23:59:59") },
  { name: "ÎóÎ£ÎòÎ¬ ÎöÎ®ÎùÎ¿ (2022)", start: new Date("2022-08-05"), end: new Date("2022-08-07T23:59:59") },
  { name: "Î×ÎÆÎƒ ÎòÎùÎÑ (2023)", start: new Date("2023-05-09"), end: new Date("2023-05-13T23:59:59") },
  { name: "Î×Î£ÎùÎ×Î¬ ÎùÎ¿ÎæÎòÎ¬ ÎæÎ¿ÎûÎ£ (2023+)", start: new Date("2023-10-07"), end: new Date("2099-12-31T23:59:59") },
  { name: "Î×Î¬ÎºÎñÎ¬ ÎÉÎñÎ¿ÎÖÎ£ (ÎÉÎÖÎ¿ÎÉÎƒ 2024)", start: new Date("2024-04-13"), end: new Date("2024-04-14T23:59:59") },
  { name: "Î×Î¬ÎºÎñÎ¬ ÎÉÎòÎºÎÿÎòÎæÎ¿ (ÎÉÎÖÎ¿ÎÉÎƒ 2024)", start: new Date("2024-10-01"), end: new Date("2024-10-01T23:59:59") },
  { name: "ÎÖÎ×ÎÖ Î¬Î®ÎòÎæÎö (ÎÉÎÖÎ¿ÎÉÎƒ 2024)", start: new Date("2024-10-26"), end: new Date("2024-10-27T23:59:59") },
  { name: "ÎóÎØ ÎøÎ£ÎæÎÖÎÉ (ÎÉÎÖÎ¿ÎÉÎƒ 2025)", start: new Date("2025-06-13"), end: new Date("2025-06-24T23:59:59") },
  { name: "ÎøÎÉÎ¿ÎÖ ÎÖÎ®ÎÉÎÆ / Î®ÎÉÎÆÎ¬ ÎöÎÉÎ¿ÎÖ (ÎÉÎÖÎ¿ÎÉÎƒ 2026)", start: new Date("2026-02-28"), end: new Date("2026-03-31T23:59:59") }
];

const baseCoords: Record<string, [number, number]> = {
  // ÎóÎòÎÿÎú ÎóÎûÎö ÎòÎôÎ¿ÎòÎØ
  "Î®ÎôÎ¿ÎòÎ¬": [31.5282, 34.5956], "ÎÉÎ®ÎºÎ£ÎòÎƒ": [31.6693, 34.5715], "ÎáÎ¬ÎÖÎæÎòÎ¬": [31.4167, 34.5833], "ÎÉÎòÎñÎºÎÖÎØ": [31.3167, 34.6167],
  "ÎæÎÉÎ¿ Î®ÎæÎó": [31.2518, 34.7913], "ÎÉÎ®ÎôÎòÎô": [31.7915, 34.6394], "ÎÉÎÖÎ£Î¬": [29.5577, 34.9519],
  "ÎøÎñÎ¿ ÎóÎûÎö": [31.4744, 34.5386], "ÎæÎÉÎ¿ÎÖ": [31.4244, 34.4953], "ÎáÎùÎ£ ÎóÎòÎû": [31.4700, 34.4969], "Î×ÎñÎ£ÎíÎÖÎØ": [31.5036, 34.5606],
  "ÎáÎÖÎ¿ ÎóÎòÎû": [31.3106, 34.3942], "ÎáÎÖÎ¿ÎÖÎØ": [31.3322, 34.3944], "ÎóÎÖÎƒ ÎöÎ®Î£ÎòÎ®Îö": [31.3522, 34.3944], "ÎøÎÖÎíÎòÎñÎÖÎØ": [31.3756, 34.3958],
  "ÎøÎ¿ÎØ Î®Î£ÎòÎØ": [31.2269, 34.2858], "ÎûÎÖÎºÎÖÎØ": [31.6033, 34.5158], "ÎøÎ¿Î×ÎÖÎö": [31.5942, 34.5458], "ÎÖÎô Î×Î¿ÎôÎøÎÖ": [31.5861, 34.5572],
  "ÎáÎ¬ÎÖÎæ ÎöÎóÎ®Î¿Îö": [31.5961, 34.5472], "ÎíÎóÎô": [31.4731, 34.5369], "ÎóÎ£ÎòÎ×ÎÖÎØ": [31.4489, 34.5264], "Î¿ÎóÎÖÎØ": [31.3853, 34.4594],
  "Î×ÎÆÎƒ": [31.3000, 34.4333], "ÎáÎÖÎ¿ ÎÖÎªÎùÎº": [31.2411, 34.3547], "ÎíÎòÎñÎö": [31.2386, 34.3417], "ÎùÎòÎ£ÎÖÎ¬": [31.2403, 34.3167],
  "Î®ÎôÎ¿ÎòÎ¬ ÎÉÎÖÎæÎÖÎØ ÎòÎáÎÖÎ¿ ÎóÎØ": [31.5282, 34.5956],
  
  // ÎªÎñÎòÎƒ ÎòÎºÎò ÎóÎÖÎ×ÎòÎ¬
  "ÎºÎ¿ÎÖÎ¬ Î®Î×ÎòÎáÎö": [33.2073, 35.5694], "Î×ÎÿÎòÎ£Îö": [33.2801, 35.5786], "ÎªÎñÎ¬": [32.9646, 35.4960], "ÎáÎöÎ¿ÎÖÎö": [33.0151, 35.0941],
  "ÎùÎÖÎñÎö": [32.7940, 34.9896], "ÎóÎøÎò": [32.9271, 35.0754], "ÎøÎ¿Î×ÎÖÎÉÎ£": [32.9167, 35.2953], "ÎÿÎæÎ¿ÎÖÎö": [32.7944, 35.5333],
  "ÎºÎªÎ¿ÎÖÎƒ": [32.9922, 35.6917], "Î®Î£ÎòÎ×ÎÖ": [33.0744, 35.1436], "Î×Î¿ÎÆÎ£ÎÖÎòÎ¬": [33.2206, 35.5489], "Î×Î®ÎÆÎæ ÎóÎØ": [33.2506, 35.5489],
  "ÎÖÎñÎ¬Îù": [33.1119, 35.5564], "Î×ÎáÎ¿Îö": [33.1969, 35.5414], "ÎóÎ¿Îæ ÎÉÎ£ ÎóÎ¿ÎÉÎ×Î®Îö": [33.0906, 35.1953], "ÎûÎ¿ÎóÎÖÎ¬": [33.0844, 35.2750],
  "Î®Î¬ÎòÎ£Îö": [33.0781, 35.3119], "ÎáÎÿÎòÎóÎö": [33.0644, 35.3503], "Î×Î¬Î¬": [33.0458, 35.3400], "ÎíÎÉÎíÎÉ": [33.0286, 35.3942],
  "ÎæÎ¿ÎóÎØ": [33.0583, 35.4333], "ÎÖÎ¿ÎÉÎòÎƒ": [33.0758, 35.4544], "ÎÉÎæÎÖÎæÎÖÎØ": [33.0933, 35.4644], "ÎôÎòÎæÎæ": [33.0519, 35.3975],
  "Î×Î£ÎøÎÖÎö": [33.0967, 35.5122], "Î¿ÎÉÎ® ÎñÎÖÎáÎö": [32.9697, 35.5414], "ÎºÎ¿ÎÖÎ¬ Î×ÎòÎªÎºÎÖÎƒ": [32.8333, 35.0833], "ÎºÎ¿ÎÖÎ¬ ÎæÎÖÎÉÎ£ÎÖÎº": [32.8333, 35.0833],
  "ÎùÎòÎ¿ÎñÎÖÎ®": [33.0167, 35.3500], "Î×ÎóÎ£ÎòÎ¬ Î¬Î¿Î®ÎÖÎùÎÉ": [33.0167, 35.2667], "Î×ÎÆ'ÎôÎ£ Î®Î×Îí": [33.2667, 35.7667], "Î¿ÎÉÎÆ'Î¿": [33.2750, 35.6219],

  // ÎÉÎûÎòÎ¿ÎÖÎØ ÎøÎ£Î£ÎÖÎÖÎØ
  "ÎóÎòÎÿÎú ÎóÎûÎö": [31.4200, 34.4500], "ÎÆÎ£ÎÖÎ£ ÎóÎ£ÎÖÎòÎƒ": [33.0500, 35.5000], "ÎÆÎ£ÎÖÎ£ Î×ÎóÎ¿ÎæÎÖ": [33.0300, 35.2000],
  "ÎÆÎòÎ£Îƒ": [33.1000, 35.7000], "ÎöÎóÎ×ÎºÎÖÎØ": [32.6000, 35.3000], "Î®Î¿ÎòÎƒ": [32.2500, 34.9000], 
  "ÎôÎƒ": [32.0800, 34.7800], "Î®ÎñÎ£Îö": [31.9000, 34.8500], "Î£ÎøÎÖÎ®": [31.5500, 34.7000], "ÎáÎÆÎæ": [31.2000, 34.8000],

  // Î×Î¿ÎøÎû
  "Î¬Î£ ÎÉÎæÎÖÎæ": [32.0853, 34.7818], "Î¬Î£ ÎÉÎæÎÖÎæ - ÎÖÎñÎò": [32.0853, 34.7818], "ÎÖÎ¿ÎòÎ®Î£ÎÖÎØ": [31.7683, 35.2137], "Î¿ÎÉÎ®ÎòÎƒ Î£ÎªÎÖÎòÎƒ": [31.9730, 34.7925], 
  "ÎñÎ¬Îù Î¬ÎºÎòÎòÎö": [32.0833, 34.8833], "ÎùÎòÎ£ÎòÎƒ": [32.0167, 34.7667], "ÎæÎ¬ ÎÖÎØ": [32.0167, 34.7333], "Î¿Î×Î¬ ÎÆÎƒ": [32.0833, 34.8167],
  "ÎöÎ¿ÎªÎ£ÎÖÎö": [32.1667, 34.8333], "ÎáÎ¬ÎáÎÖÎö": [32.3329, 34.8599], "ÎùÎôÎ¿Îö": [32.4333, 34.9167], "Î¿ÎóÎáÎáÎö": [32.1833, 34.8667],
  "ÎøÎñÎ¿ ÎíÎæÎÉ": [32.1750, 34.9069], "ÎöÎòÎô ÎöÎ®Î¿ÎòÎƒ": [32.1500, 34.8833], "Î×ÎòÎôÎÖÎóÎÖÎƒ": [31.8969, 35.0086], "Î¿ÎùÎòÎæÎòÎ¬": [31.8944, 34.8119],
  "ÎæÎÖÎ¬ Î®Î×Î®": [31.7456, 34.9867], "Î£ÎòÎô": [31.9511, 34.8881], "Î¿Î×Î£Îö": [31.9272, 34.8625], "ÎºÎ¿ÎÖÎ¬ ÎÆÎ¬": [31.6081, 34.7644],
  "ÎºÎ¿ÎÖÎ¬ Î×Î£ÎÉÎøÎÖ": [31.7275, 34.7447], "ÎæÎáÎÖ ÎæÎ¿Îº": [32.0833, 34.8333], "ÎÆÎæÎóÎ¬ÎÖÎÖÎØ": [32.0722, 34.8125],
  "Î¿Î×Î¬ ÎöÎ®Î¿ÎòÎƒ": [32.1397, 34.8397], "ÎáÎí ÎªÎÖÎòÎáÎö": [31.9281, 34.7981], "ÎÖÎæÎáÎö": [31.8778, 34.7394],
  "ÎÆÎôÎ¿Îö": [31.8119, 34.7778], "Î×ÎûÎøÎ¿Î¬ ÎæÎ¬ÎÖÎö": [31.8539, 34.8433], "ÎÆÎƒ ÎÖÎæÎáÎö": [31.7856, 34.6942], 
  "ÎóÎ¿Îô": [31.2608, 35.2125], "ÎôÎÖÎ×ÎòÎáÎö": [31.0667, 35.0333], "ÎÖÎ¿ÎòÎùÎØ": [30.9881, 34.9303], "Î×ÎªÎñÎö Î¿Î×ÎòÎƒ": [30.6083, 34.8028],
  "ÎíÎù'ÎáÎÖÎƒ": [32.8614, 35.3031], "Î®ÎñÎ¿ÎóÎØ": [32.8053, 35.1706], "ÎÿÎ×Î¿Îö": [32.8536, 35.2014], "ÎáÎªÎ¿Î¬": [32.7019, 35.3033],
  "ÎáÎòÎú ÎöÎÆÎ£ÎÖÎ£": [32.7, 35.31], "ÎóÎñÎòÎ£Îö": [32.6078, 35.2892], "Î×ÎÆÎôÎ£ ÎöÎóÎ×Îº": [32.6733, 35.2417], "ÎæÎÖÎ¬ Î®ÎÉÎƒ": [32.4972, 35.4972],
  "ÎÉÎòÎØ ÎÉÎ£-ÎñÎùÎØ": [32.5167, 35.1500], "ÎÿÎÖÎÖÎæÎö": [32.2667, 35.0167], "ÎºÎ£ÎáÎíÎòÎòÎö": [32.2833, 35.0333], "ÎæÎÉÎºÎö ÎÉÎ£-ÎÆÎ¿ÎæÎÖÎö": [32.4167, 35.0333],
  "Î×Î¿ÎùÎæ ÎôÎƒ": [32.0800, 34.7800], "Î×Î¿ÎùÎæ ÎÖÎ¿ÎºÎòÎƒ": [32.1000, 34.8500], "Î×Î¿ÎùÎæ Î£ÎøÎÖÎ®": [31.6000, 34.7500], "Î×Î¿ÎùÎæ Î®ÎñÎ£Îö": [31.9000, 34.8500],
  "Î×Î¿ÎùÎæ ÎáÎÆÎæ": [31.2000, 34.8000], "Î×Î¿ÎùÎæ ÎùÎÖÎñÎö": [32.8000, 34.9900], "Î×Î¿ÎùÎæ ÎÉÎ®Î¿": [32.9500, 35.1000], "Î×Î¿ÎùÎæ ÎóÎ×ÎºÎÖÎØ": [32.6000, 35.3000],
  "Î×Î¿ÎùÎæ ÎÆÎ£ÎÖÎ£": [33.0000, 35.4000], "Î×Î¿ÎùÎæ ÎÆÎòÎ£Îƒ": [33.1000, 35.7000], "Î×Î¿ÎùÎæ ÎÖÎöÎòÎôÎö": [31.5000, 35.0500], "Î×Î¿ÎùÎæ Î®ÎòÎ×Î¿ÎòÎƒ": [32.2000, 35.2000],
  "Î×Î¿ÎùÎæ ÎÉÎÖÎ£Î¬": [29.5577, 34.9519], "ÎÉÎ£ÎòÎáÎÖ ÎöÎæÎ®Îƒ": [33.0444, 35.8361], "ÎºÎ®Î¬": [33.0000, 35.8000], "ÎáÎÿÎòÎ¿": [32.8500, 35.7500],
  "ÎùÎíÎñÎÖÎƒ": [32.8200, 35.7700], "Î×ÎæÎòÎÉ ÎùÎ×Îö": [32.7300, 35.6500], "ÎóÎÖÎƒ ÎÆÎæ": [32.8100, 35.6400], "ÎøÎáÎ¿Î¬": [32.7200, 35.5800],
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
  if (normalized.includes("Î®ÎôÎ¿ÎòÎ¬") || normalized.includes("ÎóÎòÎÿÎú ÎóÎûÎö") || normalized.includes("ÎáÎ¬ÎÖÎæ ÎöÎóÎ®Î¿Îö")) return "15 Î®ÎáÎÖÎòÎ¬";
  if (normalized.includes("ÎÉÎ®ÎºÎ£ÎòÎƒ") || normalized.includes("ÎáÎ¬ÎÖÎæÎòÎ¬") || normalized.includes("ÎûÎÖÎºÎÖÎØ")) return "30 Î®ÎáÎÖÎòÎ¬";
  if (normalized.includes("ÎÉÎ®ÎôÎòÎô") || normalized.includes("ÎæÎÉÎ¿ Î®ÎæÎó") || normalized.includes("ÎÆÎƒ ÎÖÎæÎáÎö")) return "45-60 Î®ÎáÎÖÎòÎ¬";
  if (normalized.includes("Î¬Î£ ÎÉÎæÎÖÎæ") || normalized.includes("ÎÖÎ¿ÎòÎ®Î£ÎÖÎØ") || normalized.includes("Î¿Î×Î¬ ÎÆÎƒ")) return "90 Î®ÎáÎÖÎòÎ¬";
  if (normalized.includes("ÎùÎÖÎñÎö") || normalized.includes("ÎºÎ¿ÎÖÎòÎ¬")) return "60 Î®ÎáÎÖÎòÎ¬";
  return "ÎôÎºÎö ÎòÎùÎªÎÖ";
};

const customTooltipPosition = (point: any, params: any, dom: any, rect: any, size: any) => {
  const obj: any = { top: 10 };
  obj[['left', 'right'][+(point[0] < size.viewSize[0] / 2)]] = 5;
  return obj;
};

const getGroupedData = (data: any[], res: string) => {
  const grouped: Record<string, number> = {};
  data.forEach(d => {
    let key = "";
    if (res === 'year') key = d.year;
    else if (res === 'month') key = d.month;
    else if (res === 'weekday') key = daysHe[d.dayOfWeek];
    else if (res === 'hour') key = String(d.hour).padStart(2, '0') + ":00";
    else if (res === 'minute') key = String(d.hour).padStart(2, '0') + ":" + String(Math.floor(d.dateObj.getMinutes()/10)*10).padStart(2, '0');
    grouped[key] = (grouped[key] || 0) + 1;
  });
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
            {selected.includes('all') ? label : `${selected.length} ${isRtl ? 'ÎáÎæÎùÎ¿Îò' : 'Selected'}`}
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
              className={`absolute top-full mt-2 ${isRtl ? 'right-0' : 'left-0'} glass-card z-50 p-2 min-w-[220px] max-h-[300px] overflow-y-auto shadow-2xl border border-white/10 backdrop-blur-3xl`}
            >
              <div 
                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors ${selected.includes('all') ? 'text-primary-azure bg-white/5' : 'text-white/70'}`}
                onClick={() => { toggle('all'); setIsOpen(false); }}
              >
                <span className="text-xs font-black uppercase tracking-widest">{isRtl ? 'ÎöÎøÎ£' : 'ALL'}</span>
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
  const [timeResolution, setTimeResolution] = useState<'year' | 'month' | 'weekday' | 'hour' | 'minute'>('month');

  // New Features State
  const [darkMode, setDarkMode] = useState(false);
  const [lang, setLang] = useState<'he' | 'en'>('he');
  const [mapLayer, setMapLayer] = useState<'streets' | 'satellite'>('streets');
  const [compareMode, setCompareMode] = useState(false);
  const [compareOperation, setCompareOperation] = useState<string[]>(['all']);
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

  const operationOptions = useMemo(() => [...operationsDict.map(op => op.name), "Î®ÎÆÎ¿Îö (Î£Î£ÎÉ Î×ÎóÎ¿ÎøÎö)"], []);
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
    return matchedOps.length > 0 ? matchedOps : ["Î®ÎÆÎ¿Îö (Î£Î£ÎÉ Î×ÎóÎ¿ÎøÎö)"];
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

  const handleCitySearchChange = (val: string, source: 'desktop' | 'mobile') => {
    setCitySearch(val);
    setActiveSearchSource(source);
    if (val.trim().length > 0) {
      const filtered = allCities.filter(c => c.toLowerCase().includes(val.toLowerCase())).slice(0, 10);
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
          setLoadingStatus(lang === 'he' ? "ÎÿÎòÎóÎƒ Î×ÎöÎ×ÎÿÎ×ÎòÎƒ (Î×ÎöÎÖÎ¿)..." : "Loading from cache (fast)...");
          setGlobalData(cached.data);
          setFilteredData(cached.data);
          setLoading(false);
          return;
        }

        // 3. Fallback to download if cache miss or outdated
        console.log("Cache miss or outdated. Downloading CSV...");
        setLoadingStatus(lang === 'he' ? "Î×ÎòÎ¿ÎÖÎô ÎáÎ¬ÎòÎáÎÖÎØ Î×-GitHub..." : "Downloading data from GitHub...");
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
              let extractedSource = "Î×ÎóÎòÎ¿Îæ / Î£ÎÉ ÎíÎòÎòÎÆ";
              
              if (rawStr.includes("ÎÉÎÖÎ¿ÎÉÎƒ") || rawStr.includes("iran")) extractedSource = "ÎÉÎÖÎ¿ÎÉÎƒ";
              else if (rawStr.includes("Î¬ÎÖÎ×Îƒ") || rawStr.includes("yemen") || rawStr.includes("ÎùÎòÎ¬'ÎÖÎØ")) extractedSource = "Î¬ÎÖÎ×Îƒ";
              else if (rawStr.includes("ÎóÎÖÎ¿ÎÉÎº") || rawStr.includes("iraq")) extractedSource = "ÎóÎÖÎ¿ÎÉÎº";
              else if (rawStr.includes("ÎíÎòÎ¿ÎÖÎö") || rawStr.includes("syria")) extractedSource = "ÎíÎòÎ¿ÎÖÎö";
              else if (rawStr.includes("Î£ÎæÎáÎòÎƒ") || rawStr.includes("lebanon") || rawStr.includes("ÎùÎÖÎûÎæÎÉÎ£Î£Îö")) extractedSource = "Î£ÎæÎáÎòÎƒ";
              else if (rawStr.includes("ÎóÎûÎö") || rawStr.includes("gaza") || rawStr.includes("ÎùÎ×ÎÉÎí") || rawStr.includes("ÎÆ'ÎÖÎöÎÉÎô")) extractedSource = "Î¿ÎªÎòÎóÎ¬ ÎóÎûÎö";
              else if (opsArray.some(op => op.includes("ÎÉÎÖÎ¿ÎÉÎƒ"))) {
                if (city.includes("ÎºÎ¿ÎÖÎ¬ Î®Î×ÎòÎáÎö") || city.includes("Î×ÎÿÎòÎ£Îö")) extractedSource = "Î£ÎæÎáÎòÎƒ";
                else extractedSource = "ÎÉÎÖÎ¿ÎÉÎƒ";
              } else {
                if (city.includes("Î®ÎôÎ¿ÎòÎ¬") || city.includes("ÎÉÎ®ÎºÎ£ÎòÎƒ") || city.includes("ÎóÎòÎÿÎú")) extractedSource = "Î¿ÎªÎòÎóÎ¬ ÎóÎûÎö";
                else if (city.includes("ÎºÎ¿ÎÖÎ¬ Î®Î×ÎòÎáÎö") || city.includes("Î×ÎÿÎòÎ£Îö") || city.includes("ÎªÎñÎ¬")) extractedSource = "Î£ÎæÎáÎòÎƒ";
                else if (city.includes("ÎÉÎÖÎ£Î¬")) extractedSource = "Î¬ÎÖÎ×Îƒ / ÎóÎÖÎ¿ÎÉÎº";
              }

              let rawThreatVal = String(d.threat || d.category || '').trim();
              let extractedThreat = threatDict[rawThreatVal] || rawThreatVal || 'ÎÉÎùÎ¿';
              if (rawStr.includes("ÎøÎ£ÎÖ ÎÿÎÖÎí") || rawStr.includes("ÎøÎÿÎæ\"Î×")) extractedThreat = "ÎùÎôÎÖÎ¿Î¬ ÎøÎ£ÎÖ ÎÿÎÖÎí ÎóÎòÎÖÎƒ";
              else if (rawStr.includes("Î×ÎùÎæÎ£ÎÖÎØ")) extractedThreat = "ÎùÎôÎÖÎ¿Î¬ Î×ÎùÎæÎ£ÎÖÎØ";
              else if (rawStr.includes("ÎùÎòÎ×Î¿ÎÖÎØ Î×ÎíÎòÎøÎáÎÖÎØ")) extractedThreat = "ÎÉÎÖÎ¿ÎòÎó ÎùÎòÎ×Î¿ÎÖÎØ Î×ÎíÎòÎøÎáÎÖÎØ";
              else if (rawStr.includes("Î¿ÎºÎÿÎòÎ¬") || rawStr.includes("ÎÿÎÖÎ£ÎÖÎØ")) extractedThreat = "ÎÖÎ¿ÎÖ Î¿ÎºÎÿÎòÎ¬ ÎòÎÿÎÖÎ£ÎÖÎØ";

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
                  setLiveAlert({ cities: alertData.data.join(', '), title: alertData.title || 'ÎöÎ¬Î¿ÎóÎö' });
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
        
        const dThreat = d.threatStr || 'ÎÉÎùÎ¿';
        const dSource = d.sourceStr || 'Î×ÎóÎòÎ¿Îæ / Î£ÎÉ ÎíÎòÎòÎÆ';
        const dOps = d.operationsArray || ['Î®ÎÆÎ¿Îö'];

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
      if (filtered.length !== filteredData.length || (filtered.length > 0 && filteredData.length > 0 && filtered[0] !== filteredData[0])) {
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
          .bindTooltip(`<b>${city}</b><br>${lang === 'he' ? 'ÎöÎ¬Î¿ÎóÎòÎ¬' : 'Alerts'}: ${cityCounts[city].toLocaleString()}`, { direction: 'top' });
        markersRef.current.push(marker);
      } else if (!geoCache.current.hasOwnProperty(city)) {
        queue.push({ city, count: cityCounts[city] });
      }
    }

    if (queue.length > 0) {
      const processQueue = async () => {
        setGeocodingStatus("Î×ÎÉÎ¬Î¿ Î×ÎÖÎºÎòÎ×ÎÖÎØ...");
        // Limit geocoding to prevent long 'stuck' processes
        const limit = 20;
        const toProcess = queue.slice(0, limit);
        
        for (let i = 0; i < toProcess.length; i++) {
          if (isCancelled) break;
          const item = toProcess[i];
          const cleanName = item.city.replace(/[0-9]/g, '').replace('Î×Î¿ÎùÎæ', '').split('-')[0].trim();
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanName)}, ÎÖÎ®Î¿ÎÉÎ£`);
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
          if (!isCancelled) setGeocodingStatus(`Î×ÎÉÎ¬Î¿ ${Math.round(((i + 1) / toProcess.length) * 100)}%`);
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



  useEffect(() => {
    if (!timeSeriesInstance.current) return;
    
    const datasets: { name: string; data: any[]; color: string }[] = [];
    
    if (compareMode && !compareOperation.includes('all')) {
      // Comparison Mode Logic
      const op1Data = filteredData.filter(d => d.operationsArray.some(op => operationFilter.includes(op)));
      const op2Data = filteredData.filter(d => d.operationsArray.some(op => compareOperation.includes(op)));
      
      const g1 = getGroupedData(op1Data, timeResolution);
      const g2 = getGroupedData(op2Data, timeResolution);
      
      const allKeys = Array.from(new Set([...Object.keys(g1), ...Object.keys(g2)]));
      if (['year', 'month', 'hour', 'minute'].includes(timeResolution)) allKeys.sort();
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

      timeSeriesInstance.current.setOption({
        legend: { show: true, bottom: 0, textStyle: { color: '#94a3b8' } },
        xAxis: { data: allKeys },
        series: datasets.map(ds => ({
          name: ds.name,
          type: 'line',
          smooth: true,
          data: ds.data,
          itemStyle: { color: ds.color },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: ds.color + '66' },
              { offset: 1, color: ds.color + '00' }
            ])
          }
        }))
      });
    } else {
      const grouped = getGroupedData(filteredData, timeResolution);
      const xData = Object.keys(grouped);
      if (['year', 'month', 'hour', 'minute'].includes(timeResolution)) xData.sort();
      else if (timeResolution === 'weekday') xData.sort((a, b) => daysHe.indexOf(a) - daysHe.indexOf(b));
      
      const yData = xData.map(k => grouped[k]);
      timeSeriesInstance.current.setOption({
        legend: { show: false },
        xAxis: { data: xData },
        series: [{
          name: 'ÎöÎ¬Î¿ÎóÎòÎ¬',
          data: yData,
          type: ['hour', 'weekday', 'minute'].includes(timeResolution) ? 'bar' : 'line',
          smooth: true,
          itemStyle: { 
            color: '#38bdf8',
            borderRadius: [8, 8, 0, 0],
            shadowBlur: 10,
            shadowColor: 'rgba(56, 189, 248, 0.4)'
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(56,189,248,0.4)' },
              { offset: 1, color: 'rgba(56,189,248,0)' }
            ])
          }
        }]
      });
    }

    timeSeriesInstance.current.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross', label: { backgroundColor: '#0f172a' } }, appendToBody: true, position: customTooltipPosition },
      grid: { top: '10%', bottom: compareMode ? '15%' : '5%', left: '2%', right: '2%', containLabel: true },
      yAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } } },
      xAxis: { axisLabel: { color: '#94a3b8', fontSize: 10, rotate: timeResolution === 'hour' ? 45 : 0 } },
    });
  }, [filteredData, globalData, timeResolution, compareMode, compareOperation, operationFilter, darkMode]);

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
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        borderWidth: 0,
        textStyle: { color: '#fff' },
        position: customTooltipPosition
      },
      grid: { top: '15%', bottom: '15%', left: '2%', right: '2%', containLabel: true },
      xAxis: {
        type: 'category',
        data: sorted.map(s => s[0]),
        axisLabel: {
          interval: 0, rotate: 30, fontSize: 10,
          color: '#94a3b8',
          formatter: (v: string) => v.length > 8 ? v.substring(0, 8) + '...' : v
        }
      },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } }, axisLabel: { show: false } },
      series: [{
        type: 'bar',
        data: sorted.map(s => s[1]),
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#38bdf8' },
            { offset: 1, color: '#3b82f6' }
          ]),
          borderRadius: [6, 6, 0, 0],
          shadowBlur: 10,
          shadowColor: 'rgba(56, 189, 248, 0.3)'
        },
        label: { 
          show: true, 
          position: 'top', 
          fontSize: 10,
          fontWeight: 'bold',
          color: '#38bdf8',
          formatter: '{c}'
        }
      }]
    });
  }, [filteredData, darkMode]);

  useEffect(() => {
    if (!threatInstance.current || !sourceInstance.current) return;
    const tCounts: Record<string, number> = {};
    const sCounts: Record<string, number> = {};
    filteredData.forEach(d => {
      const t = d.threatStr || 'ÎÉÎùÎ¿';
      const s = d.sourceStr || 'Î×ÎóÎòÎ¿Îæ / Î£ÎÉ ÎíÎòÎòÎÆ';
      tCounts[t] = (tCounts[t] || 0) + 1;
      sCounts[s] = (sCounts[s] || 0) + 1;
    });

    const pieOpt = (data: any[], colors: string[]) => ({
      tooltip: { 
        trigger: 'item', 
        appendToBody: true,
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        borderWidth: 0,
        textStyle: { color: '#fff' },
        position: customTooltipPosition,
        formatter: '{b}: <br/><b>{c} ÎöÎ¬Î¿ÎóÎòÎ¬</b> ({d}%)'
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
    threatInstance.current.setOption(pieOpt(Object.entries(tCounts).map(([n, v]) => ({ name: n, value: v })), neonColors));
    sourceInstance.current.setOption(pieOpt(Object.entries(sCounts).map(([n, v]) => ({ name: n, value: v })), neonColors));

    // Interactive Filtering
    threatInstance.current.off('click');
    threatInstance.current.on('click', (params: any) => {
      if (params.name) setThreatFilter([params.name]);
    });
    sourceInstance.current.off('click');
    sourceInstance.current.on('click', (params: any) => {
      if (params.name) setSourceFilter([params.name]);
    });
  }, [filteredData, darkMode]);

  // --- Insights ---
  const insight = useMemo(() => {
    if (filteredData.length < 5) return "Î×ÎóÎÿ Î×ÎôÎÖ ÎáÎ¬ÎòÎáÎÖÎØ Î£ÎöÎñÎºÎ¬ Î¬ÎòÎæÎáÎö.";
    const total = filteredData.length;
    const dateCounts: Record<string, number> = {};
    filteredData.forEach(d => { const s = d.time.split(' ')[0]; dateCounts[s] = (dateCounts[s] || 0) + 1; });
    const maxDate = Object.keys(dateCounts).reduce((a, b) => dateCounts[a] > dateCounts[b] ? a : b);
    const maxDateCount = dateCounts[maxDate];
    if ((maxDateCount / total) > 0.1) return `<b>Î®ÎÖÎÉ Î¬ÎºÎÖÎñÎö:</b><br>${maxDate} ÎóÎØ ${maxDateCount.toLocaleString()} ÎöÎ¬Î¿ÎóÎòÎ¬.`;
    
    const nightCount = filteredData.filter(d => d.hour >= 23 || d.hour < 6).length;
    if (nightCount / total > 0.3) return `<b>ÎñÎóÎÖÎ£ÎòÎ¬ Î£ÎÖÎ£ÎÖÎ¬:</b><br>${Math.round((nightCount/total)*100)}% Î×ÎöÎöÎ¬Î¿ÎóÎòÎ¬ ÎæÎ£ÎÖÎ£Îö.`;
    
    return "Î®ÎÆÎ¿Î¬ ÎæÎÖÎÿÎùÎòÎƒ ÎÖÎùÎíÎÖÎ¬ ÎæÎùÎ¬ÎÜ ÎûÎö.";
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
    <div className={`flex flex-col h-screen bg-bg-color font-sans transition-colors duration-500 overflow-hidden relative ${darkMode ? 'dark' : ''}`} dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="mesh-gradient" />
      
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
            <h1 className="text-xl md:text-2xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-primary-azure neon-text">
              {t.title}
            </h1>
            <div className="hidden md:flex items-center gap-2 mt-0.5">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">{isRtl ? 'Î×ÎùÎòÎæÎ¿ Î£ÎáÎ¬ÎòÎáÎÖ ÎÉÎ×Î¬' : 'CONNECTED TO LIVE DATA'}</span>
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
                    className="bg-transparent border-none text-sm outline-none w-32 md:w-44 text-white placeholder:text-text-muted/50"
                    placeholder={isRtl ? "ÎùÎÖÎñÎòÎ® ÎóÎÖÎ¿..." : "Search city..."}
                    value={citySearch}
                    onChange={(e) => handleCitySearchChange(e.target.value, 'desktop')}
                    onFocus={() => {
                        if (citySearch.trim().length > 0) setShowSuggestions(true);
                        setActiveSearchSource('desktop');
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
                          <div 
                            key={idx} 
                            className="px-4 py-2 hover:bg-white/10 rounded-lg cursor-pointer text-white text-sm transition-colors"
                            onClick={() => selectCity(city)}
                          >
                            {city}
                          </div>
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
                    label={isRtl ? "Î£ÎöÎ®ÎòÎòÎ¬ Î×ÎòÎ£..." : "Compare vs..."} 
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

          <button 
            onClick={() => {
              setDarkMode(!darkMode);
              document.documentElement.classList.toggle('dark');
            }}
            className="p-2.5 hover:bg-white/10 rounded-xl transition-all text-text-main glass-card border-none"
          >
            {darkMode ? <Moon size={20} className="text-accent-gold neon-text" /> : <Sun size={20} className="text-white" />}
          </button>

          <div className="flex items-center gap-1 glass-card p-1 border-none">
            <button 
              onClick={() => setLang('he')}
              className={`w-7 h-7 rounded-lg transition-all ${lang === 'he' ? 'ring-2 ring-primary-azure ring-offset-2 ring-offset-transparent' : 'opacity-40 hover:opacity-100'}`}
            >
              <img src="https://flagcdn.com/w40/il.png" alt="IL" className="w-full h-full object-cover rounded-md" />
            </button>
            <button 
              onClick={() => setLang('en')}
              className={`w-7 h-7 rounded-lg transition-all ${lang === 'en' ? 'ring-2 ring-primary-azure ring-offset-2 ring-offset-transparent' : 'opacity-40 hover:opacity-100'}`}
            >
              <img src="https://flagcdn.com/w40/us.png" alt="US" className="w-full h-full object-cover rounded-md" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col md:flex-row md:overflow-hidden p-4 gap-4">
        
        {/* Left Panel: Analytics */}
        <div className="w-full md:w-3/4 flex flex-col gap-4 md:overflow-y-auto order-1 md:order-2 scrollbar-hide">
          
          {/* KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 flex-shrink-0">
            <motion.div whileHover={{ y: -5 }} className="glass-card p-4 relative overflow-hidden group">
              <div className="absolute top-0 bottom-0 left-0 w-1 bg-primary-azure group-hover:w-2 transition-all shadow-[0_0_15px_var(--primary-azure)]" />
              <div className="text-xs text-text-muted font-bold tracking-widest uppercase mb-1">{t.totalAlerts}</div>
              <div className="text-3xl font-black text-white neon-text">{filteredData.length.toLocaleString()}</div>
            </motion.div>
            
            <motion.div whileHover={{ y: -5 }} className="glass-card p-4 relative overflow-hidden group">
              <div className="absolute top-0 bottom-0 left-0 w-1 bg-sky-400 shadow-[0_0_15px_#38bdf8]" />
              <div className="flex justify-between items-center mb-1">
                <div className="text-xs text-text-muted font-bold tracking-widest uppercase">{t.showerIndex}</div>
                <Info size={14} className="text-sky-400" />
              </div>
              <div className="flex flex-col">
                {showerIndex ? (
                  <>
                    <div className="text-2xl font-black text-white leading-none">{showerIndex.time}</div>
                    <div className="text-[10px] text-text-muted font-bold mt-2 flex items-center gap-2">
                       <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                        {showerIndex.probability}% {isRtl ? 'ÎíÎÖÎøÎòÎÖ Î£Î®ÎºÎÿ' : 'Quiet Chance'}
                       </span>
                    </div>
                  </>
                ) : (
                  <span className="text-sm italic opacity-50">{t.noData}</span>
                )}
              </div>
            </motion.div>

            <motion.div whileHover={{ y: -5 }} className="glass-card p-4 relative overflow-hidden group sm:col-span-2 md:col-span-1">
              <div className="absolute top-0 bottom-0 left-0 w-1 bg-alert-red shadow-[0_0_15px_#f87171]" />
              <div className="text-xs text-text-muted font-bold tracking-widest uppercase mb-1">{t.lastAlert}</div>
              <div className="text-xl font-black text-white">
                {filteredData.length > 0 ? filteredData[filteredData.length-1].time : "-"}
              </div>
            </motion.div>
          </div>

          {/* Charts Row 1 */}
          <div className="flex flex-col md:flex-row gap-4 md:flex-1 min-h-[350px]">
            <div className="glass-card p-5 flex flex-col md:flex-[2.5] h-[350px] md:h-auto neon-border">
              <div className="flex justify-between items-center mb-4">
                <div className="flex gap-1.5 p-1 bg-black/30 rounded-xl border border-white/5">
                  {(['year', 'month', 'weekday', 'hour', 'minute'] as const).map(res => (
                    <button 
                      key={res}
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${timeResolution === res ? 'bg-primary-azure text-white shadow-[0_0_10px_rgba(56,189,248,0.4)]' : 'text-text-muted hover:text-white'}`}
                      onClick={() => setTimeResolution(res)}
                    >
                      {res === 'year' ? t.years : res === 'month' ? t.months : res === 'weekday' ? t.days : res === 'hour' ? t.hours : t.minutes}
                    </button>
                  ))}
                </div>
                <button 
                    onClick={() => setCompareMode(!compareMode)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all ${compareMode ? 'bg-accent-gold text-white shadow-[0_0_10px_#fbbf24]' : 'bg-black/20 text-text-muted border border-white/5 hover:border-white/20'}`}
                >
                    <TrendingUp size={12} />
                    {t.compare}
                </button>
              </div>
              <div ref={timeSeriesChartRef} className="flex-1 w-full min-h-0" />
            </div>

            <div className="glass-card p-4 flex flex-col md:flex-1 h-[280px] md:h-auto">
              <div className="flex items-center gap-2 mb-4">
                 <PieChartIcon size={16} className="text-alert-red" />
                 <span className="font-black text-white text-xs uppercase tracking-widest">{t.threatDist}</span>
              </div>
              <div ref={threatChartRef} className="flex-1 w-full min-h-0" />
            </div>
          </div>

          {/* Charts Row 2 */}
          <div className="flex flex-col md:flex-row gap-4 h-[300px] md:h-[280px] flex-shrink-0">
            <div className="glass-card p-4 flex flex-col md:flex-1 h-full">
              <div className="flex items-center gap-2 mb-3">
                 <Globe size={16} className="text-primary-azure" />
                 <span className="font-black text-white text-xs uppercase tracking-widest">{t.sourceDist}</span>
              </div>
              <div ref={sourceChartRef} className="flex-1 w-full min-h-0" />
            </div>
            <div className="glass-card p-4 flex flex-col md:flex-[2] h-full">
              <div className="flex items-center gap-2 mb-3">
                 <MapIcon size={16} className="text-primary-azure" />
                 <span className="font-black text-white text-xs uppercase tracking-widest">{t.topCities}</span>
              </div>
              <div ref={topCitiesChartRef} className="flex-1 w-full min-h-0" />
            </div>
          </div>
        </div>

        {/* Right Panel: Map */}
        <div className="w-full md:w-1/4 glass-card flex flex-col overflow-hidden h-[400px] md:h-full relative flex-shrink-0 order-2 md:order-1 border-none">
          <div className="px-5 py-3 bg-black/40 border-b border-white/5 flex justify-between items-center">
            <span className="font-black text-white text-xs uppercase tracking-widest">{t.mapTitle}</span>
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
      <footer className={`h-12 flex items-center overflow-hidden z-30 shadow-[0_-10px_30px_rgba(0,0,0,0.5)] transition-all duration-1000 ${liveAlert ? 'live-flash' : 'bg-black/60 backdrop-blur-xl border-t border-white/5'}`}>
        <div className="bg-primary-deep-blue/40 backdrop-blur-md h-full px-6 flex items-center font-black text-xs uppercase tracking-widest text-white z-10 border-r border-white/10 shadow-[5px_0_15px_rgba(0,0,0,0.3)]">
          {liveAlert ? `­ƒÜ¿ ${t.liveAlert}` : t.tickerTitle}
        </div>
        <div className="ticker-move flex-1 text-white py-1">
          {liveAlert ? (
            <span className="inline-block px-10 text-base font-black neon-text">
              {liveAlert.title}: <span className="text-primary-azure">{liveAlert.cities}</span>
            </span>
          ) : (
            globalData.slice(-15).reverse().map((alert, i) => (
              <span key={i} className="inline-block px-10 text-xs font-bold opacity-80 hover:opacity-100 transition-opacity">
                <span className="text-alert-red">ÔùÅ</span> {alert.operationsArray?.[0] || 'Î®ÎÆÎ¿Îö'} | <b className="text-white">{alert.cities}</b> <span className="text-text-muted font-normal">({alert.threatStr})</span>
              </span>
            ))
          )}
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
                <h2 className="text-2xl font-black text-white neon-text uppercase tracking-tighter">{isRtl ? 'Î×ÎíÎáÎáÎÖÎØ' : 'Filters'}</h2>
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
                      placeholder={isRtl ? "ÎùÎÖÎñÎòÎ® ÎóÎÖÎ¿..." : "Search city..."}
                      value={citySearch}
                      onChange={(e) => handleCitySearchChange(e.target.value, 'mobile')}
                    />
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
                                {opt === 'all' ? 'ÎöÎøÎ£' : opt}
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
                                {opt === 'all' ? 'ÎöÎøÎ£' : opt}
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
                  {isRtl ? 'ÎöÎªÎÆ Î¬ÎòÎªÎÉÎòÎ¬' : 'Show Results'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
