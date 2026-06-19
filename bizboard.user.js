// ==UserScript==
// @name         BizBoard
// @namespace    Apo & Onur
// @version      27.0
// @description  Mitarbeiter-Kapazitätsrechner (V26.0: Fix Header-Position/Zeitleiste, Schicht-Zeitleiste, mit/ohne Pause, Schwellenwert ohne Limit)
// @author       Apo & Onur
// @match        https://bizboard.post.ch/panel?panelId=verzollung&secret=1234
// @grant        none
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/Bira8952/Add-on-BizBord-PVZ1/main/bizboard.user.js
// @downloadURL  https://raw.githubusercontent.com/Bira8952/Add-on-BizBord-PVZ1/main/bizboard.user.js
// ==/UserScript==

(function() {
  // ============================================================================
  // CONFIGURATION & CONSTANTS
  // ============================================================================

  const DEBUG = false;
  const DEBOUNCE_DELAY = 300;
  const UPDATE_INTERVAL = 10000;
  
  // Storage Keys
  const STORAGE_KEY = 'ma-badge-product-config';
  const AVAILABLE_WORKERS_KEY = 'ma-badge-shift-workers';
  const GLOBAL_BREAKS_KEY = 'ma-badge-global-breaks';
  const APP_SETTINGS_KEY = 'ma-badge-app-settings';

  // THEMES DEFINITION (Braun vs. Klassisch)
  const THEMES = {
      brown: { primary: '#4a3b2c', hover: '#5e4b38', bg: '#e6e1d6', card: '#f4f2ec', text: '#4a3b2c', lightText: '#ffffff' },
      classic: { primary: '#217091', hover: '#1a5772', bg: '#ffffff', card: '#f9f9f9', text: '#333333', lightText: '#ffffff' }
  };

  // STANDARD PAUSEN
  const DEFAULT_BREAKS = [
    { start: '09:00', end: '09:15' }, { start: '12:00', end: '12:30' }, 
    { start: '14:00', end: '14:15' }, { start: '16:00', end: '16:30' },
    { start: '18:00', end: '18:15' }, { start: '20:00', end: '20:30' }
  ];

  const COLOR_SCHEME = { 0: '#999999', 1: '#10c32b', 2: '#ffa500', 3: '#ee5555' };

  let productConfig = {};
  let customBreaks = [];
  let appSettings = { theme: 'brown', showHeader: true, hiddenBadges: [] };
  
  let currentOpenPopup = null;
  let debounceTimeout = null;
  let observer = null;
  let currentPopupValues = {};

  // ============================================================================
  // CSS INJECTION (Mit Variablen für Live-Theme-Wechsel)
  // ============================================================================
  function injectStyles() {
    if (document.getElementById('ma-badge-styles')) return;

    const style = document.createElement('style');
    style.id = 'ma-badge-styles';
    style.innerHTML = `
      :root {
          --ma-primary: ${THEMES.brown.primary};
          --ma-hover: ${THEMES.brown.hover};
          --ma-bg: ${THEMES.brown.bg};
          --ma-card: ${THEMES.brown.card};
          --ma-text: ${THEMES.brown.text};
      }
      
      .ma-popup { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--ma-bg); border-radius: 4px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); z-index: 99999; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 520px; width: 95%; max-height: 90vh; display: flex; flex-direction: column; border: 2px solid var(--ma-primary); overflow: hidden; }
      .ma-popup.dashboard { max-width: 1050px; }
      .ma-popup.settings { max-width: 800px; }
      
      .ma-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 30px; background: var(--ma-bg); border-bottom: 2px solid rgba(0,0,0,0.1); z-index: 10; flex-shrink: 0; }
      .ma-body { padding: 20px 30px; overflow-y: auto; flex-grow: 1; }
      .ma-footer { display: flex; gap: 10px; justify-content: flex-end; padding: 15px 30px; background: var(--ma-bg); border-top: 2px solid rgba(0,0,0,0.1); z-index: 10; flex-shrink: 0; }

      .ma-title { margin: 0; color: var(--ma-primary); font-size: 24px; font-weight: 700; display: flex; align-items: center; }
      .ma-close { border: none; background: transparent; border-radius: 50%; width: 32px; height: 32px; font-size: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--ma-primary); transition: all 0.2s; font-weight: bold; margin: 0; padding: 0; }
      .ma-close:hover { background: rgba(0,0,0,0.1); }
      
      .ma-live-section { margin-bottom: 24px; padding: 20px; background: var(--ma-card); border-radius: 4px; box-shadow: inset 0 1px 3px rgba(0,0,0,0.05); }
      .ma-live-title { margin: 0 0 16px 0; color: var(--ma-primary); font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 5px; }
      .ma-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      .ma-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
      .ma-grid-gap { gap: 10px; margin-bottom: 10px; }
      .ma-mt-16 { margin-top: 16px; } .ma-mb-16 { margin-bottom: 16px; }
      .ma-card { padding: 12px; background: white; border-radius: 4px; border: 1px solid rgba(0,0,0,0.1); box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
      .ma-label { color: #555; font-size: 11px; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
      .ma-value { font-size: 16px; font-weight: 700; color: #222; }
      .ma-value-lg { font-size: 18px; color: var(--ma-primary); font-weight: 700; }
      .ma-rest-card { padding: 14px; background: var(--ma-primary); border-radius: 4px; color: white; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
      .ma-rest-label { color: rgba(255,255,255,0.7); font-size: 11px; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
      .ma-rest-value { font-size: 24px; font-weight: 700; color: white; }
      .ma-adjusted-card { padding: 14px; background: white; border: 2px solid var(--ma-primary); border-radius: 4px; margin-top: 16px; text-align: center; }
      .ma-adjusted-label { color: #555; font-size: 11px; font-weight: 600; text-transform: uppercase; margin-bottom: 6px; }
      .ma-adjusted-value { font-size: 20px; font-weight: 700; color: var(--ma-primary); }
      .ma-needed-card { padding: 16px; background: var(--ma-primary); border-radius: 4px; margin-top: 16px; text-align: center; color: white; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
      .ma-needed-value { font-size: 32px; font-weight: 700; color: white; }
      .ma-formel { font-size: 12px; margin: 8px 0 0 0; padding: 8px; background: rgba(0,0,0,0.04); border-radius: 4px; color: #333; }
      .ma-input-label { display: block; font-size: 13px; font-weight: 600; color: var(--ma-primary); margin-bottom: 8px; }
      .ma-input { width: 100%; padding: 10px; border: 1px solid rgba(0,0,0,0.2); background: white; border-radius: 4px; font-size: 14px; box-sizing: border-box; transition: border-color 0.2s; }
      .ma-input:focus { border-color: var(--ma-primary); outline: none; box-shadow: 0 0 0 2px rgba(0,0,0, 0.1); }
      
      .ma-btn { padding: 12px 16px; background: white; color: var(--ma-primary); border: 1px solid rgba(0,0,0,0.2); border-radius: 4px; font-weight: 600; cursor: pointer; font-size: 14px; transition: all 0.2s; }
      .ma-btn:hover { background: var(--ma-card); border-color: var(--ma-primary); }
      .ma-btn.active { background: var(--ma-primary); color: white; border-color: var(--ma-primary); box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
      
      .ma-btn-cancel { padding: 10px 18px; background: transparent; color: var(--ma-primary); border: 1px solid var(--ma-primary); border-radius: 4px; font-weight: 600; cursor: pointer; font-size: 14px; transition: background 0.2s; }
      .ma-btn-cancel:hover { background: rgba(0,0,0, 0.05); }
      .ma-btn-save { padding: 10px 18px; background: var(--ma-primary); color: white; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; font-size: 14px; transition: background 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
      .ma-btn-save:hover { background: var(--ma-hover); }
      .ma-btn-danger { padding: 10px 18px; background: transparent; color: #ee5555; border: 1px solid #ee5555; border-radius: 4px; font-weight: 600; cursor: pointer; font-size: 13px; transition: background 0.2s; }
      .ma-btn-danger:hover { background: #f8d7da; }
      .ma-btn-action { padding: 10px 18px; background: var(--ma-primary); color: white; border: none; border-radius: 4px; font-weight: 700; cursor: pointer; font-size: 14px; transition: background 0.2s; display: flex; align-items: center; gap: 8px;}
      .ma-btn-action:hover { background: var(--ma-hover); }

      .ma-toast-container { position: fixed; bottom: 20px; right: 20px; z-index: 100000; display: flex; flex-direction: column; gap: 10px; pointer-events: none; }
      .ma-toast { padding: 14px 20px; border-radius: 4px; color: white; background: var(--ma-primary); border-left: 4px solid #10c32b; box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-family: sans-serif; font-size: 14px; font-weight: 600; opacity: 0; transform: translateY(20px); transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55); }
      .ma-toast.show { opacity: 1; transform: translateY(0); }

      .ma-table { width: 100%; border-collapse: collapse; font-size: 14px; background: white; border-radius: 4px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
      .ma-table th { background: var(--ma-primary); color: white; padding: 14px 12px; text-align: left; font-weight: 600; position: sticky; top: 0; z-index: 10; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px; }
      .ma-table td { padding: 14px 12px; border-bottom: 1px solid #eee; vertical-align: middle; color: #333; }
      .ma-table tr:hover { background-color: var(--ma-card); }
      .ma-badge-pill { display: inline-block; padding: 6px 12px; border-radius: 4px; color: white; font-weight: bold; font-size: 13px; text-align: center; min-width: 45px; box-shadow: 0 1px 2px rgba(0,0,0,0.2); }
      .ma-faktor-text { font-size: 11px; color: white; font-weight: 700; background: var(--ma-primary); padding: 3px 6px; border-radius: 3px; margin-left: 6px; }
      
      .ma-alloc-pill { display: inline-block; padding: 6px 12px; border-radius: 4px; font-weight: bold; font-size: 13px; text-align: center; min-width: 45px; border: 2px solid; }
      .ma-alloc-ok { background: #e8f5e9; color: #10c32b; border-color: #10c32b; }
      .ma-alloc-warn { background: #fff3cd; color: #ffa500; border-color: #ffa500; }
      .ma-alloc-crit { background: #f8d7da; color: #ee5555; border-color: #ee5555; }
      
      /* Tooltip Styling */
      .ma-author-tooltip { position: fixed; background: var(--ma-primary); color: var(--ma-bg); padding: 12px 16px; border-radius: 4px; font-family: 'Segoe UI', Tahoma, sans-serif; font-size: 13px; box-shadow: 0 4px 15px rgba(0,0,0,0.4); pointer-events: none; opacity: 0; transition: opacity 0.2s ease-in-out; z-index: 100000; border: 1px solid rgba(255,255,255,0.1); }
      .ma-author-tooltip.show { opacity: 1; }
      .ma-author-tooltip-title { font-weight: bold; font-size: 15px; margin-bottom: 6px; color: white; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 4px; }
      .ma-author-tooltip-text { margin: 4px 0; }
      
      /* Custom Checkboxes */
      .ma-checkbox-wrapper { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: white; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600; color: #333; transition: all 0.2s; }
      .ma-checkbox-wrapper:hover { border-color: var(--ma-primary); background: var(--ma-card); }
      .ma-checkbox-wrapper input { cursor: pointer; width: 16px; height: 16px; accent-color: var(--ma-primary); }
    `;
    document.head.appendChild(style);
  }

  function applyTheme() {
      const root = document.documentElement;
      const t = THEMES[appSettings.theme] || THEMES.brown;
      root.style.setProperty('--ma-primary', t.primary);
      root.style.setProperty('--ma-hover', t.hover);
      root.style.setProperty('--ma-bg', t.bg);
      root.style.setProperty('--ma-card', t.card);
      root.style.setProperty('--ma-text', t.text);
  }

  function showToast(message, type = 'success') {
    let container = document.getElementById('ma-toast-container');
    if (!container) {
      container = document.createElement('div'); container.id = 'ma-toast-container'; container.className = 'ma-toast-container'; document.body.appendChild(container);
    }
    const toast = document.createElement('div'); toast.className = `ma-toast ${type}`; toast.textContent = message; container.appendChild(toast);
    requestAnimationFrame(() => { setTimeout(() => toast.classList.add('show'), 10); });
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
  }

  // ============================================================================
  // UTILITIES, ZEITBERECHNUNG & STORAGE
  // ============================================================================
  function isValidTime(timeStr) { return typeof timeStr === 'string' && /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeStr); }
  function getDefaultDeadline() {
    const d = new Date(Date.now() + 2 * 60 * 60 * 1000); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function formatRestzeit(minutes) {
    const hours = Math.floor(minutes / 60); const mins = minutes % 60;
    if (hours === 0) return `${mins}m`; if (mins === 0) return `${hours}h`; return `${hours}h ${mins}m`;
  }
  function formatNumber(value) { return Math.round(value).toString(); }
  function getCurrentTime() {
    const now = new Date(); return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  }
  function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
  
  function loadConfig() { 
      try { const saved = localStorage.getItem(STORAGE_KEY); productConfig = saved ? JSON.parse(saved) : {}; } catch (e) { productConfig = {}; } 
      try { const savedApp = localStorage.getItem(APP_SETTINGS_KEY); appSettings = savedApp ? JSON.parse(savedApp) : { theme: 'brown', showHeader: true, hiddenBadges: [] }; } catch (e) { appSettings = { theme: 'brown', showHeader: true, hiddenBadges: [] }; }
      // Sicherstellen, dass hiddenBadges ein Array ist
      if(!Array.isArray(appSettings.hiddenBadges)) appSettings.hiddenBadges = [];
  }
  function saveConfig() { localStorage.setItem(STORAGE_KEY, JSON.stringify(productConfig)); }
  function saveAppSettings() { localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(appSettings)); applyTheme(); }
  
  function getShiftData() {
    try { const saved = localStorage.getItem(AVAILABLE_WORKERS_KEY); return saved ? JSON.parse(saved) : { frueh: 0, mittel: 0, spaet: 0, currentShift: 'frueh' }; } 
    catch (e) { return { frueh: 0, mittel: 0, spaet: 0, currentShift: 'frueh' }; }
  }
  function setShiftData(data) { localStorage.setItem(AVAILABLE_WORKERS_KEY, JSON.stringify(data)); }

  function loadGlobalBreaks() {
    try { const saved = localStorage.getItem(GLOBAL_BREAKS_KEY); customBreaks = saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(DEFAULT_BREAKS)); } 
    catch (e) { customBreaks = JSON.parse(JSON.stringify(DEFAULT_BREAKS)); }
  }
  function saveGlobalBreaks() { localStorage.setItem(GLOBAL_BREAKS_KEY, JSON.stringify(customBreaks)); }

  // Validiert & säubert ein Konfig-Objekt. Wird beim Laden (getProductConfig)
  // UND beim Speichern (Speichern-Button) genutzt.
  function validateConfig(cfg) {
    cfg = cfg || {};
    return {
      unitsPerHour: Math.max(50, Math.min(5000, parseInt(cfg.unitsPerHour) || 500)),
      faktor: [1.0, 1.2].includes(cfg.faktor) ? cfg.faktor : 1.0,
      deadline: isValidTime(cfg.deadline) ? cfg.deadline : getDefaultDeadline(),
      startTimeMode: ['live', 'manual'].includes(cfg.startTimeMode) ? cfg.startTimeMode : 'live',
      startTime: isValidTime(cfg.startTime) ? cfg.startTime : getCurrentTime(),
      minThreshold: Math.max(0, parseInt(cfg.minThreshold) || 0)
    };
  }

  function getProductConfig(productName) {
    if (!productName) return null;
    productConfig[productName] = validateConfig(productConfig[productName]);
    return productConfig[productName];
  }

  function getBreakDeductionMs(startDate, endDate) {
    let deductionMs = 0;
    customBreaks.forEach(b => {
      let breakStart = new Date(startDate); let [sh, sm] = b.start.split(':'); breakStart.setHours(sh, sm, 0, 0);
      let breakEnd = new Date(startDate); let [eh, em] = b.end.split(':'); breakEnd.setHours(eh, em, 0, 0);
      let overlapStart = new Date(Math.max(startDate, breakStart)); let overlapEnd = new Date(Math.min(endDate, breakEnd));
      if (overlapStart < overlapEnd) deductionMs += (overlapEnd - overlapStart);
      if (endDate.getDate() !== startDate.getDate()) {
        breakStart.setDate(breakStart.getDate() + 1); breakEnd.setDate(breakEnd.getDate() + 1);
        let overlapStartNext = new Date(Math.max(startDate, breakStart)); let overlapEndNext = new Date(Math.min(endDate, breakEnd));
        if (overlapStartNext < overlapEndNext) deductionMs += (overlapEndNext - overlapStartNext);
      }
    });
    return deductionMs;
  }

  function calculateTimeRemaining(startTimeMode, startTime, deadline) {
    const effectiveStartTime = startTimeMode === 'live' ? getCurrentTime() : startTime;
    if (!isValidTime(effectiveStartTime) || !isValidTime(deadline)) return null;
    const [startHours, startMinutes] = effectiveStartTime.split(':').map(Number); const [deadlineHours, deadlineMinutes] = deadline.split(':').map(Number);
    let startDate = new Date(); startDate.setHours(startHours, startMinutes, 0, 0);
    let deadlineDate = new Date(); deadlineDate.setHours(deadlineHours, deadlineMinutes, 0, 0);
    if (deadlineDate <= startDate) deadlineDate.setDate(deadlineDate.getDate() + 1);
    let grossMs = deadlineDate - startDate;
    if (grossMs <= 0) return null;
    const breakMs = getBreakDeductionMs(startDate, deadlineDate); const diffMs = Math.max(0, grossMs - breakMs); 
    return { ms: diffMs, minutes: Math.floor(diffMs / 60000), hours: (diffMs / 3600000).toFixed(2),
             grossMinutes: Math.floor(grossMs / 60000), grossHours: (grossMs / 3600000).toFixed(2),
             breakMinutes: Math.round(breakMs / 60000) };
  }

  function calculateInfo(productValue, productName, overrideValues = null) {
    if (!productName) return null;
    let cfg = getProductConfig(productName); if (overrideValues) cfg = { ...cfg, ...overrideValues };
    if (!cfg || isNaN(productValue) || productValue < 0) return null;
    const timeRemaining = calculateTimeRemaining(cfg.startTimeMode, cfg.startTime, cfg.deadline);
    if (!timeRemaining || timeRemaining.ms <= 0) return null;
    
    const restHours = parseFloat(timeRemaining.hours); const adjustedValue = productValue * cfg.faktor;
    const capacityPerWorker = Math.ceil(restHours * cfg.unitsPerHour);
    
    let exactWorkersNeeded = capacityPerWorker > 0 ? (adjustedValue / capacityPerWorker) : 0;
    let workersNeeded = 0; if (productValue > 0) workersNeeded = capacityPerWorker > 0 ? Math.ceil(exactWorkersNeeded) : 99;
    if ((cfg.minThreshold||0) > 0 && productValue <= cfg.minThreshold) { workersNeeded = 0; exactWorkersNeeded = 0; }
    const grossHours = parseFloat(timeRemaining.grossHours || timeRemaining.hours);
    const capacityPerWorkerNoBreak = Math.ceil(grossHours * cfg.unitsPerHour);
    let exactWorkersNeededNoBreak = capacityPerWorkerNoBreak > 0 ? (adjustedValue / capacityPerWorkerNoBreak) : 0;
    let workersNeededNoBreak = 0; if (productValue > 0) workersNeededNoBreak = capacityPerWorkerNoBreak > 0 ? Math.ceil(exactWorkersNeededNoBreak) : 99;
    if ((cfg.minThreshold||0) > 0 && productValue <= cfg.minThreshold) { workersNeededNoBreak = 0; exactWorkersNeededNoBreak = 0; }
    
    return {
      productValue, faktor: cfg.faktor, adjustedValue: Math.round(adjustedValue), startTime: cfg.startTimeMode === 'live' ? getCurrentTime() : cfg.startTime,
      deadline: cfg.deadline, restMinutes: timeRemaining.minutes, restHours, unitsPerHour: cfg.unitsPerHour, capacityPerWorker, workersNeeded, exactWorkersNeeded,
      restMinutesNoBreak: timeRemaining.grossMinutes, breakMinutes: timeRemaining.breakMinutes, capacityPerWorkerNoBreak, workersNeededNoBreak, exactWorkersNeededNoBreak
    };
  }

  function getBadgeColor(workers) {
    if (workers <= 0) return COLOR_SCHEME[0]; if (workers === 1) return COLOR_SCHEME[1]; if (workers === 2) return COLOR_SCHEME[2]; return COLOR_SCHEME[3];
  }

  // ============================================================================
  // DYNAMISCHE URL GENERIERUNG
  // ============================================================================
  function getDynamicKurslisteUrls() {
    const today = new Date(); const day = String(today.getDate()).padStart(2, '0'); const month = String(today.getMonth() + 1).padStart(2, '0'); const year = today.getFullYear();
    const dateStr = `${day}.${month}.${year}`;
    const baseUrl = `https://postchag.sharepoint.com/sites/LS75/Freigegebene%20Dokumente/LS75.5%20PVZ/04_Arbeitsunterlagen/04_Kursliste/Kursliste_${dateStr}.pdf`;
    const absoluteFilePath = `https://postchag.sharepoint.com/sites/LS75/Freigegebene Dokumente/LS75.5 PVZ/04_Arbeitsunterlagen/04_Kursliste/Kursliste_${dateStr}.pdf`;
    return {
      embedUrl: `https://postchag.sharepoint.com/sites/LS75/_layouts/15/Doc.aspx?sourcedoc=${encodeURIComponent(absoluteFilePath)}&action=embedview`,
      downloadUrl: `https://postchag.sharepoint.com/sites/LS75/_layouts/15/download.aspx?SourceUrl=${encodeURIComponent(absoluteFilePath)}`,
      externalUrl: baseUrl, displayDate: dateStr
    };
  }

  // ============================================================================
  // DOM UTILS: Alle aktiven Produkte auf der Seite finden
  // ============================================================================
  function getAllActiveProducts() {
      let products = new Set(Object.keys(productConfig)); // Gespeicherte nehmen
      // Plus alle, die gerade auf dem Bildschirm sind
      document.querySelectorAll('rect[id$="_bg"]').forEach(rect => {
          const prefix = rect.id.replace('_bg', '');
          const svg = rect.ownerSVGElement;
          if(svg) {
              const titleElem = svg.querySelector(`#TEXT_${prefix}_title`);
              if(titleElem && titleElem.textContent.trim() !== 'Title') {
                  products.add(titleElem.textContent.trim());
              }
          }
      });
      return Array.from(products).sort();
  }

  // ============================================================================
  // BRANDING & NAVIGATION
  // ============================================================================
  function addAddonBranding() {
    const old = document.getElementById('addon-teamapo-branding-group'); if (old && old.parentNode) old.parentNode.removeChild(old);
    const svg = document.querySelector('svg#SvgjsSvg1006, svg[id="_ROOT"]') || document.querySelector('svg'); if (!svg) return;
    let header = svg.querySelector('g#header') || svg;
    header.querySelectorAll('title').forEach(t => t.remove());
    const dateText = header.querySelector('#TEXT_date'); if (!dateText) return;

    const y = parseFloat(dateText.getAttribute('y')) || 32;
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g'); group.setAttribute('id', 'addon-teamapo-branding-group');

    const createBtn = (x, label, iconPath, onClick, width = 130) => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('transform', `translate(${x}, ${y - 22})`); g.style.cursor = 'pointer'; g.style.pointerEvents = 'all';
      
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('width', width); r.setAttribute('height', '30'); r.setAttribute('rx', '4'); 
      r.setAttribute('fill', 'var(--ma-bg)'); r.setAttribute('stroke', 'none');
      g.appendChild(r);
      
      const ip = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      ip.setAttribute('d', iconPath); ip.setAttribute('fill', 'var(--ma-primary)');
      const ig = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      ig.setAttribute('transform', 'translate(14, 5.5) scale(0.8)'); ig.appendChild(ip);
      g.appendChild(ig);
      
      if (label) {
          const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          t.setAttribute('x', '42'); t.setAttribute('y', '20'); t.setAttribute('fill', 'var(--ma-primary)'); t.setAttribute('font-size', '14'); t.setAttribute('font-family', 'sans-serif'); t.setAttribute('font-weight', 'bold'); t.textContent = label;
          g.appendChild(t); 
      }
      
      g.addEventListener('mouseenter', () => { r.setAttribute('fill', '#ffffff'); });
      g.addEventListener('mouseleave', () => { r.setAttribute('fill', 'var(--ma-bg)'); });
      g.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
      return g;
    };

    // CHECK: Will der User den Header überhaupt sehen?
    if (!appSettings.showHeader) {
        // NUR das Einstellungs-Zahnrad anzeigen
        group.appendChild(createBtn(20, '', 'M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z', showGlobalSettingsModal, 50));
    } else {
        // Vollen Header anzeigen
        group.appendChild(createBtn(20, 'Dashboard', 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z', showGlobalDashboard));
        group.appendChild(createBtn(160, 'Kursliste', 'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z', showKurslisteModal));
        group.appendChild(createBtn(300, 'Einstellung', 'M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z', showGlobalSettingsModal));

        let tooltip = document.getElementById('ma-author-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'ma-author-tooltip';
            tooltip.className = 'ma-author-tooltip';
            tooltip.innerHTML = `
                <div class="ma-author-tooltip-title">BizBoard MA-Rechner</div>
                <div class="ma-author-tooltip-text"><b>Version:</b> 17.0</div>
                <div class="ma-author-tooltip-text"><b>Entwickler:</b> Apo & Onur</div>
                <div class="ma-author-tooltip-text"><b>Kontakt:</b> E-Mail auf Anfrage</div>
            `;
            document.body.appendChild(tooltip);
        }

        const brandGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        brandGroup.style.cursor = 'pointer'; 
        brandGroup.style.pointerEvents = 'all';

        const bText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        bText.setAttribute('x', '445'); 
        bText.setAttribute('y', y); bText.setAttribute('font-family', 'Segoe UI, Tahoma, sans-serif'); bText.setAttribute('font-size', '24'); bText.setAttribute('font-weight', 'bold'); bText.setAttribute('fill', 'var(--ma-bg)'); bText.textContent = 'Apo & Onur';
        brandGroup.appendChild(bText);
        
        const hitBox = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        hitBox.setAttribute('x', '440'); hitBox.setAttribute('y', y - 25); hitBox.setAttribute('width', '130'); hitBox.setAttribute('height', '30'); hitBox.setAttribute('fill', 'transparent');
        brandGroup.appendChild(hitBox);

        brandGroup.addEventListener('mouseenter', (e) => {
            tooltip.classList.add('show');
            tooltip.style.left = (e.clientX + 15) + 'px'; tooltip.style.top = (e.clientY + 15) + 'px';
        });
        brandGroup.addEventListener('mousemove', (e) => {
            tooltip.style.left = (e.clientX + 15) + 'px'; tooltip.style.top = (e.clientY + 15) + 'px';
        });
        brandGroup.addEventListener('mouseleave', () => { tooltip.classList.remove('show'); });

        group.appendChild(brandGroup);
    }

    if (dateText.nextSibling) header.insertBefore(group, dateText.nextSibling); else header.appendChild(group);
  }

  // ============================================================================
  // SCHICHT-SYSTEM (Früh / Mittag / Spät)  — V19.0
  //   Pro Schicht: Anzahl MA, Arbeitszeit (von-bis), Pausen.
  //   Verfügbare MA = wer laut Schichtplan GERADE da ist (Spät erst ab Startzeit,
  //   wer Pause hat wird abgezogen).
  // ============================================================================

  const SHIFT_CONFIG_KEY = 'ma-badge-shift-config-v2';

  // Pausen vom anwesenden Personal abziehen? (false = Anzeige bleibt während
  // Pausen konstant; Pausen wirken dann nur über die globale Restzeit-Logik)
  const SUBTRACT_BREAKS_FROM_PRESENCE = true;

  function defaultShiftConfig() {
    return {
      frueh:  { count: 0, start: '06:00', end: '14:00', breaks: [ { start: '09:00', end: '09:15' }, { start: '12:00', end: '12:30' } ] },
      mittel: { count: 0, start: '09:00', end: '17:30', breaks: [ { start: '12:30', end: '13:00' }, { start: '15:00', end: '15:15' } ] },
      spaet:  { count: 0, start: '11:00', end: '20:00', breaks: [ { start: '14:00', end: '14:15' }, { start: '18:00', end: '18:30' } ] },
    };
  }

  function getShiftConfig() {
    let cfg = null;
    try { const s = localStorage.getItem(SHIFT_CONFIG_KEY); cfg = s ? JSON.parse(s) : null; } catch (e) { cfg = null; }
    if (!cfg) {
      cfg = defaultShiftConfig();
      try { const old = getShiftData(); cfg.frueh.count = parseInt(old.frueh) || 0; cfg.mittel.count = parseInt(old.mittel) || 0; cfg.spaet.count = parseInt(old.spaet) || 0; } catch (e) {}
      setShiftConfig(cfg);
    }
    const def = defaultShiftConfig();
    ['frueh', 'mittel', 'spaet'].forEach(k => { cfg[k] = Object.assign({}, def[k], cfg[k] || {}); if (!Array.isArray(cfg[k].breaks)) cfg[k].breaks = []; });
    return cfg;
  }
  function setShiftConfig(cfg) { try { localStorage.setItem(SHIFT_CONFIG_KEY, JSON.stringify(cfg)); } catch (e) {} }

  function timeToMin(t) { const p = String(t || '').split(':'); return (parseInt(p[0]) || 0) * 60 + (parseInt(p[1]) || 0); }
  function inWindow(nowMin, startMin, endMin) { return (endMin > startMin) ? (nowMin >= startMin && nowMin < endMin) : (nowMin >= startMin || nowMin < endMin); }

  function isShiftPresent(shift, nowMin) {
    if (!shift || (parseInt(shift.count) || 0) <= 0) return false;
    if (!inWindow(nowMin, timeToMin(shift.start), timeToMin(shift.end))) return false;
    if (SUBTRACT_BREAKS_FROM_PRESENCE && Array.isArray(shift.breaks)) {
      for (const b of shift.breaks) { if (inWindow(nowMin, timeToMin(b.start), timeToMin(b.end))) return false; }
    }
    return true;
  }

  function getPresentWorkers() {
    const cfg = getShiftConfig();
    const now = new Date(); const nowMin = now.getHours() * 60 + now.getMinutes();
    let sum = 0;
    ['frueh', 'mittel', 'spaet'].forEach(k => { if (isShiftPresent(cfg[k], nowMin)) sum += parseInt(cfg[k].count) || 0; });
    return sum;
  }
  // Wird vom Dashboard / CSV-Export genutzt
  function getCombinedAvailableWorkers() { return getPresentWorkers(); }

  // ---- Header-Badges (Früh / Mittag / Spät) ----
  function refreshShiftBadgeInputs() {
    const cfg = getShiftConfig();
    ['frueh', 'mittel', 'spaet'].forEach(k => {
      const inp = document.getElementById('shiftinp-' + k);
      if (inp && document.activeElement !== inp) inp.value = parseInt(cfg[k].count) || 0;
    });
    const tot = document.getElementById('shift-total-text');
    const totSub = document.getElementById('shift-total-sub');
    const present = getPresentWorkers();
    const cfg2 = getShiftConfig();
    const totalAll = ['frueh','mittel','spaet'].reduce((s,k) => s + (parseInt(cfg2[k].count)||0), 0);
    if (tot) { tot.textContent = present + ' MA'; }
    if (totSub) { totSub.textContent = 'von ' + totalAll + ' MA'; }
  }

  function addCustomShiftBadges() {
    if (!appSettings.showHeader) return;
    const dateText = document.querySelector('#TEXT_date');
    if (!dateText) return;                       // nur der echte Dashboard-Header hat #TEXT_date
    const header = dateText.closest('g#header') || dateText.parentNode;
    if (!header) return;
    const old = document.getElementById('custom-shift-badges-group');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    const cfg = getShiftConfig();
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('id', 'custom-shift-badges-group');
    const START_X = 665, TOP_Y = 46, W = 120, H = 46, GAP = 12;
    const SHIFTS = [ { key: 'frueh', label: 'Früh' }, { key: 'mittel', label: 'Mittag' }, { key: 'spaet', label: 'Spät' } ];

    SHIFTS.forEach((sh, i) => {
      const x = START_X + i * (W + GAP);
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('transform', `translate(${x}, ${TOP_Y})`);
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('width', W); r.setAttribute('height', H); r.setAttribute('rx', '4'); r.setAttribute('fill', 'var(--ma-primary)');
      g.appendChild(r);
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', 12); t.setAttribute('y', 19); t.setAttribute('fill', '#ffffff'); t.setAttribute('font-size', '14'); t.setAttribute('font-weight', 'bold'); t.setAttribute('font-family', 'Segoe UI, Tahoma, sans-serif');
      t.textContent = sh.label; g.appendChild(t);
      const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
      fo.setAttribute('x', 10); fo.setAttribute('y', 24); fo.setAttribute('width', W - 20); fo.setAttribute('height', 20);
      const inp = document.createElement('input');
      inp.setAttribute('type', 'number'); inp.setAttribute('min', '0'); inp.id = 'shiftinp-' + sh.key;
      inp.value = parseInt(cfg[sh.key].count) || 0;
      inp.style.cssText = 'width:100%;height:20px;box-sizing:border-box;border:none;border-radius:3px;text-align:center;font-weight:bold;font-size:14px;color:var(--ma-primary);background:#ffffff;';
      inp.addEventListener('input', (e) => {
        const c = getShiftConfig(); c[sh.key].count = parseInt(e.target.value) || 0; setShiftConfig(c);
        refreshShiftBadgeInputs();
        if (currentOpenPopup === 'DASHBOARD') updateDashboardLive();
      });
      inp.addEventListener('click', (e) => e.stopPropagation());
      fo.appendChild(inp); g.appendChild(fo); group.appendChild(g);
    });

    // Anwesend-Box (weisser Hintergrund, deutlich sichtbar)
    const totX = START_X + 3 * (W + GAP) + 6;
    const BOX_W = 110, BOX_H = 46;
    const totBox = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    // vertikal zentriert zur Badge-Mitte
    const BOX_TOP_Y = TOP_Y + (H - BOX_H) / 2;
    totBox.setAttribute('transform', `translate(${totX}, ${BOX_TOP_Y})`);

    const totBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    totBg.setAttribute('width', BOX_W); totBg.setAttribute('height', BOX_H); totBg.setAttribute('rx', '4');
    totBg.setAttribute('fill', 'rgba(255,255,255,0.85)');
    totBg.setAttribute('stroke', 'rgba(0,0,0,0.12)'); totBg.setAttribute('stroke-width', '1');
    totBox.appendChild(totBg);

    const totLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    totLabel.setAttribute('x', BOX_W / 2); totLabel.setAttribute('y', 12);
    totLabel.setAttribute('text-anchor', 'middle');
    totLabel.setAttribute('fill', 'var(--ma-primary)'); totLabel.setAttribute('font-size', '9');
    totLabel.setAttribute('font-weight', '700'); totLabel.setAttribute('letter-spacing', '0.6');
    totLabel.setAttribute('font-family', 'Segoe UI, Tahoma, sans-serif');
    totLabel.textContent = 'ANWESEND';
    totBox.appendChild(totLabel);

    const tot = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    tot.setAttribute('id', 'shift-total-text');
    tot.setAttribute('x', BOX_W / 2); tot.setAttribute('y', 30);
    tot.setAttribute('text-anchor', 'middle');
    tot.setAttribute('fill', 'var(--ma-primary)'); tot.setAttribute('font-size', '18');
    tot.setAttribute('font-weight', 'bold'); tot.setAttribute('font-family', 'Segoe UI, Tahoma, sans-serif');
    totBox.appendChild(tot);

    const totSub = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    totSub.setAttribute('id', 'shift-total-sub');
    totSub.setAttribute('x', BOX_W / 2); totSub.setAttribute('y', 42);
    totSub.setAttribute('text-anchor', 'middle');
    totSub.setAttribute('fill', '#888'); totSub.setAttribute('font-size', '9');
    totSub.setAttribute('font-family', 'Segoe UI, Tahoma, sans-serif');
    totBox.appendChild(totSub);

    group.appendChild(totBox);
    header.appendChild(group);
    refreshShiftBadgeInputs();
  }

  // ---- Schicht-Editor (Anzahl, von-bis, Pausen) ----
  function buildBreakRow(b) {
    const row = document.createElement('div');
    row.className = 'shift-break-row';
    row.style.cssText = 'display:flex; align-items:center; gap:4px; margin-bottom:6px;';
    row.innerHTML = `
      <input type="time" class="ma-input br-start" value="${(b && b.start) || '12:00'}" style="padding:4px;">
      <span style="color:#666;">-</span>
      <input type="time" class="ma-input br-end" value="${(b && b.end) || '12:30'}" style="padding:4px;">
      <button type="button" class="br-del" title="Pause entfernen" style="border:none;background:#f8d7da;color:#ee5555;border-radius:4px;width:28px;height:28px;cursor:pointer;font-weight:bold;flex-shrink:0;">×</button>`;
    row.querySelector('.br-del').addEventListener('click', () => row.remove());
    return row;
  }

  // Gantt-Zeitleiste: eine Leiste pro Schicht (von-bis + Pausen + Jetzt-Linie)
  function buildShiftTimeline(cfg) {
    const COLORS = { frueh: '#10c32b', mittel: '#ffa500', spaet: '#3b82c4' };
    const LABELS = { frueh: 'Früh', mittel: 'Mittag', spaet: 'Spät' };
    const keys = ['frueh', 'mittel', 'spaet'];
    // Achsenbereich automatisch bestimmen (auf volle Stunde, mit Puffer)
    let minH = 24, maxH = 0;
    keys.forEach(k => {
      const s = timeToMin(cfg[k].start) / 60, e = timeToMin(cfg[k].end) / 60;
      minH = Math.min(minH, Math.floor(s)); maxH = Math.max(maxH, Math.ceil(e > s ? e : 24));
    });
    if (minH >= maxH) { minH = 6; maxH = 22; }
    minH = Math.max(0, minH - 1); maxH = Math.min(24, maxH + 1);
    const range = (maxH - minH) * 60;
    const pct = (min) => ((min - minH * 60) / range) * 100;

    // Stunden-Ticks
    let ticks = '';
    for (let h = minH; h <= maxH; h++) {
      const left = pct(h * 60);
      ticks += `<div style="position:absolute; left:${left}%; top:0; bottom:0; width:1px; background:rgba(0,0,0,0.07);"></div>`;
      ticks += `<div style="position:absolute; left:${left}%; bottom:-16px; transform:translateX(-50%); font-size:9px; color:#999;">${String(h).padStart(2,'0')}</div>`;
    }
    // Jetzt-Linie
    const now = new Date(); const nowMin = now.getHours() * 60 + now.getMinutes();
    let nowLine = '';
    if (nowMin >= minH * 60 && nowMin <= maxH * 60) {
      nowLine = `<div style="position:absolute; left:${pct(nowMin)}%; top:-4px; bottom:-4px; width:2px; background:#ee5555; z-index:5;"><div style="position:absolute; top:-14px; left:50%; transform:translateX(-50%); font-size:8px; font-weight:bold; color:#ee5555; white-space:nowrap;">jetzt</div></div>`;
    }
    // Schicht-Zeilen
    let rows = '';
    keys.forEach(k => {
      const s = timeToMin(cfg[k].start), e0 = timeToMin(cfg[k].end);
      const e = e0 > s ? e0 : maxH * 60;
      const cnt = parseInt(cfg[k].count) || 0;
      let bar = '';
      if (cnt > 0 && e > s) {
        // Pausen als Lücken/Streifen
        let breaksHtml = '';
        (cfg[k].breaks || []).forEach(b => {
          const bs = timeToMin(b.start), be = timeToMin(b.end);
          if (be > bs && be > s && bs < e) {
            const l = pct(Math.max(bs, s)), w = pct(Math.min(be, e)) - pct(Math.max(bs, s));
            breaksHtml += `<div style="position:absolute; left:${l}%; width:${w}%; top:0; bottom:0; background:repeating-linear-gradient(45deg, rgba(0,0,0,0.35), rgba(0,0,0,0.35) 3px, transparent 3px, transparent 6px);" title="Pause ${b.start}-${b.end}"></div>`;
          }
        });
        bar = `<div style="position:absolute; left:${pct(s)}%; width:${pct(e)-pct(s)}%; top:4px; bottom:4px; background:${COLORS[k]}; border-radius:4px; box-shadow:0 1px 2px rgba(0,0,0,0.2); overflow:hidden;">
                 <span style="position:absolute; left:6px; top:50%; transform:translateY(-50%); color:#fff; font-size:10px; font-weight:700;">${cnt} MA</span>
                 ${breaksHtml}
               </div>`;
      }
      rows += `<div style="display:flex; align-items:center; margin-bottom:6px;">
                 <div style="width:55px; flex-shrink:0; font-size:11px; font-weight:700; color:${COLORS[k]};">${LABELS[k]}</div>
                 <div style="position:relative; flex:1; height:26px; background:#fff; border-radius:4px; border:1px solid rgba(0,0,0,0.08);">${bar}</div>
               </div>`;
    });

    return `
      <div style="background:#f8f4ec; border-radius:8px; padding:14px 16px 26px; margin-bottom:18px; border:1px solid rgba(63,47,26,0.1);">
        <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--ma-primary); margin-bottom:10px;">📊 Schicht-Zeitleiste</div>
        <div style="position:relative;">
          ${rows}
          <div style="position:relative; height:0;">${ticks}${nowLine}</div>
        </div>
      </div>`;
  }

  function showShiftConfigModal() {
    closePopup(); currentOpenPopup = 'SHIFTCFG';
    const cfg = getShiftConfig();
    const popup = document.createElement('div'); popup.id = 'ma-badge-popup'; popup.className = 'ma-popup settings';

    const card = (key, label) => `
      <div class="ma-card" style="background: var(--ma-card);">
        <div style="color: var(--ma-primary); font-weight: bold; font-size: 14px; margin-bottom: 12px; border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 6px;">${label}</div>
        <div style="margin-bottom:10px;">
          <div style="font-size:10px; color:#555; text-transform:uppercase; margin-bottom:3px;">Anzahl MA</div>
          <input type="number" min="0" id="sc-${key}-count" class="ma-input" value="${parseInt(cfg[key].count) || 0}" style="padding:6px;">
        </div>
        <div style="margin-bottom:10px;">
          <div style="font-size:10px; color:#555; text-transform:uppercase; margin-bottom:3px;">Arbeitszeit (von - bis)</div>
          <div style="display:flex; align-items:center; gap:4px;">
            <input type="time" id="sc-${key}-start" class="ma-input" value="${cfg[key].start}" style="padding:4px;">
            <span style="color:#666;">-</span>
            <input type="time" id="sc-${key}-end" class="ma-input" value="${cfg[key].end}" style="padding:4px;">
          </div>
        </div>
        <div>
          <div style="font-size:10px; color:#555; text-transform:uppercase; margin-bottom:5px;">Pausen</div>
          <div id="sc-${key}-breaks"></div>
          <button type="button" class="ma-btn sc-add-break" data-shift="${key}" style="padding:6px 10px; font-size:12px;">+ Pause</button>
        </div>
      </div>`;

    popup.innerHTML = `
      <div class="ma-header" style="margin-bottom:0;">
        <h2 class="ma-title">
          <svg style="width:24px;height:24px;margin-right:10px;fill:var(--ma-primary);" viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
          Schichten konfigurieren
        </h2>
        <button class="popup-close ma-close">×</button>
      </div>
      <div class="ma-body">
        <p style="font-size:12px;color:#666;margin:0 0 16px 0;">Pro Schicht Anzahl MA, Arbeitszeit und Pausen eintragen. Die verfügbaren MA werden automatisch nach Uhrzeit berechnet: die Spätschicht zählt erst ab ihrer Startzeit, und wer gerade Pause hat, wird abgezogen.</p>
        ${buildShiftTimeline(cfg)}
        <div class="ma-grid-3">
          ${card('frueh', 'Frühschicht')}
          ${card('mittel', 'Mittagschicht')}
          ${card('spaet', 'Spätschicht')}
        </div>
      </div>
      <div class="ma-footer">
        <button class="ma-btn-cancel popup-cancel">Zurück</button>
        <button class="ma-btn-save popup-save">Speichern</button>
      </div>`;
    document.body.appendChild(popup);

    ['frueh', 'mittel', 'spaet'].forEach(k => {
      const cont = popup.querySelector('#sc-' + k + '-breaks');
      (cfg[k].breaks || []).forEach(b => cont.appendChild(buildBreakRow(b)));
    });
    popup.querySelectorAll('.sc-add-break').forEach(btn => {
      btn.addEventListener('click', () => { popup.querySelector('#sc-' + btn.getAttribute('data-shift') + '-breaks').appendChild(buildBreakRow(null)); });
    });

    const back = () => showGlobalDashboard();
    popup.querySelector('.popup-close').addEventListener('click', back);
    popup.querySelector('.popup-cancel').addEventListener('click', back);

    popup.querySelector('.popup-save').addEventListener('click', () => {
      try {
        const c = getShiftConfig();
        ['frueh', 'mittel', 'spaet'].forEach(k => {
          c[k].count = parseInt(popup.querySelector('#sc-' + k + '-count').value) || 0;
          c[k].start = popup.querySelector('#sc-' + k + '-start').value || c[k].start;
          c[k].end = popup.querySelector('#sc-' + k + '-end').value || c[k].end;
          const rows = popup.querySelectorAll('#sc-' + k + '-breaks .shift-break-row');
          c[k].breaks = Array.from(rows).map(r => ({ start: r.querySelector('.br-start').value, end: r.querySelector('.br-end').value })).filter(b => b.start && b.end);
        });
        setShiftConfig(c);
        addCustomShiftBadges();
        showToast('Schichten gespeichert!');
        showGlobalDashboard();
      } catch (err) { showToast('Fehler beim Speichern!', 'error'); }
    });

    popup.addEventListener('click', (e) => e.stopPropagation());
  }

  // ============================================================================
  // HEADER SUMMARY BOXEN (Gesamtmenge / System fordert / Differenz)  — V20.0
  // ============================================================================

  function addHeaderSummaryBoxes() {
    if (!appSettings.showHeader) return;
    const dateText = document.querySelector('#TEXT_date');
    if (!dateText) return;                       // nur der echte Dashboard-Header hat #TEXT_date
    const header = dateText.closest('g#header') || dateText.parentNode;
    if (!header) return;
    const old = document.getElementById('custom-header-summary-group');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('id', 'custom-header-summary-group');

    const START_X = 1195, TOP_Y = 45, W = 190, H = 50, GAP = 12;
    const BOXES = [
      { id: 'hsum-menge', label: 'GESAMTMENGE',        value: '\u2014 St\u00fcck', accent: false },
      { id: 'hsum-ma',    label: 'SYSTEM FORDERT',     value: '\u2014 MA',         accent: true  },
      { id: 'hsum-diff',  label: 'DIFFERENZ ZU DEINEM TEAM', value: '\u2014 MA',   accent: false },
    ];

    BOXES.forEach((box, i) => {
      const x = START_X + i * (W + GAP);
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('transform', `translate(${x}, ${TOP_Y})`);

      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('width', W); r.setAttribute('height', H); r.setAttribute('rx', '5');
      r.setAttribute('fill', 'rgba(255,255,255,0.82)');
      r.setAttribute('stroke', box.accent ? 'var(--ma-primary)' : 'rgba(0,0,0,0.12)');
      r.setAttribute('stroke-width', box.accent ? '2.5' : '1');
      g.appendChild(r);

      const tLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      tLabel.setAttribute('x', W / 2); tLabel.setAttribute('y', 18);
      tLabel.setAttribute('text-anchor', 'middle');
      tLabel.setAttribute('fill', 'var(--ma-primary)');
      tLabel.setAttribute('font-size', '10');
      tLabel.setAttribute('font-weight', '700');
      tLabel.setAttribute('letter-spacing', '0.8');
      tLabel.setAttribute('font-family', 'Segoe UI, Tahoma, sans-serif');
      tLabel.textContent = box.label;
      g.appendChild(tLabel);

      const tVal = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      tVal.setAttribute('id', box.id);
      tVal.setAttribute('x', W / 2); tVal.setAttribute('y', 38);
      tVal.setAttribute('text-anchor', 'middle');
      tVal.setAttribute('fill', 'var(--ma-primary)');
      tVal.setAttribute('font-size', '22');
      tVal.setAttribute('font-weight', 'bold');
      tVal.setAttribute('font-family', 'Segoe UI, Tahoma, sans-serif');
      tVal.textContent = box.value;
      g.appendChild(tVal);

      group.appendChild(g);
    });

    header.appendChild(group);
    updateHeaderSummary();
  }

  function updateHeaderSummary() {
    const mengeEl = document.getElementById('hsum-menge');
    const maEl    = document.getElementById('hsum-ma');
    const diffEl  = document.getElementById('hsum-diff');
    if (!mengeEl || !maEl || !diffEl) return;
    try {
      const { totalWorkers, totalMenge } = getDashboardData();
      const available = getCombinedAvailableWorkers();
      mengeEl.textContent = formatNumber(totalMenge) + ' St\u00fcck';
      maEl.textContent    = totalWorkers + ' MA';
      if (available <= 0) {
        diffEl.textContent = '\u2014 MA'; diffEl.setAttribute('fill', '#999');
      } else {
        const diff = available - totalWorkers;
        if (diff < 0)      { diffEl.textContent = diff + ' MA';  diffEl.setAttribute('fill', '#ee5555'); }
        else if (diff > 0) { diffEl.textContent = '+' + diff + ' MA'; diffEl.setAttribute('fill', '#10c32b'); }
        else               { diffEl.textContent = '\u00b10 MA';  diffEl.setAttribute('fill', '#10c32b'); }
      }
    } catch(e) {}
  }

  // ============================================================================
  // GLOBALE EINSTELLUNGEN MODAL (NEUE TABS FÜR THEME UND BADGES)
  // ============================================================================
  function showGlobalSettingsModal() {
    closePopup(); currentOpenPopup = 'SETTINGS';
    const popup = document.createElement('div'); popup.id = 'ma-badge-popup'; popup.className = 'ma-popup settings';
    
    // Checkboxen für Produkte generieren
    const allProducts = getAllActiveProducts();
    let checkboxesHtml = '';
    if(allProducts.length === 0) {
        checkboxesHtml = '<div style="color:#666; font-style:italic;">Keine Stationen gefunden. Bitte warten bis das BizBoard geladen ist.</div>';
    } else {
        allProducts.forEach(p => {
            const isChecked = !appSettings.hiddenBadges.includes(p) ? 'checked' : '';
            checkboxesHtml += `
                <label class="ma-checkbox-wrapper">
                    <input type="checkbox" class="badge-toggle-cb" value="${escapeHtml(p)}" ${isChecked}> 
                    ${escapeHtml(p)}
                </label>
            `;
        });
    }

    popup.innerHTML = `
      <div class="ma-header" style="margin-bottom: 0;">
        <h2 class="ma-title">
          <svg style="width: 24px; height: 24px; margin-right: 10px; fill: var(--ma-primary);" viewBox="0 0 24 24"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.43-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>
          Globale Einstellungen
        </h2>
        <button class="popup-close ma-close">×</button>
      </div>
      
      <div class="ma-body">
        
        <div class="ma-live-section" style="background: white; border: 1px solid rgba(0,0,0,0.1);">
          <h3 class="ma-live-title" style="margin-bottom: 5px;">Aussehen & Menü</h3>
          
          <div class="ma-mb-16" style="margin-top:15px;">
             <label class="ma-input-label">Farb-Design wählen:</label>
             <select id="settings-theme" class="ma-input" style="cursor:pointer;">
                <option value="brown" ${appSettings.theme==='brown'?'selected':''}>Edles Braun / Beige (Custom)</option>
                <option value="classic" ${appSettings.theme==='classic'?'selected':''}>Klassisch (Blau / Weiß)</option>
             </select>
          </div>
          
          <div class="ma-mb-16">
             <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="settings-header" style="width:16px; height:16px; accent-color: var(--ma-primary);" ${appSettings.showHeader?'checked':''}>
                <span style="font-weight:600; font-size:13px; color: #333;">Hauptmenü (Dashboard / Kursliste) oben links einblenden</span>
             </label>
             <div style="font-size:11px; color:#666; margin-left:24px; margin-top:4px;">Wenn deaktiviert, bleibt nur dieses Zahnrad sichtbar.</div>
          </div>
        </div>

        <div class="ma-live-section" style="background: white; border: 1px solid rgba(0,0,0,0.1);">
          <h3 class="ma-live-title" style="margin-bottom: 5px;">Badges (Stationen) ein- / ausblenden</h3>
          <p style="font-size:12px; color:#666; margin-bottom:15px;">Entferne das Häkchen, wenn du bei einer bestimmten Station keine MA-Berechnung sehen möchtest.</p>
          <div style="display:flex; flex-wrap:wrap; gap:8px; max-height: 180px; overflow-y:auto; padding:10px; border:1px solid #eee; border-radius:4px; background: #fafafa;">
             ${checkboxesHtml}
          </div>
        </div>

        <div class="ma-live-section" style="background: white; border: 1px solid rgba(0,0,0,0.1);">
          <h3 class="ma-live-title" style="margin-bottom: 5px;">Pausenzeiten verwalten</h3>
          <p style="font-size:12px; color:#666; margin-bottom:15px;">Pausen werden vollautomatisch von der Restzeit abgezogen, wenn sie ins Zeitfenster eines Produkts fallen.</p>
          
          <div class="ma-grid-3">
             <div class="ma-card" style="background: var(--ma-card);">
                 <div style="color: var(--ma-primary); font-weight: bold; font-size: 13px; margin-bottom: 10px; border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 4px;">Frühschicht</div>
                 <div style="margin-bottom: 8px;">
                     <div style="font-size: 10px; color: #555; text-transform: uppercase;">1. Pause</div>
                     <div style="display: flex; align-items: center; gap: 4px;">
                         <input type="time" id="b-0-s" value="${customBreaks[0].start}" class="ma-input" style="padding: 4px;"> <span style="color:#666;">-</span> <input type="time" id="b-0-e" value="${customBreaks[0].end}" class="ma-input" style="padding: 4px;">
                     </div>
                 </div>
                 <div>
                     <div style="font-size: 10px; color: #555; text-transform: uppercase;">2. Pause</div>
                     <div style="display: flex; align-items: center; gap: 4px;">
                         <input type="time" id="b-1-s" value="${customBreaks[1].start}" class="ma-input" style="padding: 4px;"> <span style="color:#666;">-</span> <input type="time" id="b-1-e" value="${customBreaks[1].end}" class="ma-input" style="padding: 4px;">
                     </div>
                 </div>
             </div>
             
             <div class="ma-card" style="background: var(--ma-card);">
                 <div style="color: var(--ma-primary); font-weight: bold; font-size: 13px; margin-bottom: 10px; border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 4px;">Mittelschicht</div>
                 <div style="margin-bottom: 8px;">
                     <div style="font-size: 10px; color: #555; text-transform: uppercase;">1. Pause</div>
                     <div style="display: flex; align-items: center; gap: 4px;">
                         <input type="time" id="b-2-s" value="${customBreaks[2].start}" class="ma-input" style="padding: 4px;"> <span style="color:#666;">-</span> <input type="time" id="b-2-e" value="${customBreaks[2].end}" class="ma-input" style="padding: 4px;">
                     </div>
                 </div>
                 <div>
                     <div style="font-size: 10px; color: #555; text-transform: uppercase;">2. Pause</div>
                     <div style="display: flex; align-items: center; gap: 4px;">
                         <input type="time" id="b-3-s" value="${customBreaks[3].start}" class="ma-input" style="padding: 4px;"> <span style="color:#666;">-</span> <input type="time" id="b-3-e" value="${customBreaks[3].end}" class="ma-input" style="padding: 4px;">
                     </div>
                 </div>
             </div>

             <div class="ma-card" style="background: var(--ma-card);">
                 <div style="color: var(--ma-primary); font-weight: bold; font-size: 13px; margin-bottom: 10px; border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 4px;">Spätschicht</div>
                 <div style="margin-bottom: 8px;">
                     <div style="font-size: 10px; color: #555; text-transform: uppercase;">1. Pause</div>
                     <div style="display: flex; align-items: center; gap: 4px;">
                         <input type="time" id="b-4-s" value="${customBreaks[4].start}" class="ma-input" style="padding: 4px;"> <span style="color:#666;">-</span> <input type="time" id="b-4-e" value="${customBreaks[4].end}" class="ma-input" style="padding: 4px;">
                     </div>
                 </div>
                 <div>
                     <div style="font-size: 10px; color: #555; text-transform: uppercase;">2. Pause</div>
                     <div style="display: flex; align-items: center; gap: 4px;">
                         <input type="time" id="b-5-s" value="${customBreaks[5].start}" class="ma-input" style="padding: 4px;"> <span style="color:#666;">-</span> <input type="time" id="b-5-e" value="${customBreaks[5].end}" class="ma-input" style="padding: 4px;">
                     </div>
                 </div>
             </div>
          </div>
        </div>
        
        <div class="ma-live-section" style="background: #fff3cd; border: 1px solid #ffeeba; border-left: 5px solid #ffa500;">
          <h3 class="ma-live-title" style="color: #856404; border-bottom: 1px solid rgba(133, 100, 4, 0.2); margin-bottom: 5px;">System zurücksetzen</h3>
          <p style="font-size:12px; color:#666; margin-bottom:10px;">Falls etwas hängt oder du von vorne beginnen willst. Löscht alle MA-Zahlen, Einstellungen und Pausen.</p>
          <button id="btn-reset-system" class="ma-btn-danger">Alle lokalen Daten löschen</button>
        </div>
      </div>
      
      <div class="ma-footer">
        <button class="ma-btn-cancel popup-cancel">Abbrechen</button>
        <button class="ma-btn-save popup-save">Speichern</button>
      </div>
    `;
    document.body.appendChild(popup);

    // Reset Logic
    document.getElementById('btn-reset-system').addEventListener('click', () => {
        if(confirm('Möchtest du wirklich ALLE gespeicherten Daten (Produkt-Einstellungen, Mitarbeiter-Verteilung und Pausenzeiten) unwiderruflich löschen?')) {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(AVAILABLE_WORKERS_KEY);
            localStorage.removeItem(GLOBAL_BREAKS_KEY);
            localStorage.removeItem(APP_SETTINGS_KEY);
            alert("Daten gelöscht. Die Seite wird neu geladen.");
            location.reload();
        }
    });

    popup.querySelector('.popup-close').addEventListener('click', closePopup);
    popup.querySelector('.popup-cancel').addEventListener('click', closePopup);
    
    // Save Logic
    popup.querySelector('.popup-save').addEventListener('click', () => {
      try {
        // 1. Pausen Speichern
        customBreaks[0].start = document.getElementById('b-0-s').value; customBreaks[0].end = document.getElementById('b-0-e').value;
        customBreaks[1].start = document.getElementById('b-1-s').value; customBreaks[1].end = document.getElementById('b-1-e').value;
        customBreaks[2].start = document.getElementById('b-2-s').value; customBreaks[2].end = document.getElementById('b-2-e').value;
        customBreaks[3].start = document.getElementById('b-3-s').value; customBreaks[3].end = document.getElementById('b-3-e').value;
        customBreaks[4].start = document.getElementById('b-4-s').value; customBreaks[4].end = document.getElementById('b-4-e').value;
        customBreaks[5].start = document.getElementById('b-5-s').value; customBreaks[5].end = document.getElementById('b-5-e').value;
        saveGlobalBreaks();
        
        // 2. App Settings Speichern (Theme, Header, Hidden Badges)
        appSettings.theme = document.getElementById('settings-theme').value;
        appSettings.showHeader = document.getElementById('settings-header').checked;
        
        // Finde alle Checkboxen, die NICHT markiert sind (diese sollen versteckt werden)
        const unselectedBoxes = Array.from(popup.querySelectorAll('.badge-toggle-cb:not(:checked)'));
        appSettings.hiddenBadges = unselectedBoxes.map(cb => cb.value);
        saveAppSettings();

        closePopup(); 
        
        // Alles neu rendern mit neuen Einstellungen
        addAddonBranding();
        addWorkerBadges(); 
        showToast('Globale Einstellungen erfolgreich aktualisiert!'); 
      } catch (err) {
        log("Save error", err);
        showToast('Fehler beim Speichern!', 'error');
      }
    });
    
    popup.addEventListener('click', (e) => e.stopPropagation());
  }

  // ============================================================================
  // KURSLISTE MODAL (100% IFRAME)
  // ============================================================================
  function showKurslisteModal() {
    closePopup(); currentOpenPopup = 'KURSLISTE';
    const urls = getDynamicKurslisteUrls();
    const popup = document.createElement('div'); popup.id = 'ma-badge-popup';
    popup.style.cssText = `position: fixed; top: 5%; left: 5%; right: 5%; bottom: 5%; background: var(--ma-bg); border: 2px solid var(--ma-primary); border-radius: 4px; box-shadow: 0 10px 50px rgba(0,0,0,0.6); z-index: 99999; display: flex; flex-direction: column; overflow: hidden;`;
    popup.innerHTML = `
      <div class="ma-header" style="margin-bottom: 0;">
        <h2 class="ma-title" style="margin: 0; color: var(--ma-primary);"><svg style="width: 24px; height: 24px; margin-right: 10px; fill: var(--ma-primary); vertical-align: middle;" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>Kursliste (${urls.displayDate})</h2>
        <div style="display: flex; align-items: center; gap: 15px;">
          <a href="${urls.downloadUrl}" style="padding: 8px 16px; background: var(--ma-primary); color: white; text-decoration: none; border-radius: 4px; font-size: 13px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">Download</a>
          <a href="${urls.externalUrl}" target="_blank" style="font-size: 14px; font-weight: bold; color: var(--ma-primary); text-decoration: underline;">Extern öffnen</a>
          <button class="popup-close ma-close" aria-label="Schließen">×</button>
        </div>
      </div>
      <div style="flex-grow: 1; width: 100%; height: 100%; background: white;">
        <iframe src="${urls.embedUrl}" width="100%" height="100%" frameborder="0" scrolling="no" allowfullscreen title="Kursliste"></iframe>
      </div>`;
    document.body.appendChild(popup);
    popup.querySelector('.popup-close').addEventListener('click', closePopup);
    popup.addEventListener('click', (e) => e.stopPropagation());
  }

  // ============================================================================
  // CSV EXPORT FUNKTION
  // ============================================================================
  function exportDashboardCSV() {
    const { data } = getDashboardData();
    const availableWorkers = getCombinedAvailableWorkers();
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Station/Produkt,Menge,Faktor,Zeitfenster,Restzeit,Bedarf (Optimal),Verteilung\n";

    data.forEach(item => {
        const { productName, val, info, allocated } = item;
        let dist = availableWorkers > 0 ? allocated : "-";
        let row = `"${productName}",${val},${info.faktor},"${info.startTime}-${info.deadline}","${formatRestzeit(info.restMinutes)}",${info.workersNeeded},${dist}`;
        csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Personalverteilung_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click(); document.body.removeChild(link);
    showToast("CSV erfolgreich exportiert!");
  }

  // ============================================================================
  // DASHBOARD & LOGIK (SOLL vs IST VERTEILUNG)
  // ============================================================================
  function showGlobalDashboard() {
    closePopup(); currentOpenPopup = 'DASHBOARD';
    const popup = document.createElement('div'); popup.id = 'ma-badge-popup'; popup.className = 'ma-popup dashboard';
    const shiftData = getShiftData(); const currentShiftVal = shiftData[shiftData.currentShift] || '';

    popup.innerHTML = `
      <div class="ma-header" style="margin-bottom: 0;">
        <h2 class="ma-title">
          <svg style="width: 24px; height: 24px; margin-right: 10px; fill: var(--ma-primary);" viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
          Personal-Verteiler
        </h2>
        <div style="display: flex; align-items: center; gap: 15px;">
            <div style="display: flex; align-items: center; gap: 12px; background: white; padding: 6px 14px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.2);">
                <span style="font-weight:700; font-size:12px; color:#666; text-transform:uppercase;">Anwesend jetzt</span>
                <span id="ma-dash-present" style="font-weight:bold; font-size:18px; color:var(--ma-primary);">0</span>
                <span style="color:#666; font-size:13px;">MA</span>
                <button id="btn-shift-config" class="ma-btn-action" style="padding:8px 14px;"><svg style="width:16px;height:16px;fill:currentColor" viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>Schichten</button>
            </div>
            <button class="popup-close ma-close" aria-label="Schließen">×</button>
        </div>
      </div>
      
      <div class="ma-body">
          <div style="border: 1px solid rgba(0,0,0,0.1); border-radius: 4px; background: white;">
            <table class="ma-table">
              <thead>
                <tr><th>Station / Produkt</th><th>Menge</th><th>Restzeit</th><th style="border-left: 1px solid #eee;">Bedarf (Optimal)</th><th style="background: var(--ma-primary); color: white;">Deine Verteilung</th></tr>
              </thead>
              <tbody id="ma-dashboard-tbody"></tbody>
            </table>
          </div>
      </div>
      
      <div class="ma-footer" style="flex-direction: column; align-items: stretch; border-top: 1px solid rgba(0,0,0,0.1); padding-top: 16px; gap: 16px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px;">
            <div style="padding: 12px; background: white; border-radius: 4px; text-align: center; border: 1px solid rgba(0,0,0,0.1); box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                <div style="font-weight: 600; color: #666; font-size: 11px; text-transform: uppercase;">Gesamtmenge</div>
                <div id="ma-dashboard-total-menge" style="font-size: 20px; font-weight: bold; color: #222; margin-top: 5px;">0</div>
            </div>
            <div style="padding: 12px; background: var(--ma-card); border-radius: 4px; text-align: center; border: 2px solid var(--ma-primary); box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                <div style="font-weight: 600; color: var(--ma-primary); font-size: 11px; text-transform: uppercase;">System fordert</div>
                <div id="ma-dashboard-total-workers" style="font-size: 24px; font-weight: bold; color: var(--ma-primary); margin-top: 5px;">0 MA</div>
            </div>
            <div style="padding: 12px; background: white; border-radius: 4px; text-align: center; border: 1px solid rgba(0,0,0,0.1); box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                <div style="font-weight: 600; color: #666; font-size: 11px; text-transform: uppercase;">Differenz zu deinem Team</div>
                <div id="ma-dashboard-diff" style="font-size: 24px; font-weight: bold; color: #222; margin-top: 5px;">- MA</div>
            </div>
        </div>
        <div style="display: flex; justify-content: flex-start;">
            <button id="btn-export-csv" class="ma-btn-action"><svg style="width:16px;height:16px;fill:currentColor" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>Als CSV exportieren</button>
        </div>
      </div>
    `;
    document.body.appendChild(popup); 
    
    const btnShiftCfg = document.getElementById('btn-shift-config');
    if (btnShiftCfg) btnShiftCfg.addEventListener('click', showShiftConfigModal);

    document.getElementById('btn-export-csv').addEventListener('click', exportDashboardCSV);

    updateDashboardLive();
    popup.querySelector('.popup-close').addEventListener('click', closePopup);
    popup.addEventListener('click', (e) => e.stopPropagation());
  }

  function getDashboardData() {
    const data = []; let totalWorkers = 0; let totalMenge = 0;
    document.querySelectorAll('g[data-ma-badge]').forEach(badge => {
      const name = badge.getAttribute('data-product-name'); 
      const val = parseInt(badge.ownerSVGElement.querySelector(`#TEXT_${badge.getAttribute('data-ma-badge')}_val`).textContent.trim());
      const info = calculateInfo(val, name);
      if (info) { totalWorkers += info.workersNeeded; totalMenge += val; data.push({ productName: name, val, info, allocated: 0 }); }
    });
    return { data, totalWorkers, totalMenge };
  }

  function updateDashboardLive() {
    const tbody = document.getElementById('ma-dashboard-tbody'); if (!tbody) return;
    const { data, totalWorkers, totalMenge } = getDashboardData();
    const availableWorkers = getCombinedAvailableWorkers();
    { const _pe = document.getElementById('ma-dash-present'); if (_pe) _pe.textContent = availableWorkers; }
    updateHeaderSummary();

    if (availableWorkers > 0 && data.length > 0) {
        let totalExactNeeded = data.reduce((sum, item) => sum + item.info.exactWorkersNeeded, 0);
        let remainingAvailable = availableWorkers;
        data.forEach(item => {
            if (totalExactNeeded > 0) {
                let share = (item.info.exactWorkersNeeded / totalExactNeeded) * availableWorkers;
                item.allocated = Math.floor(share); item.remainder = share - item.allocated; remainingAvailable -= item.allocated;
            } else { item.allocated = 0; item.remainder = 0; }
        });
        data.sort((a, b) => b.remainder - a.remainder);
        for(let i = 0; i < remainingAvailable && i < data.length; i++) { data[i].allocated++; }
    }

    data.sort((a, b) => b.info.workersNeeded - a.info.workersNeeded);
    let rowsHtml = '';
    if (data.length === 0) {
      rowsHtml = `<tr><td colspan="5" style="text-align:center; padding: 20px; color: #666;">Keine aktiven Produkte mit Werten.</td></tr>`;
    } else {
      data.forEach(item => {
        const { productName, val, info, allocated } = item;
        const faktorHtml = info.faktor !== 1.0 ? `<span class="ma-faktor-text">x${info.faktor}</span>` : '';
        let allocHtml = '';
        if (availableWorkers <= 0) {
            allocHtml = `<span style="color: #999; font-size: 13px; font-style: italic;">Bitte MA eintragen</span>`;
        } else {
            let allocClass = 'ma-alloc-ok'; 
            if (allocated < info.workersNeeded) allocClass = 'ma-alloc-crit'; else if (allocated === info.workersNeeded) allocClass = 'ma-alloc-ok'; 
            allocHtml = `<span class="ma-alloc-pill ${allocClass}">${allocated} MA</span>`;
            let diff = allocated - info.workersNeeded;
            if(diff < 0) { allocHtml += ` <span style="font-size: 12px; color: #ee5555; margin-left: 8px; font-weight: bold;">${diff}</span>`; } 
            else if (diff > 0) { allocHtml += ` <span style="font-size: 12px; color: #10c32b; margin-left: 8px; font-weight: bold;">+${diff}</span>`; }
        }
        rowsHtml += `<tr><td><strong>${escapeHtml(productName)}</strong></td><td>${formatNumber(val)} ${faktorHtml}</td><td style="color: #666;">${formatRestzeit(info.restMinutes)}</td><td style="border-left: 1px solid #eee;"><span class="ma-badge-pill" style="background: ${getBadgeColor(info.workersNeeded)}">${info.workersNeeded} MA</span></td><td style="background: var(--ma-card); border-left: 1px solid #ddd;">${allocHtml}</td></tr>`;
      });
    }

    tbody.innerHTML = rowsHtml;
    document.getElementById('ma-dashboard-total-workers').textContent = `${totalWorkers} MA`;
    document.getElementById('ma-dashboard-total-menge').textContent = `${formatNumber(totalMenge)} Stück`;
    
    const diffElem = document.getElementById('ma-dashboard-diff');
    if (availableWorkers > 0) {
        let diff = availableWorkers - totalWorkers;
        if (diff < 0) { diffElem.textContent = `${diff} MA (Zu wenig)`; diffElem.style.color = "#ee5555"; } 
        else if (diff > 0) { diffElem.textContent = `+${diff} MA (Überschuss)`; diffElem.style.color = "#10c32b"; } 
        else { diffElem.textContent = `Perfekt besetzt`; diffElem.style.color = "#10c32b"; }
    } else { diffElem.textContent = "- MA"; diffElem.style.color = "#222"; }
  }

  // ============================================================================
  // BADGE RENDERING (Mit Filter-Logik)
  // ============================================================================
  function addWorkerBadges() {
    try {
      document.querySelectorAll('g[data-ma-badge]').forEach(b => { try { b.remove(); } catch (e) {} });
      const allBgRects = document.querySelectorAll('rect[id$="_bg"]');
      if (allBgRects.length) {
        const svg = allBgRects[0].ownerSVGElement || allBgRects[0].closest('svg');
        if (svg && !svg.querySelector('#ma-badge-shadow')) {
          const defs = svg.querySelector('defs') || svg.insertBefore(document.createElementNS('http://www.w3.org/2000/svg', 'defs'), svg.firstChild);
          const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
          filter.setAttribute('id', 'ma-badge-shadow'); filter.setAttribute('x', '-20%'); filter.setAttribute('y', '-20%'); filter.setAttribute('width', '140%'); filter.setAttribute('height', '140%');
          filter.innerHTML = '<feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.18"/>';
          defs.appendChild(filter);
        }
      }
      allBgRects.forEach((rect) => {
        try {
          const id = rect.id; if (!id) return;
          const svg = rect.ownerSVGElement || rect.closest('svg'); if (!svg) return;
          const prefix = id.replace('_bg', '');
          const titleElem = svg.querySelector(`#TEXT_${prefix}_title`);
          const valElem = svg.querySelector(`#TEXT_${prefix}_val`);
          if (!titleElem || !valElem) return;
          const name = titleElem.textContent.trim();
          const value = parseFloat(valElem.textContent.trim());
          if (!name || name.toLowerCase() === 'title' || isNaN(value) || value < 0) return;
          
          // NEU: HIER WIRD GEPRÜFT, OB DAS BADGE AUSGEBLENDET WURDE!
          if (appSettings.hiddenBadges.includes(name)) return;

          const info = calculateInfo(value, name);
          if (!info) return;
          addBadgeToRect(svg, rect, parseFloat(rect.getAttribute('y')) || 0, parseFloat(rect.getAttribute('height')) || 135, info.workersNeeded, name, prefix);
        } catch (e) {}
      });
    } catch (e) { log('Error in addWorkerBadges', e); }
  }

  function addBadgeToRect(svg, rect, rectY, rectHeight, workers, productName, prefix) {
    const bgColor = getBadgeColor(workers);
    const badgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    badgeGroup.setAttribute('data-ma-badge', prefix);
    badgeGroup.setAttribute('data-product-name', productName);
    badgeGroup.style.cursor = 'pointer'; badgeGroup.style.pointerEvents = 'all';

    const badgeX = 10, badgeY = rectY + rectHeight - 38;
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', badgeX); bgRect.setAttribute('y', badgeY); bgRect.setAttribute('width', '90'); bgRect.setAttribute('height', '34'); bgRect.setAttribute('rx', '4'); bgRect.setAttribute('fill', bgColor); bgRect.setAttribute('stroke', 'white'); bgRect.setAttribute('stroke-width', '2'); bgRect.setAttribute('filter', 'url(#ma-badge-shadow)');
    badgeGroup.appendChild(bgRect);

    const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    iconPath.setAttribute('d', 'M224 256c70.7 0 128-57.3 128-128S294.7 0 224 0 96 57.3 96 128s57.3 128 128 128zm89.6 32h-16.7c-22.2 10.2-46.9 16-72.9 16s-50.6-5.8-72.9-16h-16.7C60.2 288 0 348.2 0 422.4V464c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48v-41.6c0-74.2-60.2-134.4-134.4-134.4z');
    iconPath.setAttribute('fill', 'white');
    const iconGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    iconGroup.setAttribute('transform', `translate(${badgeX + 8},${badgeY + 8}) scale(0.04)`);
    iconGroup.appendChild(iconPath);
    badgeGroup.appendChild(iconGroup);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', badgeX + 32); text.setAttribute('y', badgeY + 22); text.setAttribute('font-size', '16'); text.setAttribute('font-weight', '700'); text.setAttribute('fill', 'white'); text.setAttribute('font-family', 'Segoe UI, Roboto, Arial, sans-serif'); text.textContent = `${workers} MA`;
    badgeGroup.appendChild(text);

    svg.appendChild(badgeGroup);
  }

  // ============================================================================
  // SETTINGS POPUP (PRODUKT-FENSTER)
  // ============================================================================
  function updatePopupInfoLive(productName, productValue, liveValues) {
    const info = calculateInfo(productValue, productName, liveValues);
    if (!info) return;
    const el = (id) => document.getElementById(id);
    if (el('infoStart')) el('infoStart').textContent = info.startTime;
    if (el('infoRestzeit')) el('infoRestzeit').textContent = formatRestzeit(info.restMinutes);
    if (el('infoWert')) el('infoWert').textContent = formatNumber(info.productValue);
    if (el('infoFaktor')) el('infoFaktor').textContent = info.faktor;
    if (el('infoAdjusted')) el('infoAdjusted').textContent = formatNumber(info.adjustedValue);
    if (el('infoKapazitaet')) el('infoKapazitaet').textContent = formatNumber(info.capacityPerWorker);
    if (el('infoWorkersNeeded')) { el('infoWorkersNeeded').textContent = info.workersNeeded; }
    if (el('infoFormel')) { el('infoFormel').innerHTML = `<div class="ma-formel" style="background:rgba(255,255,255,0.14);color:#fff;">(${formatNumber(info.productValue)} × ${info.faktor}) ÷ ${formatNumber(info.capacityPerWorker)} = <strong style="color:#fff;">${info.workersNeeded} MA</strong></div>`; }
    if (el('infoRestMit')) el('infoRestMit').textContent = formatRestzeit(info.restMinutes);
    if (el('infoMaMit')) el('infoMaMit').textContent = info.workersNeeded;
    if (el('infoRestOhne')) el('infoRestOhne').textContent = formatRestzeit(info.restMinutesNoBreak);
    if (el('infoMaOhne')) el('infoMaOhne').textContent = info.workersNeededNoBreak;
    if (el('infoPause')) el('infoPause').textContent = (info.breakMinutes||0) + ' Min';
  }

  function closePopup() {
    const popup = document.getElementById('ma-badge-popup');
    if (popup) try { popup.remove(); } catch (e) {}
    currentOpenPopup = null; currentPopupValues = {};
  }

  function showSettingsPopup(productName, productValue) {
    closePopup(); currentOpenPopup = productName;
    const cfg = getProductConfig(productName); const info = calculateInfo(productValue, productName);
    currentPopupValues = { ...cfg };
    const popup = document.createElement('div'); popup.id = 'ma-badge-popup'; popup.className = 'ma-popup';
    
    popup.innerHTML = `
      <div class="ma-header">
        <h2 id="popup-title" class="ma-title">${escapeHtml(productName)}</h2>
        <button class="popup-close ma-close">×</button>
      </div>
      
      <div class="ma-body">

        <!-- ERGEBNIS (Hero) -->
        <div style="background:var(--ma-primary); border-radius:10px; padding:18px 20px; text-align:center; box-shadow:0 3px 8px rgba(0,0,0,0.25);">
          <div style="color:rgba(255,255,255,0.65); font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1px;">MA benötigt</div>
          <div id="infoWorkersNeeded" style="color:#fff; font-size:48px; font-weight:800; line-height:1.1; margin:2px 0;">${info ? info.workersNeeded : 0}</div>
          <div id="infoFormel"><div class="ma-formel" style="background:rgba(255,255,255,0.14); color:#fff;">(${info ? formatNumber(info.productValue) : '0'} × ${info ? info.faktor : 1.0}) ÷ ${info ? formatNumber(info.capacityPerWorker) : '0'} = <strong style="color:#fff;">${info ? info.workersNeeded : 0} MA</strong></div></div>
        </div>
        <p style="text-align:center; font-size:11px; color:#999; margin:6px 0 16px;">Live-Berechnung · Pausen werden automatisch abgezogen</p>

        <!-- ECKDATEN -->
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:18px;">
          <div class="ma-card" style="text-align:center;"><div class="ma-label">Menge</div><div class="ma-value-lg" id="infoWert">${info ? formatNumber(info.productValue) : '0'}</div></div>
          <div class="ma-card" style="text-align:center;"><div class="ma-label">Restzeit</div><div class="ma-value-lg" id="infoRestzeit">${info ? formatRestzeit(info.restMinutes) : '--'}</div></div>
          <div class="ma-card" style="text-align:center;"><div class="ma-label">Deadline</div><div class="ma-value-lg">${info ? info.deadline : '--:--'}</div></div>
        </div>

        <!-- DETAILS (einklappbar) -->
        <details style="margin-bottom:20px; background:var(--ma-card); border-radius:8px; padding:4px 14px;">
          <summary style="cursor:pointer; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--ma-primary); padding:10px 0;">▸ Berechnungs-Details (mit / ohne Pause)</summary>
          <div style="padding:4px 0 14px;">

            <!-- Vergleich mit / ohne Pause -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
              <div class="ma-card" style="text-align:center; border:2px solid var(--ma-primary);">
                <div class="ma-label" style="color:var(--ma-primary);">&#10003; Mit Pause</div>
                <div class="ma-value-lg" id="infoRestMit">${info ? formatRestzeit(info.restMinutes) : '--'}</div>
                <div style="font-size:12px; color:#666; margin-top:3px;">= <strong id="infoMaMit" style="color:var(--ma-primary); font-size:18px;">${info ? info.workersNeeded : 0}</strong> MA</div>
              </div>
              <div class="ma-card" style="text-align:center;">
                <div class="ma-label">Ohne Pause</div>
                <div class="ma-value-lg" id="infoRestOhne">${info ? formatRestzeit(info.restMinutesNoBreak) : '--'}</div>
                <div style="font-size:12px; color:#666; margin-top:3px;">= <strong id="infoMaOhne" style="color:#999; font-size:18px;">${info ? info.workersNeededNoBreak : 0}</strong> MA</div>
              </div>
            </div>

            <div class="ma-card" style="text-align:center; margin-bottom:12px; background:#f8f4ec;">
              <div class="ma-label">&#9749; Abgezogene Pause</div>
              <div class="ma-value-lg" id="infoPause">${info ? (info.breakMinutes + ' Min') : '0 Min'}</div>
            </div>

            <!-- weitere Details -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div class="ma-card"><div class="ma-label">Start</div><div class="ma-value-lg" id="infoStart">${info ? info.startTime : '--:--'}</div></div>
              <div class="ma-card"><div class="ma-label">Faktor</div><div class="ma-value-lg" id="infoFaktor">${info ? info.faktor : 1.0}</div></div>
              <div class="ma-card"><div class="ma-label">Angepasste Menge</div><div class="ma-value-lg" id="infoAdjusted">${info ? formatNumber(info.adjustedValue) : '0'}</div></div>
              <div class="ma-card"><div class="ma-label">Menge / MA / h</div><div class="ma-value-lg">${info ? formatNumber(info.unitsPerHour) : '0'}</div></div>
              <div class="ma-card" style="grid-column:1/-1;"><div class="ma-label">Kapazität pro MA (mit Pause)</div><div class="ma-value-lg" id="infoKapazitaet">${info ? formatNumber(info.capacityPerWorker) : '0'}</div></div>
            </div>
          </div>
        </details>

        <!-- TRENNER + EINSTELLUNGEN -->
        <div style="border-top:2px solid rgba(63,47,26,0.15); margin:0 -30px 18px;"></div>
        <h3 style="margin:0 0 16px; color:var(--ma-primary); font-size:14px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">&#9881;&#65039; Einstellungen</h3>

        <div class="ma-mb-16">
          <label class="ma-input-label">Schicht-Schnellauswahl</label>
          <div style="display:flex; gap:8px;">
            <button class="ma-btn schicht-btn" data-start="06:00" data-end="14:00" style="flex:1; padding:8px; font-size:13px;">Früh</button>
            <button class="ma-btn schicht-btn" data-start="10:00" data-end="18:00" style="flex:1; padding:8px; font-size:13px;">Mittel</button>
            <button class="ma-btn schicht-btn" data-start="14:00" data-end="22:00" style="flex:1; padding:8px; font-size:13px;">Spät</button>
          </div>
        </div>

        <div class="ma-mb-16">
          <label class="ma-input-label">Start-Zeit</label>
          <div class="ma-grid-2 ma-grid-gap">
            <button class="ma-btn startMode-btn ${cfg.startTimeMode === 'live' ? 'active' : ''}" data-mode="live">Live (Jetzt)</button>
            <button class="ma-btn startMode-btn ${cfg.startTimeMode === 'manual' ? 'active' : ''}" data-mode="manual">Manuell</button>
          </div>
          <input type="time" class="ma-input startTime-input" value="${cfg.startTime}" style="display:${cfg.startTimeMode === 'manual' ? 'block' : 'none'}; margin-top:8px;" />
        </div>

        <div class="ma-grid-2 ma-grid-gap ma-mb-16">
          <div><label class="ma-input-label">Menge / Stunde / MA</label><input type="number" class="ma-input unitsPerHour-input" value="${cfg.unitsPerHour}" min="50" step="50" /></div>
          <div><label class="ma-input-label">Deadline</label><input type="time" class="ma-input deadline-input" value="${cfg.deadline}" /></div>
        </div>

        <div class="ma-mb-16">
          <label class="ma-input-label">Faktor</label>
          <div class="ma-grid-2 ma-grid-gap">
            <button class="ma-btn faktor-btn ${cfg.faktor === 1.0 ? 'active' : ''}" data-faktor="1.0">Normal (1.0)</button>
            <button class="ma-btn faktor-btn ${cfg.faktor === 1.2 ? 'active' : ''}" data-faktor="1.2">+20% (1.2)</button>
          </div>
        </div>

        <div class="ma-mb-16" style="background:#f8f4ec; border-radius:8px; padding:14px; border:1px solid rgba(63,47,26,0.12);">
          <label class="ma-input-label" style="font-weight:700;">&#11015; Schwellenwert &ndash; 0 MA wenn Menge &le; X</label>
          <p style="font-size:11px; color:#888; margin:4px 0 10px;">Liegt die Menge unter oder gleich diesem Wert, werden 0 MA berechnet. 0 = immer berechnen. Kein Limit nach oben.</p>
          <div style="display:flex; align-items:center; gap:10px;">
            <input type="number" class="ma-input threshold-input" min="0" step="1" value="${cfg.minThreshold||0}" placeholder="0" style="flex:1; text-align:center; font-weight:700; font-size:18px; padding:10px;" />
            <span style="color:#666; font-size:14px;">Stk</span>
          </div>
        </div>

      </div>

      
<div class="ma-footer">
        <button class="ma-btn-cancel popup-cancel">Abbrechen</button>
        <button class="ma-btn-save popup-save">Speichern</button>
      </div>`;
    
    document.body.appendChild(popup);
    
    const startModeBtns = popup.querySelectorAll('.startMode-btn'); const startInput = popup.querySelector('.startTime-input'); const deadlineInput = popup.querySelector('.deadline-input');

    popup.querySelectorAll('.schicht-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentPopupValues.startTimeMode = 'manual'; currentPopupValues.startTime = e.target.dataset.start; currentPopupValues.deadline = e.target.dataset.end;
            startModeBtns.forEach(b => b.classList.remove('active')); popup.querySelector('.startMode-btn[data-mode="manual"]').classList.add('active');
            startInput.style.display = 'block'; startInput.value = currentPopupValues.startTime; deadlineInput.value = currentPopupValues.deadline;
            updatePopupInfoLive(productName, productValue, currentPopupValues);
        });
    });

    startModeBtns.forEach(btn => btn.addEventListener('click', (e) => {
      startModeBtns.forEach(b => b.classList.remove('active')); e.target.classList.add('active');
      currentPopupValues.startTimeMode = e.target.dataset.mode; startInput.style.display = currentPopupValues.startTimeMode === 'manual' ? 'block' : 'none';
      updatePopupInfoLive(productName, productValue, currentPopupValues);
    }));
    popup.querySelectorAll('.faktor-btn').forEach(btn => btn.addEventListener('click', (e) => {
      popup.querySelectorAll('.faktor-btn').forEach(b => b.classList.remove('active')); e.target.classList.add('active');
      currentPopupValues.faktor = parseFloat(e.target.dataset.faktor); updatePopupInfoLive(productName, productValue, currentPopupValues);
    }));
    ['change', 'input'].forEach(evt => {
      startInput.addEventListener(evt, (e) => { currentPopupValues.startTime = e.target.value; updatePopupInfoLive(productName, productValue, currentPopupValues); });
      popup.querySelector('.unitsPerHour-input').addEventListener(evt, (e) => { currentPopupValues.unitsPerHour = parseInt(e.target.value)||500; updatePopupInfoLive(productName, productValue, currentPopupValues); });
      deadlineInput.addEventListener(evt, (e) => { currentPopupValues.deadline = e.target.value; updatePopupInfoLive(productName, productValue, currentPopupValues); });
    });
    
    const threshInput = popup.querySelector('.threshold-input');
    if (threshInput) threshInput.addEventListener('input', e => { const x=Math.max(0,parseInt(e.target.value)||0); currentPopupValues.minThreshold=x; updatePopupInfoLive(productName,productValue,currentPopupValues); });
    popup.querySelector('.popup-close').addEventListener('click', closePopup);
    popup.querySelector('.popup-cancel').addEventListener('click', closePopup);
    
    popup.querySelector('.popup-save').addEventListener('click', () => {
      try {
        productConfig[productName] = validateConfig(currentPopupValues); 
        saveConfig(); 
        closePopup(); 
        addWorkerBadges(); 
        showToast('Einstellungen gespeichert!'); 
      } catch (err) {
        log("Save error", err);
        showToast('Fehler beim Speichern!', 'error');
      }
    });
    
    popup.addEventListener('click', (e) => e.stopPropagation());
  }

  // ============================================================================
  // EVENT LISTENERS & OBSERVER
  // ============================================================================
  function setupClickListener() {
    document.addEventListener('click', (e) => {
      const badgeGroup = e.target.closest('g[data-ma-badge]'); if (!badgeGroup) return;
      const productName = badgeGroup.getAttribute('data-product-name');
      const valElem = badgeGroup.ownerSVGElement.querySelector(`#TEXT_${badgeGroup.getAttribute('data-ma-badge')}_val`);
      if (valElem && parseInt(valElem.textContent) >= 0) showSettingsPopup(productName, parseInt(valElem.textContent));
    }, true);
  }

  function setupKeyboardListener() { document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && currentOpenPopup) closePopup(); }); }

  function setupDebouncedObserver() {
    observer = new MutationObserver(() => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        addWorkerBadges();
        if (currentOpenPopup === 'DASHBOARD') { updateDashboardLive(); } 
        else if (currentOpenPopup && currentOpenPopup !== 'KURSLISTE' && currentOpenPopup !== 'SETTINGS') {
          document.querySelectorAll('g[data-ma-badge]').forEach(b => {
            if (b.getAttribute('data-product-name') === currentOpenPopup) {
              const parentSvg = b.ownerSVGElement || document; const vE = parentSvg.querySelector(`#TEXT_${b.getAttribute('data-ma-badge')}_val`);
              if (vE) updatePopupInfoLive(currentOpenPopup, parseInt(vE.textContent), currentPopupValues);
            }
          });
        }
      }, DEBOUNCE_DELAY);
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  function init() {
    loadConfig(); 
    loadGlobalBreaks(); 
    applyTheme(); // Setzt CSS Variablen vor dem ersten Style Inject
    injectStyles(); 
    setupClickListener(); 
    setupKeyboardListener(); 
    setupDebouncedObserver();
    
    setTimeout(() => { addWorkerBadges(); addAddonBranding(); addCustomShiftBadges(); addHeaderSummaryBoxes(); }, 900);
    setInterval(() => { addWorkerBadges(); if (!document.getElementById('addon-teamapo-branding-group')) addAddonBranding(); if (!document.getElementById('custom-shift-badges-group')) addCustomShiftBadges(); if (!document.getElementById('custom-header-summary-group')) addHeaderSummaryBoxes(); refreshShiftBadgeInputs(); updateHeaderSummary(); }, UPDATE_INTERVAL);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
