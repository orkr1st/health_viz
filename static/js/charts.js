// ── Shared chart defaults ─────────────────────────────────────
Chart.defaults.font.family = "'Figtree', system-ui, sans-serif";
Chart.defaults.font.size   = 12;

const TIME_SCALE = {
  type: 'time',
  time: { tooltipFormat: 'dd MMM yyyy HH:mm' },
  ticks: { maxTicksLimit: 6 },
};

const TIME_SCALE_DAY = {
  type: 'time',
  time: { unit: 'day', tooltipFormat: 'dd MMM yyyy' },
  ticks: { maxTicksLimit: 10 },
};

function destroyChart(ref) {
  if (ref && ref.chart) { ref.chart.destroy(); ref.chart = null; }
}

// ── Dashboard mini-charts ─────────────────────────────────────
const dash = {};

function buildDashBpChart(records) {
  const data30 = last30Days(records, 'measured_at').reverse();
  destroyChart(dash.bp);
  dash.bp = { chart: new Chart(document.getElementById('dash-bp-chart'), {
    type: 'line',
    data: {
      datasets: [
        { label: 'Systolic',  data: data30.map(r => ({ x: r.measured_at, y: r.systolic })),  borderColor: '#ef4444', stepped: 'middle', tension: 0, pointRadius: 2 },
        { label: 'Diastolic', data: data30.map(r => ({ x: r.measured_at, y: r.diastolic })), borderColor: '#3b82f6', stepped: 'middle', tension: 0, pointRadius: 2 },
      ],
    },
    options: { plugins: { legend: { display: false } }, scales: { x: TIME_SCALE }, animation: false },
  })};
  const latest = records[0];
  document.getElementById('dash-bp-latest').textContent =
    latest ? `${latest.systolic}/${latest.diastolic}` : '—';
  const recent7 = records.slice(0, 7);
  const avgSys = avg(recent7.map(r => r.systolic));
  const avgDia = avg(recent7.map(r => r.diastolic));
  document.getElementById('dash-bp-avg7').textContent = avgSys != null
    ? `Avg (last 7): ${avgSys.toFixed(0)}/${avgDia.toFixed(0)} mmHg`
    : 'Avg (last 7): —';
}

function buildDashWeightChart(records) {
  const data30 = last30Days(records, 'measured_at').reverse();
  destroyChart(dash.weight);
  dash.weight = { chart: new Chart(document.getElementById('dash-weight-chart'), {
    type: 'line',
    data: {
      datasets: [{ label: 'kg', data: data30.map(r => ({ x: r.measured_at, y: r.value_kg })), borderColor: '#8b5cf6', stepped: 'middle', tension: 0, pointRadius: 2 }],
    },
    options: { plugins: { legend: { display: false } }, scales: { x: TIME_SCALE }, animation: false },
  })};
  const latest = records[0];
  document.getElementById('dash-weight-latest').textContent = latest ? `${latest.value_kg.toFixed(1)} kg` : '—';
  const recent7 = records.slice(0, 7);
  const avgW = avg(recent7.map(r => r.value_kg));
  document.getElementById('dash-weight-avg7').textContent = avgW != null
    ? `Avg (last 7): ${avgW.toFixed(1)} kg`
    : 'Avg (last 7): —';
}

function buildDashStepsChart(records) {
  const data30 = last30Days(records, 'step_date').reverse();
  destroyChart(dash.steps);
  dash.steps = { chart: new Chart(document.getElementById('dash-steps-chart'), {
    type: 'bar',
    data: {
      datasets: [{
        label: 'Steps',
        data: data30.map(r => ({ x: r.step_date, y: r.step_count })),
        backgroundColor: data30.map(r => r.step_count >= 10000 ? '#16a34a99' : '#f97316aa'),
      }],
    },
    options: { plugins: { legend: { display: false } }, scales: { x: TIME_SCALE_DAY }, animation: false },
  })};
  const latest = records[0];
  const distStr = latest && latest.distance_m != null ? ` · ${(latest.distance_m / 1000).toFixed(2)} km` : '';
  document.getElementById('dash-steps-latest').textContent = latest ? latest.step_count.toLocaleString() + distStr : '—';
  const recent7 = records.slice(0, 7);
  const avgSteps = avg(recent7.map(r => r.step_count));
  document.getElementById('dash-steps-avg7').textContent = avgSteps != null
    ? `Avg (last 7): ${Math.round(avgSteps).toLocaleString()} steps/day`
    : 'Avg (last 7): —';
}

async function loadDashboard() {
  const [bpData, weightData, stepsData] = await Promise.all([
    apiGet('/api/blood-pressure'),
    apiGet('/api/weight'),
    apiGet('/api/steps'),
  ]);
  buildDashBpChart(bpData);
  buildDashWeightChart(weightData);
  buildDashStepsChart(stepsData);
}

// ── Blood Pressure full chart ─────────────────────────────────
let bpChart = null;

function buildBpChart(records) {
  const sorted = [...records].reverse();
  const sysValues = sorted.map(r => r.systolic);
  const diaValues = sorted.map(r => r.diastolic);
  const avgSys7 = rollingAvg(sysValues, 7);
  const avgDia7 = rollingAvg(diaValues, 7);
  if (bpChart) { bpChart.destroy(); }
  bpChart = new Chart(document.getElementById('bp-chart'), {
    type: 'line',
    data: {
      datasets: [
        { label: 'Systolic',       data: sorted.map(r => ({ x: r.measured_at, y: r.systolic })),  borderColor: '#ef4444', backgroundColor: '#ef444422', fill: false, stepped: 'middle', tension: 0, pointRadius: 3 },
        { label: 'Diastolic',      data: sorted.map(r => ({ x: r.measured_at, y: r.diastolic })), borderColor: '#3b82f6', backgroundColor: '#3b82f622', fill: false, stepped: 'middle', tension: 0, pointRadius: 3 },
        { label: 'Pulse',          data: sorted.filter(r => r.pulse).map(r => ({ x: r.measured_at, y: r.pulse })), borderColor: '#16a34a', fill: false, stepped: 'middle', tension: 0, borderDash: [4, 4], pointRadius: 3 },
        { label: 'Sys 7-day avg',  data: sorted.map((r, i) => ({ x: r.measured_at, y: +avgSys7[i].toFixed(1) })), borderColor: '#f97316', borderDash: [6, 3], fill: false, tension: 0.3, pointRadius: 0 },
        { label: 'Dia 7-day avg',  data: sorted.map((r, i) => ({ x: r.measured_at, y: +avgDia7[i].toFixed(1) })), borderColor: '#818cf8', borderDash: [6, 3], fill: false, tension: 0.3, pointRadius: 0 },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        annotation: {
          annotations: {
            // Classification zones (systolic-based, per AHA)
            zoneNormal: {
              type: 'box', yMin: 0, yMax: 120,
              backgroundColor: 'rgba(22,163,74,0.07)', borderWidth: 0,
              label: { display: true, content: 'Normal', position: { x: 'start', y: 'end' }, color: 'rgba(22,163,74,0.6)', backgroundColor: 'rgba(0,0,0,0)', font: { size: 10 } },
            },
            zoneElevated: {
              type: 'box', yMin: 120, yMax: 130,
              backgroundColor: 'rgba(234,179,8,0.10)', borderWidth: 0,
              label: { display: true, content: 'Elevated', position: { x: 'start', y: 'center' }, color: 'rgba(161,120,5,0.8)', backgroundColor: 'rgba(0,0,0,0)', font: { size: 10 } },
            },
            zoneHigh: {
              type: 'box', yMin: 130,
              backgroundColor: 'rgba(239,68,68,0.07)', borderWidth: 0,
              label: { display: true, content: 'High', position: { x: 'start', y: 'start' }, color: 'rgba(185,28,28,0.7)', backgroundColor: 'rgba(0,0,0,0)', font: { size: 10 } },
            },
            // Boundary lines
            lineSys120: {
              type: 'line', yMin: 120, yMax: 120,
              borderColor: 'rgba(234,179,8,0.5)', borderWidth: 1, borderDash: [4, 4],
            },
            lineSys130: {
              type: 'line', yMin: 130, yMax: 130,
              borderColor: 'rgba(239,68,68,0.5)', borderWidth: 1, borderDash: [4, 4],
            },
          },
        },
      },
      scales: {
        x: { ...TIME_SCALE, title: { display: true, text: 'Date' } },
        y: { title: { display: true, text: 'Pressure (mmHg)' } },
      },
    },
  });
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
      borderColor: 'rgba(16,185,129,0.7)', borderWidth: 2, borderDash: [8, 4],
      label: { display: true, content: `Goal: ${goal} kg`, position: 'start', color: '#10b981', backgroundColor: 'rgba(0,0,0,0)', font: { size: 11 } },
    };
  }
  if (weightChart) { weightChart.destroy(); }
  weightChart = new Chart(document.getElementById('weight-chart'), {
    type: 'line',
    data: {
      datasets: [
        { label: 'Weight (kg)', data: sorted.map((r, i) => ({ x: r.measured_at, y: values[i] })), borderColor: '#8b5cf6', backgroundColor: '#8b5cf622', fill: true, stepped: 'middle', tension: 0, pointRadius: 3 },
        { label: '7-day avg',   data: sorted.map((r, i) => ({ x: r.measured_at, y: +avg7[i].toFixed(2) })), borderColor: '#f59e0b', borderDash: [6, 3], fill: false, tension: 0.3, pointRadius: 0 },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        annotation: { annotations },
      },
      scales: {
        x: { ...TIME_SCALE, title: { display: true, text: 'Date' } },
        y: { title: { display: true, text: 'Weight (kg)' } },
      },
    },
  });
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
        backgroundColor: sorted.map(r => r.step_count >= 10000 ? '#16a34a99' : '#f9731699'),
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        x: { ...TIME_SCALE_DAY, title: { display: true, text: 'Date' } },
        y: { beginAtZero: true, title: { display: true, text: 'Steps' } },
      },
    },
  });
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
        borderColor: '#3b82f6',
        backgroundColor: '#3b82f622',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        x: { ...TIME_SCALE_DAY, title: { display: true, text: 'Date' } },
        y: { beginAtZero: true, title: { display: true, text: 'Distance (km)' } },
      },
    },
  });
}

// ── Auto-load dashboard on first paint ────────────────────────
window.addEventListener('authReady', () => loadDashboard().catch(console.error));

// ── Tab change listener ───────────────────────────────────────
window.addEventListener('tabchange', async (e) => {
  const tab = e.detail;
  if (tab === 'dashboard')      { await loadDashboard().catch(console.error); }
  if (tab === 'blood-pressure') { window.applyBpRange?.(); }
  if (tab === 'weight')         { window.applyWeightRange?.(); }
  if (tab === 'steps')          { window.applyStepsRange?.(); }
});

// expose builders so forms.js can call them after mutations
Object.assign(window, { buildBpChart, buildWeightChart, buildStepsChart, buildDistanceChart, loadDashboard });
