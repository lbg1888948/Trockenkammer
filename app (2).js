const PHASES = [
  {
    id: 1, name: "Aufwärmphase", duration: "Tag 1 (schnell)",
    tempMin: 35, tempMax: 40, rhMin: 75, rhMax: 85,
    freshAir: "geschlossen", circulation: "dauerhaft AN",
    woodMoistureTarget: null,
    description: "Holz gleichmäßig durchwärmen. Kein Feuchteaustausch. Rissschutz durch langsame Erwärmung.",
    warnings: ["Stirnseiten täglich auf Risse prüfen", "Frischluftklappen geschlossen halten", "Temperaturgradient max. 5°C/Stunde"],
    color: "#e8a838"
  },
  {
    id: 2, name: "Haupttrocknung", duration: "Tag 2–6 (aggressiv)",
    tempMin: 45, tempMax: 50, rhMin: 60, rhMax: 75,
    freshAir: "aktiv steuern (>75% rF: AN / <60% rF: AUS)", circulation: "dauerhaft AN",
    woodMoistureTarget: "von 74% → 20–22%",
    description: "Hauptfeuchteaustrag. Frischluft aktiv nach Luftfeuchte steuern.",
    warnings: ["Kerntemperatur max. 50°C — sonst Rissgefahr!", "Holzfeuchte alle 1–2 Tage messen", "Stirnseiten täglich kontrollieren"],
    color: "#c0392b"
  },
  {
    id: 3, name: "Feintrocknung", duration: "Tag 6–10 (aggressiv)",
    tempMin: 55, tempMax: 60, rhMin: 35, rhMax: 45,
    freshAir: "gezielt, weniger frequent", circulation: "dauerhaft AN",
    woodMoistureTarget: "von 22% → 15%",
    description: "Holz unter 20% Feuchte — Temperatur erhöhen. Rissgefahr geringer.",
    warnings: ["Sterilisationsschritt vorbereiten wenn HF bei ~15%", "Trockene Stöße kontrollieren (nicht unter 7%)"],
    color: "#8e44ad"
  },
  {
    id: "S", name: "Sterilisation (HT)", duration: "1 Tag (einmalig)",
    tempMin: 65, tempMax: 65, rhMin: null, rhMax: null,
    freshAir: "vollständig geschlossen", circulation: "dauerhaft AN",
    woodMoistureTarget: "bei ~15% HF einleiten", kernTarget: 60, kernDuration: 30,
    description: "60°C Kerntemperatur für 30 Minuten. Alle Schädlinge werden abgetötet.",
    warnings: ["Kerntemperatursonde mind. 10cm tief einstechen", "Erst wenn Kern 60°C zeigt → Timer 30 Min starten", "Uhrzeit Start + Ende protokollieren"],
    color: "#16a085", special: true
  },
  {
    id: 4, name: "Endkonditionierung", duration: "Tag 10–12 (aggressiv)",
    tempMin: 60, tempMax: 65, rhMin: 20, rhMax: 25,
    freshAir: "minimal bis geschlossen", circulation: "AN",
    woodMoistureTarget: "von 15% → 8–9% (Ziel!)",
    description: "Zielfeuchte 8–9% erreichen. Bei Erreichen sofort Temperatur reduzieren.",
    warnings: ["Bei 8–9% HF sofort Temperatur runter", "Langsam auf Raumtemperatur abkühlen lassen"],
    color: "#2980b9"
  }
];

const INITIAL_LOG = [
  { temp:"26",   rh:"95", wm:"92", kern:"26",   userNote:"",                                                                                    timestamp:"14.06.2025 16:00", phaseId:1, note:"Kammer erwärmt sich langsam → normal bei kaltem Start." },
  { temp:"32",   rh:"91", wm:"90", kern:"27.2", userNote:"",                                                                                    timestamp:"14.06.2025 16:30", phaseId:1, note:"Werte im normalen Bereich." },
  { temp:"40",   rh:"87", wm:"87", kern:"28",   userNote:"",                                                                                    timestamp:"14.06.2025 17:00", phaseId:1, note:"Werte im normalen Bereich." },
  { temp:"48.5", rh:"99", wm:"92", kern:"47",   userNote:"",                                                                                    timestamp:"15.06.2025 12:00", phaseId:2, note:"Luftfeuchte sehr hoch — Oberflächenkondensat möglich." },
  { temp:"49.5", rh:"97", wm:"92", kern:"48.5", userNote:"",                                                                                    timestamp:"15.06.2025 17:00", phaseId:2, note:"Temperatur stabil, Luftfeuchte leicht sinkend." },
  { temp:"49",   rh:"96", wm:"92", kern:"46",   userNote:"Stromausfall 03:00–09:00 Uhr. Ab 09:00 Normalbetrieb. Stufe 3.",                      timestamp:"16.06.2025 10:30", phaseId:2, note:"Kerntemperaturabfall durch Stromausfall — kein Problem." },
  { temp:"50",   rh:"94", wm:"18", kern:"48.2", userNote:"Direkte Messung im Holz — erster verlässlicher Holzfeuchte-Istwert!",                 timestamp:"16.06.2025 13:00", phaseId:2, note:"✓ Holzfeuchte 18% — echter Kernwert! Wechsel zu Phase 3 bei ≤15% — bald bereit." }
];

// ── Storage helpers ──────────────────────────────────────────────
function saveData(log, phaseId, sterilStart) {
  try {
    localStorage.setItem('tk-log',    JSON.stringify(log));
    localStorage.setItem('tk-phase',  JSON.stringify(phaseId));
    localStorage.setItem('tk-steril', sterilStart || '');
  } catch(e) { console.warn('Save failed', e); }
}

function loadData() {
  try {
    const log      = JSON.parse(localStorage.getItem('tk-log'))    || null;
    const phaseId  = JSON.parse(localStorage.getItem('tk-phase'))  || 1;
    const steril   = localStorage.getItem('tk-steril') || null;
    return { log, phaseId, steril };
  } catch(e) { return { log: null, phaseId: 1, steril: null }; }
}

// ── State ────────────────────────────────────────────────────────
let state = {
  activePhaseId: 2,
  log: [],
  sterilStart: null,
  fanSpeed: 0,
  inputs: { temp:'', rh:'', wm:'', kern:'', note:'' }
};

function init() {
  const saved = loadData();
  if (saved.log && saved.log.length > 0) {
    state.log = saved.log;
    // merge any missing initial entries
    const hasAll = INITIAL_LOG.every(ie => state.log.some(e => e.timestamp === ie.timestamp));
    if (!hasAll) {
      const existing = new Set(state.log.map(e => e.timestamp));
      const missing  = INITIAL_LOG.filter(e => !existing.has(e.timestamp));
      state.log = [...state.log, ...missing].sort((a,b) => a.timestamp < b.timestamp ? 1 : -1);
    }
  } else {
    state.log = [...INITIAL_LOG].reverse();
  }
  state.activePhaseId = saved.phaseId;
  state.sterilStart   = saved.steril || null;
  saveData(state.log, state.activePhaseId, state.sterilStart);
  render();
}

// ── Logic ────────────────────────────────────────────────────────
function getStatus(value, min, max) {
  if (value === '' || isNaN(parseFloat(value))) return 'none';
  const v = parseFloat(value);
  if (v >= min && v <= max) return 'ok';
  const t = (max - min) * 0.15;
  return (v >= min - t && v <= max + t) ? 'warn' : 'crit';
}

function getFanRecommendation(log, phaseId) {
  const relevant = log.filter(e => e.phaseId === phaseId && e.temp && e.rh).slice(0, 4);
  if (!relevant.length) return { speed: 0, color:'#7f8c8d', reason:'Noch zu wenig Messdaten.' };
  const latest = relevant[0];
  const rh   = parseFloat(latest.rh);
  const temp = parseFloat(latest.temp);
  let tempTrend = null;
  if (relevant.length >= 2) {
    const d = parseFloat(latest.temp) - parseFloat(relevant[1].temp);
    tempTrend = d > 1 ? 'rising' : d < -1 ? 'falling' : 'stable';
  }
  if (phaseId === 1)   return { speed:0, color:'#7f8c8d', reason:'Phase 1: Kein Luftaustausch — Kammer geschlossen aufheizen.' };
  if (phaseId === 'S') return { speed:0, color:'#16a085', reason:'Sterilisation: Alle Klappen geschlossen.' };
  if (phaseId === 2 || phaseId === 3) {
    if (rh > 80 && tempTrend === 'falling') return { speed:1, color:'#e8a838', reason:`rF ${rh}% aber Temperatur fällt — Stufe 1: sanft, Wärme halten.` };
    if (rh > 80)  return { speed:3, color:'#c0392b', reason:`rF ${rh}% zu hoch — Stufe 3: maximaler Feuchteaustrag.` };
    if (rh > 72)  return { speed:2, color:'#e67e22', reason:`rF ${rh}% erhöht — Stufe 2: aktiver Austausch.` };
    if (rh >= 60) return { speed: tempTrend==='falling' ? 1 : 2, color:'#27ae60', reason:`rF ${rh}% im Zielbereich — Stufe ${tempTrend==='falling'?1:2} beibehalten.` };
    return { speed:0, color:'#2980b9', reason:`rF ${rh}% niedrig — Ventilator AUS, aufwärmen.` };
  }
  if (phaseId === 4) {
    if (rh > 30) return { speed:2, color:'#e67e22', reason:`rF ${rh}% — Stufe 2 für finalen Feuchteaustrag.` };
    return { speed:1, color:'#27ae60', reason:`rF ${rh}% niedrig — Stufe 1 reicht.` };
  }
  return { speed:0, reason:'Keine Empfehlung.' };
}

function getPhaseAlert(log, phaseId) {
  const latest = log.find(e => e.phaseId === phaseId);
  if (!latest) return null;
  const wm   = parseFloat(latest.wm);
  const temp = parseFloat(latest.temp);
  const kern = parseFloat(latest.kern);
  const rh   = parseFloat(latest.rh);
  const p    = log.filter(e => e.phaseId === phaseId);

  if (phaseId === 1) {
    if (!isNaN(temp) && temp >= 35) return { level:'ready', title:'🔔 JETZT wechseln → Phase 2: Haupttrocknung', body:'Zieltemperatur erreicht — auf 45–50°C erhöhen, Frischluft aktivieren.' };
    if (!isNaN(temp) && temp >= 30) return { level:'soon',  title:'⏳ Fast bereit für Phase 2', body:`Temperatur bei ${temp}°C — noch kurz weiter heizen.` };
  }
  if (phaseId === 2) {
    if (!isNaN(wm) && wm <= 22) return { level:'ready', title:'🔔 JETZT wechseln → Phase 3: Feintrocknung', body:`Holzfeuchte bei ${wm}% — Temperatur auf 55–60°C erhöhen.` };
    if (!isNaN(wm) && wm <= 28) return { level:'soon',  title:'⏳ Phase 3 bald', body:`Holzfeuchte bei ${wm}% — Wechsel bei ≤22%.` };
  }
  if (phaseId === 3) {
    if (!isNaN(wm) && wm <= 15) return { level:'ready', title:'🔔 JETZT wechseln → Sterilisation (HT)', body:`Holzfeuchte bei ${wm}% — Kerntemperatursonde einstechen, auf 65°C.` };
    if (!isNaN(wm) && wm <= 18) return { level:'soon',  title:'⏳ Sterilisation vorbereiten', body:`Holzfeuchte bei ${wm}% — Sonde bereit halten.` };
  }
  if (phaseId === 'S') {
    if (!isNaN(kern) && kern >= 60) return { level:'soon', title:'⏱ Sterilisation läuft — 30 Min halten', body:'Nach 30 Min direkt zu Phase 4 wechseln.' };
  }
  if (phaseId === 4) {
    if (!isNaN(wm) && wm <= 9)  return { level:'done', title:'🎉 FERTIG — Zielfeuchte erreicht!', body:'Heizung drosseln, Klappen öffnen, mind. 2 Std. abkühlen.' };
    if (!isNaN(wm) && wm <= 11) return { level:'soon', title:'⏳ Fast fertig', body:`Holzfeuchte ${wm}% — Ziel 9% fast erreicht.` };
  }
  return null;
}

function analyzeEntry(entry, phase) {
  const temp = parseFloat(entry.temp), rh = parseFloat(entry.rh);
  const wm   = parseFloat(entry.wm),  kern = parseFloat(entry.kern);
  let note = '';
  if (phase.id === 1) {
    if (temp > 42) note += 'Temperatur zu hoch → Heizung drosseln. ';
    if (temp < 33) note += 'Kammer erwärmt sich langsam — normal. ';
    if (rh > 90)   note += 'Luftfeuchte sehr hoch → Kammer dichtet gut. ';
  }
  if (phase.id === 2) {
    if (rh > 80)         note += '⚠ Frischluft JETZT öffnen! ';
    if (rh < 55)         note += 'Frischluft schließen — Energie sparen. ';
    if (temp > 52)       note += '⚠ Temperatur zu hoch — Rissgefahr! ';
    if (!isNaN(wm) && wm <= 22) note += '✓ Holzfeuchte ≤22% → Phase 3 einleiten. ';
  }
  if (phase.id === 3) {
    if (!isNaN(wm) && wm <= 18) note += '→ Sterilisation vorbereiten! ';
    if (!isNaN(wm) && wm <= 15) note += '→ Sterilisation jetzt einleiten! ';
  }
  if (phase.id === 'S' && !isNaN(kern) && kern >= 60 && !state.sterilStart) {
    state.sterilStart = new Date().toLocaleTimeString('de-AT');
    note += '🟢 60°C Kern erreicht — 30 Min Timer läuft! Start: ' + state.sterilStart;
  }
  if (phase.id === 4 && !isNaN(wm) && wm <= 9) note += '🎉 ZIELFEUCHTE ERREICHT! ';
  return note || 'Werte im normalen Bereich.';
}

// ── Actions ──────────────────────────────────────────────────────
function submitEntry() {
  const temp = document.getElementById('inp-temp')?.value || '';
  const rh   = document.getElementById('inp-rh')?.value   || '';
  const wm   = document.getElementById('inp-wm')?.value   || '';
  const kern = document.getElementById('inp-kern')?.value || '';
  const note = document.getElementById('inp-note')?.value || '';
  state.inputs = { temp, rh, wm, kern, note };
  if (!temp && !rh && !wm && !kern) return;
  const phase = PHASES.find(p => p.id === state.activePhaseId);
  const now   = new Date();
  const ts    = now.toLocaleDateString('de-AT') + ' ' + now.toLocaleTimeString('de-AT', {hour:'2-digit', minute:'2-digit'});
  const auto  = analyzeEntry(state.inputs, phase);
  const entry = { temp, rh, wm, kern, userNote: note, timestamp: ts, phaseId: state.activePhaseId, note: auto };
  state.log   = [entry, ...state.log];
  state.inputs = { temp:'', rh:'', wm:'', kern:'', note:'' };
  saveData(state.log, state.activePhaseId, state.sterilStart);
  render();
}

function setPhase(id) {
  state.activePhaseId = id;
  saveData(state.log, state.activePhaseId, state.sterilStart);
  render();
}

function setFanSpeed(s) { state.fanSpeed = s; render(); }

function clearLog() {
  if (!confirm('Wirklich alle Einträge löschen?')) return;
  state.log = [...INITIAL_LOG].reverse();
  state.sterilStart = null;
  saveData(state.log, state.activePhaseId, null);
  render();
}

// ── Render ───────────────────────────────────────────────────────
function statusColor(s) { return {ok:'#27ae60', warn:'#f39c12', crit:'#e74c3c', none:'#bbb'}[s]||'#bbb'; }
function statusLabel(s) { return {ok:'✓ OK', warn:'⚠ Abw.', crit:'✗ Kritisch', none:'—'}[s]||'—'; }

function badge(status) {
  return `<span style="background:${statusColor(status)};color:#fff;border-radius:4px;padding:2px 7px;font-size:11px;font-weight:700">${statusLabel(status)}</span>`;
}

function render() {
  const phase    = PHASES.find(p => p.id === state.activePhaseId);
  const fanRec   = getFanRecommendation(state.log, state.activePhaseId);
  const alert    = getPhaseAlert(state.log, state.activePhaseId);
  const tStatus  = phase.tempMin ? getStatus(state.inputs.temp, phase.tempMin, phase.tempMax) : 'none';
  const rhStatus = phase.rhMin   ? getStatus(state.inputs.rh,   phase.rhMin,  phase.rhMax)   : 'none';

  document.getElementById('app').innerHTML = `
  <div style="font-family:'Inter',sans-serif;background:#f2ede5;min-height:100vh;padding-bottom:40px">

    <!-- Header -->
    <div style="background:#2c1a0e;color:#f2ede5;padding:16px 20px;border-bottom:4px solid #c0392b;position:sticky;top:0;z-index:100">
      <div style="font-size:10px;letter-spacing:3px;color:#c0392b;font-weight:700">TROCKENKAMMER STEUERUNG</div>
      <div style="font-size:19px;font-weight:900">Fichtenholz Trockenprotokoll</div>
      <div style="font-size:11px;color:#a89880;margin-top:2px">
        24mm · 8,5×2×2m · Ziel 8–9%
        ${state.log.length > 0 ? `<span style="margin-left:10px;color:#e8a838">● ${state.log.length} Einträge</span>` : ''}
      </div>
    </div>

    <!-- Phase tabs -->
    <div style="display:flex;overflow-x:auto;gap:8px;padding:12px 16px;background:#fff;border-bottom:1px solid #e0d6c8">
      ${PHASES.map(p => `
        <button onclick="setPhase(${JSON.stringify(p.id)})" style="
          flex-shrink:0;border:2px solid ${state.activePhaseId===p.id ? p.color : '#e0d6c8'};
          background:${state.activePhaseId===p.id ? p.color : '#f9f6f1'};
          color:${state.activePhaseId===p.id ? '#fff' : '#555'};
          border-radius:20px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer">
          ${p.special ? 'HT' : p.id}. ${p.name}
        </button>`).join('')}
    </div>

    <div style="max-width:640px;margin:0 auto;padding:16px">

      <!-- Phase header -->
      <div style="background:${phase.color};border-radius:10px;padding:14px 16px;color:#fff;margin-bottom:12px">
        <div style="font-size:10px;font-weight:700;letter-spacing:2px;opacity:.8">${phase.special?'SONDERBEHANDLUNG':`PHASE ${phase.id}`} · ${phase.duration}</div>
        <div style="font-size:18px;font-weight:900;margin-top:2px">${phase.name}</div>
        <div style="font-size:12px;margin-top:6px;opacity:.9">${phase.description}</div>
      </div>

      <!-- Alert banner -->
      ${alert ? `
      <div style="background:${alert.level==='done'?'#1a6b3a':alert.level==='ready'?'#1a4a6b':'#6b4a1a'};
        border:2px solid ${alert.level==='done'?'#27ae60':alert.level==='ready'?'#2980b9':'#e8a838'};
        border-radius:10px;padding:12px 16px;color:#fff;margin-bottom:12px;display:flex;gap:12px;align-items:flex-start">
        <div style="font-size:26px;flex-shrink:0">${alert.level==='done'?'🎉':alert.level==='ready'?'🔔':'⏳'}</div>
        <div>
          <div style="font-weight:900;font-size:14px;margin-bottom:3px">${alert.title}</div>
          <div style="font-size:12px;opacity:.9">${alert.body}</div>
        </div>
      </div>` : ''}

      <!-- Sollwerte grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        <div style="background:#fff;border-radius:8px;padding:10px 14px;border:1px solid #e0d6c8">
          <div style="font-size:10px;color:#7a6a58;font-weight:700;letter-spacing:1px">TEMPERATUR SOLL</div>
          <div style="font-size:22px;font-weight:900;color:#2c1a0e">${phase.tempMin}–${phase.tempMax}°C</div>
        </div>
        ${phase.rhMin ? `
        <div style="background:#fff;border-radius:8px;padding:10px 14px;border:1px solid #e0d6c8">
          <div style="font-size:10px;color:#7a6a58;font-weight:700;letter-spacing:1px">LUFTFEUCHTE SOLL</div>
          <div style="font-size:22px;font-weight:900;color:#2c1a0e">${phase.rhMin}–${phase.rhMax}% rF</div>
        </div>` : phase.special ? `
        <div style="background:#fff;border-radius:8px;padding:10px 14px;border:1px solid #e0d6c8">
          <div style="font-size:10px;color:#7a6a58;font-weight:700;letter-spacing:1px">KERN ZIEL</div>
          <div style="font-size:20px;font-weight:900;color:#16a085">60°C / 30 Min</div>
          ${state.sterilStart ? `<div style="font-size:11px;color:#16a085">⏱ Start: ${state.sterilStart}</div>` : ''}
        </div>` : ''}
        <div style="background:#fff;border-radius:8px;padding:10px 14px;border:1px solid #e0d6c8">
          <div style="font-size:10px;color:#7a6a58;font-weight:700;letter-spacing:1px">FRISCHLUFT</div>
          <div style="font-size:12px;font-weight:700;color:#2c1a0e;margin-top:4px">${phase.freshAir}</div>
        </div>
        ${phase.woodMoistureTarget ? `
        <div style="background:#fff;border-radius:8px;padding:10px 14px;border:1px solid #e0d6c8">
          <div style="font-size:10px;color:#7a6a58;font-weight:700;letter-spacing:1px">HOLZFEUCHTE ZIEL</div>
          <div style="font-size:13px;font-weight:700;color:#2c1a0e;margin-top:4px">${phase.woodMoistureTarget}</div>
        </div>` : ''}
      </div>

      <!-- Warnings -->
      ${phase.warnings.map(w => `
      <div style="background:#fff8ec;border:1px solid #f0d090;border-radius:6px;padding:7px 12px;font-size:12px;color:#7a5a10;margin-bottom:6px">⚠ ${w}</div>`).join('')}

      <!-- Fan recommendation -->
      <div style="background:#fff;border:2px solid ${fanRec.color};border-radius:10px;padding:12px 14px;margin:12px 0;display:flex;align-items:center;gap:14px">
        <div style="font-size:28px">🌀</div>
        <div style="flex:1">
          <div style="font-size:10px;font-weight:700;letter-spacing:2px;color:#7a6a58;margin-bottom:6px">VENTILATOR EMPFEHLUNG</div>
          <div style="display:flex;gap:6px;margin-bottom:6px">
            ${[0,1,2,3].map(s => `
            <button onclick="setFanSpeed(${s})" style="
              padding:5px 12px;border-radius:6px;cursor:pointer;font-weight:700;font-size:12px;
              background:${fanRec.speed===s ? fanRec.color : '#f0ece6'};
              color:${fanRec.speed===s ? '#fff' : '#7a6a58'};
              border:2px solid ${state.fanSpeed===s ? '#2c1a0e' : 'transparent'}">
              ${s===0?'AUS':`Stufe ${s}`}
            </button>`).join('')}
          </div>
          <div style="font-size:12px;color:#555">${fanRec.reason}</div>
        </div>
      </div>

      <!-- Input form -->
      <div style="background:#fff;border:2px solid #2c1a0e;border-radius:10px;padding:14px;margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#7a6a58;margin-bottom:12px">ISTWERTE EINTRAGEN</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="font-size:11px;color:#7a6a58;font-weight:600">Lufttemperatur (°C)</label>
            <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
              <input type="text" inputmode="decimal" id="inp-temp" value="${state.inputs.temp}" 
                placeholder="z.B. 49" style="border:1.5px solid #d0c8bc;border-radius:6px;padding:8px;font-size:16px;width:100%;box-sizing:border-box">
              ${badge(tStatus)}
            </div>
          </div>
          <div>
            <label style="font-size:11px;color:#7a6a58;font-weight:600">Luftfeuchte (% rF)</label>
            <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
              <input type="text" inputmode="decimal" id="inp-rh" value="${state.inputs.rh}" 
                placeholder="z.B. 94" style="border:1.5px solid #d0c8bc;border-radius:6px;padding:8px;font-size:16px;width:100%;box-sizing:border-box">
              ${badge(rhStatus)}
            </div>
          </div>
          <div>
            <label style="font-size:11px;color:#7a6a58;font-weight:600">Holzfeuchte (%)</label>
            <input type="text" inputmode="decimal" id="inp-wm" value="${state.inputs.wm}" 
              placeholder="z.B. 18" style="border:1.5px solid #d0c8bc;border-radius:6px;padding:8px;font-size:16px;width:100%;box-sizing:border-box;margin-top:3px">
          </div>
          <div>
            <label style="font-size:11px;color:#7a6a58;font-weight:600">Kerntemperatur (°C)</label>
            <input type="text" inputmode="decimal" id="inp-kern" value="${state.inputs.kern}" 
              placeholder="falls gemessen" style="border:1.5px solid #d0c8bc;border-radius:6px;padding:8px;font-size:16px;width:100%;box-sizing:border-box;margin-top:3px">
          </div>
        </div>
        <div style="margin-top:10px">
          <label style="font-size:11px;color:#7a6a58;font-weight:600">Beobachtung / Notiz</label>
          <input type="text" id="inp-note" value="${state.inputs.note}" 
            placeholder="z.B. Stirnseiten ok, kein Riss" style="border:1.5px solid #d0c8bc;border-radius:6px;padding:8px;font-size:14px;width:100%;box-sizing:border-box;margin-top:3px">
        </div>
        <button onclick="submitEntry()" style="margin-top:12px;width:100%;background:#2c1a0e;color:#f2ede5;border:none;border-radius:8px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:1px">
          EINTRAG SPEICHERN & AUSWERTEN
        </button>
      </div>

      <!-- Log -->
      ${state.log.length > 0 ? `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-size:10px;font-weight:700;letter-spacing:2px;color:#7a6a58">PROTOKOLL (${state.log.length} Einträge)</div>
        <button onclick="clearLog()" style="background:transparent;border:1px solid #c0392b;color:#c0392b;border-radius:5px;padding:4px 10px;font-size:11px;cursor:pointer;font-weight:700">🗑 Löschen</button>
      </div>
      ${state.log.map(e => {
        const p = PHASES.find(p => p.id === e.phaseId);
        return `<div style="border-left:3px solid ${p?.color||'#888'};background:#fffdf8;border-radius:0 6px 6px 0;padding:8px 12px;margin-bottom:8px">
          <div style="font-size:10px;color:#7a6a58;margin-bottom:3px">${e.timestamp} — ${p?.name||''}</div>
          <div style="display:flex;flex-wrap:wrap;gap:10px;font-size:13px">
            ${e.temp ? `<span>🌡 <b>${e.temp}°C</b></span>` : ''}
            ${e.rh   ? `<span>💧 <b>${e.rh}% rF</b></span>` : ''}
            ${e.wm   ? `<span>🪵 HF: <b>${e.wm}%</b></span>` : ''}
            ${e.kern ? `<span>🔴 Kern: <b>${e.kern}°C</b></span>` : ''}
          </div>
          ${e.userNote ? `<div style="font-size:11px;color:#444;margin-top:3px;font-style:italic">📝 ${e.userNote}</div>` : ''}
          ${e.note     ? `<div style="font-size:11px;color:#555;margin-top:3px">→ ${e.note}</div>` : ''}
        </div>`;
      }).join('')}` : `
      <div style="text-align:center;color:#a89880;font-size:13px;padding:24px;border:1.5px dashed #d0c8bc;border-radius:8px">
        Noch keine Einträge.
      </div>`}
    </div>
  </div>`;
}

function renderBadges() {}

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW failed', e));
  });
}

window.addEventListener('DOMContentLoaded', init);
