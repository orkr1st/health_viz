// ── Shared chart defaults ─────────────────────────────────────
Chart.defaults.font.family = "'Figtree', system-ui, sans-serif";
Chart.defaults.font.size   = 12;

const TIME_SCALE = {
  type: 'time',
  time: { tooltipFormat: 'dd MMM yyyy HH:mm' },
  ticks: { maxTicksLimit: 6, font: { family: "'JetBrains Mono', monospace", size: 10 }, color: '#8a7d70' },
  grid: { display: false }, border: { display: false },
};

const TIME_SCALE_DAY = {
  type: 'time',
  time: { unit: 'day', tooltipFormat: 'dd MMM yyyy' },
  ticks: { maxTicksLimit: 10, font: { family: "'JetBrains Mono', monospace", size: 10 }, color: '#8a7d70' },
  grid: { display: false }, border: { display: false },
};

const Y_SCALE = {
  ticks: { font: { family: "'JetBrains Mono', monospace", size: 10 }, color: '#8a7d70' },
  grid: { color: 'rgba(229,222,210,1)' }, border: { display: false },
};

function destroyChart(ref) {
  if (ref && ref.chart) { ref.chart.destroy(); ref.chart = null; }
}

// ── DOM helpers ───────────────────────────────────────────────

function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val ?? '';
}

function _makeTagEl(cls, text) {
  const span = document.createElement('span');
  span.className = 'tag ' + cls;
  span.textContent = text;
  return span;
}

function _clearEl(id) {
  const el = document.getElementById(id);
  if (el) el.textContent = '';
  return el;
}

// Build an element that shows  "NNN / NNN  unit"  using spans
function _setValueBp(id, sys, dia, unit) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = '';
  if (sys != null) {
    el.appendChild(document.createTextNode(sys));
    const sep = document.createElement('span');
    sep.className = 'sep'; sep.textContent = '/';
    el.appendChild(sep);
    el.appendChild(document.createTextNode(dia));
  } else {
    el.appendChild(document.createTextNode('—'));
  }
  const u = document.createElement('span');
  u.className = 'unit'; u.textContent = unit;
  el.appendChild(u);
}

function _setValueUnit(id, valStr, unit) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = '';
  el.appendChild(document.createTextNode(valStr ?? '—'));
  const u = document.createElement('span');
  u.className = 'unit'; u.textContent = unit;
  el.appendChild(u);
}

function _setCaption(id, strongText, plainText) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = '';
  if (strongText) {
    const s = document.createElement('strong');
    s.textContent = strongText;
    el.appendChild(s);
    el.appendChild(document.createTextNode(' ' + plainText));
  } else {
    el.textContent = plainText || 'No data yet';
  }
}

// ── Sparkline helper (Step 7) ─────────────────────────────────
function drawSparkline(canvasId, datasets, opts = {}) {
  const canvas = typeof canvasId === 'string'
    ? document.getElementById(canvasId) : canvasId;
  if (!canvas) return null;
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  const isBar = opts.type === 'bar';
  return new Chart(canvas, {
    type: isBar ? 'bar' : 'line',
    data: {
      datasets: datasets.map(ds => ({
        data: ds.data,
        borderColor: ds.color,
        backgroundColor: isBar ? (ds.barColors ?? ds.color) : 'transparent',
        borderWidth: 1.5, pointRadius: 0, tension: 0.3,
        fill: false, borderCapStyle: 'round', borderJoinStyle: 'round',
        ...(ds.dashed ? { borderDash: [4, 3] } : {}),
        ...(isBar ? { borderRadius: 2, borderSkipped: false } : {}),
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
    },
  });
}

// ── Dashboard metric cards ────────────────────────────────────

function _relativeTime(dateStr) {
  if (!dateStr) return 'never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60)  return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

function _thisMonthCount(records, dateField) {
  const now = new Date();
  return records.filter(r => {
    const d = new Date(r[dateField]);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
}

function _trendDelta(records, valueField, dateField) {
  const cutoff14 = new Date(); cutoff14.setDate(cutoff14.getDate() - 14);
  const cutoff7  = new Date(); cutoff7.setDate(cutoff7.getDate() - 7);
  const prev = records.filter(r => { const d = new Date(r[dateField]); return d >= cutoff14 && d < cutoff7; });
  const curr = records.filter(r => new Date(r[dateField]) >= cutoff7);
  const a = avg(curr.map(r => r[valueField]));
  const b = avg(prev.map(r => r[valueField]));
  return (a != null && b != null) ? a - b : null;
}

function _setTrendChip(elId, delta, invertGreen) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (delta == null) { el.textContent = '—'; el.className = 'trend flat'; return; }
  const down  = delta < 0;
  const green = invertGreen ? !down : down;
  el.textContent = (down ? '↓' : '↑') + ' ' + Math.abs(delta).toFixed(1);
  el.className   = 'trend ' + (green ? 'down' : 'up');
}

function updateDashboard(bpData, weightData, stepsData) {
  const username  = document.getElementById('header-username')?.textContent ?? '';
  const firstName = username.split(' ')[0] || username;
  const hour      = new Date().getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

  // Hero greeting
  const greetEl = document.getElementById('hero-greeting');
  if (greetEl) {
    greetEl.textContent = '';
    greetEl.appendChild(document.createTextNode('Good ' + timeOfDay + ', ' + firstName + '. '));
    const em = document.createElement('em');
    em.textContent = "Here's your week.";
    greetEl.appendChild(em);
  }

  // Hero sub-line
  const allDates = [
    ...bpData.map(r => r.measured_at),
    ...weightData.map(r => r.measured_at),
    ...stepsData.map(r => r.step_date),
  ].filter(Boolean).sort().reverse();
  const monthCount = _thisMonthCount(bpData, 'measured_at')
    + _thisMonthCount(weightData, 'measured_at')
    + _thisMonthCount(stepsData, 'step_date');
  _setText('hero-sub', 'Last reading ' + _relativeTime(allDates[0]) + ' · ' + monthCount + ' entries this month');

  // ── BP card ──
  const latestBp = bpData[0];
  _setValueBp('metric-bp-value', latestBp?.systolic, latestBp?.diastolic, 'mmHg');
  const avgSys7 = avg(bpData.slice(0, 7).map(r => r.systolic));
  const avgDia7 = avg(bpData.slice(0, 7).map(r => r.diastolic));
  _setCaption('metric-bp-caption',
    latestBp ? (avgSys7?.toFixed(0) ?? '—') + '/' + (avgDia7?.toFixed(0) ?? '—') : null,
    '7-day avg');
  _setTrendChip('metric-bp-trend', _trendDelta(bpData, 'systolic', 'measured_at'), false);

  const spark14bp = last30Days(bpData, 'measured_at').slice(0, 14).reverse();
  drawSparkline('spark-bp', [
    { data: spark14bp.map(r => ({ x: r.measured_at, y: r.systolic })),  color: '#b6542a' },
    { data: spark14bp.map(r => ({ x: r.measured_at, y: r.diastolic })), color: 'rgba(217,164,138,0.55)' },
  ]);

  // ── Weight card ──
  const latestWt = weightData[0];
  _setValueUnit('metric-weight-value', latestWt ? latestWt.value_kg.toFixed(1) : null, 'kg');
  const avgWt7 = avg(weightData.slice(0, 7).map(r => r.value_kg));
  _setCaption('metric-weight-caption',
    latestWt ? (avgWt7?.toFixed(1) ?? '—') + ' kg' : null,
    '7-day avg');
  _setTrendChip('metric-weight-trend', _trendDelta(weightData, 'value_kg', 'measured_at'), false);

  const spark14wt = last30Days(weightData, 'measured_at').slice(0, 14).reverse();
  const goalDs = [];
  if (window._weightGoal) {
    goalDs.push({ data: spark14wt.map(r => ({ x: r.measured_at, y: window._weightGoal })), color: 'rgba(107,93,138,0.4)', dashed: true });
  }
  drawSparkline('spark-weight', [
    { data: spark14wt.map(r => ({ x: r.measured_at, y: r.value_kg })), color: '#6b5d8a' },
    ...goalDs,
  ]);

  // ── Steps card ──
  const latestSt = stepsData[0];
  _setValueUnit('metric-steps-value', latestSt ? latestSt.step_count.toLocaleString() : null, 'today');
  const avgSt7 = avg(stepsData.slice(0, 7).map(r => r.step_count));
  _setCaption('metric-steps-caption',
    latestSt ? (avgSt7 != null ? Math.round(avgSt7).toLocaleString() : '—') : null,
    '7-day avg');
  _setTrendChip('metric-steps-trend', _trendDelta(stepsData, 'step_count', 'step_date'), true);

  const spark14st = last30Days(stepsData, 'step_date').slice(0, 14).reverse();
  drawSparkline('spark-steps', [{
    data: spark14st.map(r => ({ x: r.step_date, y: r.step_count })),
    color: '#5c7a52',
    barColors: spark14st.map(r =>
      r.step_count >= 7500 ? 'rgba(92,122,82,0.75)' : 'rgba(92,122,82,0.38)'),
  }], { type: 'bar' });
}

async function loadDashboard() {
  const [bpData, weightData, stepsData] = await Promise.all([
    apiGet('/api/v1/blood-pressure'),
    apiGet('/api/v1/weight'),
    apiGet('/api/v1/steps'),
  ]);
  window._bpData     = bpData;
  window._weightData = weightData;
  window._stepsData  = stepsData;
  updateDashboard(bpData, weightData, stepsData);
}

// ── Blood Pressure full chart ─────────────────────────────────
let bpChart = null;

function buildBpChart(records) {
  const sorted  = [...records].reverse();
  const sysVals = sorted.map(r => r.systolic);
  const diaVals = sorted.map(r => r.diastolic);
  const avgSys7 = rollingAvg(sysVals, 7);
  const avgDia7 = rollingAvg(diaVals, 7);

  if (bpChart) { bpChart.destroy(); }
  bpChart = new Chart(document.getElementById('bp-chart'), {
    type: 'line',
    data: {
      datasets: [
        { label: 'Systolic',  data: sorted.map(r => ({ x: r.measured_at, y: r.systolic })),  borderColor: '#b6542a', borderWidth: 2, fill: false, tension: 0, pointRadius: 2.5, borderCapStyle: 'round' },
        { label: 'Diastolic', data: sorted.map(r => ({ x: r.measured_at, y: r.diastolic })), borderColor: '#d9a48a', borderWidth: 2, fill: false, tension: 0, pointRadius: 2.5, borderCapStyle: 'round' },
        { label: 'Pulse',     data: sorted.filter(r => r.pulse).map(r => ({ x: r.measured_at, y: r.pulse })), borderColor: 'rgba(138,125,112,0.55)', borderWidth: 1.5, borderDash: [4, 4], fill: false, tension: 0, pointRadius: 0 },
        { label: 'Sys 7d',    data: sorted.map((r, i) => ({ x: r.measured_at, y: +avgSys7[i].toFixed(1) })), borderColor: 'rgba(182,84,42,0.4)', borderDash: [6, 3], borderWidth: 1.5, fill: false, tension: 0.3, pointRadius: 0 },
        { label: 'Dia 7d',    data: sorted.map((r, i) => ({ x: r.measured_at, y: +avgDia7[i].toFixed(1) })), borderColor: 'rgba(217,164,138,0.5)', borderDash: [6, 3], borderWidth: 1.5, fill: false, tension: 0.3, pointRadius: 0 },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        annotation: {
          annotations: {
            bandNormal: { type: 'box', yMin: 0, yMax: 120, backgroundColor: 'rgba(182,84,42,0.04)', borderWidth: 0 },
            line120:    { type: 'line', yMin: 120, yMax: 120, borderColor: 'rgba(182,84,42,0.25)', borderWidth: 1, borderDash: [4, 4] },
            line130:    { type: 'line', yMin: 130, yMax: 130, borderColor: 'rgba(182,84,42,0.40)', borderWidth: 1, borderDash: [4, 4] },
          },
        },
      },
      scales: { x: TIME_SCALE, y: Y_SCALE },
    },
  });

  _updateBpStats(records);
}

function _updateBpStats(records) {
  const latest   = records[0];
  const recent7  = records.slice(0, 7);
  const aS       = avg(recent7.map(r => r.systolic));
  const aD       = avg(recent7.map(r => r.diastolic));
  const aP       = avg(recent7.filter(r => r.pulse).map(r => r.pulse));
  const monthCt  = _thisMonthCount(records, 'measured_at');

  _setText('bp-stat-latest', latest ? latest.systolic + '/' + latest.diastolic : '—');
  const chipEl = _clearEl('bp-stat-latest-chip');
  if (chipEl && latest) {
    const cls = (typeof getBpClass === 'function' ? getBpClass(latest.systolic, latest.diastolic) : '').replace('bp-', '');
    const labels = { normal: 'Normal', elevated: 'Elevated', high1: 'High I', high2: 'High II', crisis: 'Crisis' };
    if (cls && labels[cls]) chipEl.appendChild(_makeTagEl(cls, labels[cls]));
  }

  _setText('bp-stat-avg', aS != null ? aS.toFixed(0) + '/' + aD.toFixed(0) : '—');
  _setText('bp-stat-avg-note', 'systolic / diastolic');
  _setText('bp-stat-count', String(monthCt));
  _setText('bp-stat-count-note', 'readings this month');

  _setText('bp-legend-sys',   latest ? ' ' + latest.systolic  : ' —');
  _setText('bp-legend-dia',   latest ? ' ' + latest.diastolic : ' —');
  _setText('bp-legend-pulse', aP != null ? ' ' + aP.toFixed(0) : ' —');

  const monthEl = document.getElementById('bp-detail-month');
  if (monthEl && records.length) monthEl.textContent = '— ' + new Date().toLocaleString('default', { month: 'long' });
}

// ── Weight full chart ─────────────────────────────────────────
let weightChart = null;

function rollingAvg(arr, n) {
  return arr.map((_, i, a) => {
    const slice = a.slice(Math.max(0, i - n + 1), i + 1);
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  });
}

function buildWeightChart(records) {
  const sorted = [...records].reverse();
  const values = sorted.map(r => r.value_kg);
  const avg7   = rollingAvg(values, 7);
  const goal   = window._weightGoal ?? NaN;
  const annotations = {};
  if (!isNaN(goal) && goal > 0) {
    annotations.goalLine = {
      type: 'line', yMin: goal, yMax: goal,
      borderColor: 'rgba(107,93,138,0.6)', borderWidth: 2, borderDash: [8, 4],
      label: { display: true, content: 'Goal: ' + goal + ' kg', position: 'start', color: '#6b5d8a', backgroundColor: 'rgba(0,0,0,0)', font: { size: 11, family: "'JetBrains Mono', monospace" } },
    };
  }
  if (weightChart) { weightChart.destroy(); }
  weightChart = new Chart(document.getElementById('weight-chart'), {
    type: 'line',
    data: {
      datasets: [
        { label: 'Weight', data: sorted.map((r, i) => ({ x: r.measured_at, y: values[i] })), borderColor: '#6b5d8a', borderWidth: 2, backgroundColor: 'rgba(107,93,138,0.06)', fill: true, tension: 0, pointRadius: 2.5, borderCapStyle: 'round' },
        { label: '7d avg', data: sorted.map((r, i) => ({ x: r.measured_at, y: +avg7[i].toFixed(2) })), borderColor: 'rgba(107,93,138,0.45)', borderDash: [6, 3], borderWidth: 1.5, fill: false, tension: 0.3, pointRadius: 0 },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, annotation: { annotations } },
      scales: { x: TIME_SCALE, y: Y_SCALE },
    },
  });

  _updateWeightStats(records);
}

function _updateWeightStats(records) {
  const latest  = records[0];
  const recent7 = records.slice(0, 7);
  const aW7     = avg(recent7.map(r => r.value_kg));
  const monthCt = _thisMonthCount(records, 'measured_at');
  const goal    = window._weightGoal ?? NaN;

  _setText('weight-stat-latest', latest ? latest.value_kg.toFixed(1) : '—');
  if (latest && !isNaN(goal) && goal > 0) {
    const diff = (latest.value_kg - goal).toFixed(1);
    _setText('weight-stat-latest-note', (diff > 0 ? '+' : '') + diff + ' kg vs goal');
  }
  _setText('weight-stat-avg', aW7 != null ? aW7.toFixed(1) : '—');
  _setText('weight-stat-avg-note', monthCt + ' readings this month');
  _setText('weight-stat-goal', (!isNaN(goal) && goal > 0) ? String(goal) : '—');

  _setText('weight-legend-val',  latest ? ' ' + latest.value_kg.toFixed(1) + ' kg' : ' —');
  _setText('weight-legend-goal', (!isNaN(goal) && goal > 0) ? ' ' + goal + ' kg' : ' —');

  const monthEl = document.getElementById('weight-detail-month');
  if (monthEl && records.length) monthEl.textContent = '— ' + new Date().toLocaleString('default', { month: 'long' });
}

// ── Steps chart ───────────────────────────────────────────────
let stepsChart = null;

function buildStepsChart(records) {
  const sorted = [...records].reverse();
  if (stepsChart) { stepsChart.destroy(); }
  stepsChart = new Chart(document.getElementById('steps-chart'), {
    type: 'bar',
    data: {
      datasets: [{
        label: 'Steps',
        data: sorted.map(r => ({ x: r.step_date, y: r.step_count })),
        backgroundColor: sorted.map(r =>
          r.step_count >= 10000 ? 'rgba(92,122,82,0.80)' :
          r.step_count >= 7500  ? 'rgba(92,122,82,0.60)' :
          r.step_count >= 5000  ? 'rgba(182,84,42,0.45)' : 'rgba(182,84,42,0.65)'
        ),
        borderRadius: 3, borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: TIME_SCALE_DAY, y: { ...Y_SCALE, beginAtZero: true } },
    },
  });

  _updateStepsStats(records);
}

function _updateStepsStats(records) {
  const latest  = records[0];
  const recent7 = records.slice(0, 7);
  const aS7     = avg(recent7.map(r => r.step_count));
  const monthCt = _thisMonthCount(records, 'step_date');

  _setText('steps-stat-latest', latest ? latest.step_count.toLocaleString() : '—');
  const chipEl = _clearEl('steps-stat-latest-chip');
  if (chipEl && latest) {
    const cls = (typeof getStepsClass === 'function' ? getStepsClass(latest.step_count) : '').replace('steps-', '');
    const labels = { great: '≥ 10k', good: '7.5–10k', ok: '5–7.5k', low: '< 5k' };
    if (cls && labels[cls]) chipEl.appendChild(_makeTagEl('steps-' + cls, labels[cls]));
  }
  _setText('steps-stat-avg', aS7 != null ? Math.round(aS7).toLocaleString() : '—');
  _setText('steps-stat-avg-note', 'steps/day average');
  _setText('steps-stat-count', String(monthCt));
  _setText('steps-stat-count-note', 'entries this month');

  _setText('steps-legend-latest', latest ? ' ' + latest.step_count.toLocaleString() : ' —');
  _setText('steps-legend-avg',    aS7 != null ? ' ' + Math.round(aS7).toLocaleString() : ' —');

  const monthEl = document.getElementById('steps-detail-month');
  if (monthEl && records.length) monthEl.textContent = '— ' + new Date().toLocaleString('default', { month: 'long' });
}

// ── Distance chart ────────────────────────────────────────────
let distanceChart = null;

function buildDistanceChart(records) {
  const sorted = [...records].reverse().filter(r => r.distance_m != null);
  if (distanceChart) { distanceChart.destroy(); }
  distanceChart = new Chart(document.getElementById('distance-chart'), {
    type: 'line',
    data: {
      datasets: [{
        label: 'Distance (km)',
        data: sorted.map(r => ({ x: r.step_date, y: +(r.distance_m / 1000).toFixed(2) })),
        borderColor: 'rgba(92,122,82,0.7)', backgroundColor: 'rgba(92,122,82,0.07)',
        fill: true, tension: 0.3, pointRadius: 2, borderCapStyle: 'round',
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: TIME_SCALE_DAY, y: { ...Y_SCALE, beginAtZero: true } },
    },
  });
}

// ── Event wiring ──────────────────────────────────────────────
window.addEventListener('authReady', () => loadDashboard().catch(console.error));

window.addEventListener('tabchange', async (e) => {
  const tab = e.detail;
  if (tab === 'dashboard')      { await loadDashboard().catch(console.error); }
  if (tab === 'blood-pressure') { window.applyBpRange?.(); }
  if (tab === 'weight')         { window.applyWeightRange?.(); }
  if (tab === 'steps')          { window.applyStepsRange?.(); }
});

Object.assign(window, { buildBpChart, buildWeightChart, buildStepsChart, buildDistanceChart, loadDashboard });
