// ── Helpers ───────────────────────────────────────────────────

function makeDeleteBtn(endpoint, id, onDelete) {
  const btn = document.createElement('button');
  btn.className = 'btn-delete';
  btn.textContent = '✕';
  btn.title = 'Delete';
  btn.addEventListener('click', async () => {
    if (!confirm('Delete this record?')) return;
    try {
      await apiDelete(`${endpoint}/${id}`);
      onDelete();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  });
  return btn;
}

// ── Row colour classification helpers ────────────────────────
function getBpClass(sys, dia) {
  if (sys >= 180 || dia >= 120) return 'bp-crisis';
  if (sys >= 140 || dia >= 90)  return 'bp-high2';
  if (sys >= 130 || dia >= 80)  return 'bp-high1';
  if (sys >= 120 && dia < 80)   return 'bp-elevated';
  return 'bp-normal';
}

function getWeightClass(kg) {
  const goal = window._weightGoal;
  if (!goal) return '';
  if (kg <= goal)          return 'wt-ok';
  if (kg <= goal * 1.05)   return 'wt-warn';
  return 'wt-over';
}

function getStepsClass(count) {
  if (count >= 10000) return 'steps-great';
  if (count >= 7500)  return 'steps-good';
  if (count >= 5000)  return 'steps-ok';
  return 'steps-low';
}

// ── Range state ───────────────────────────────────────────────
const ranges = { bp: '1M', weight: '1M', steps: '1M' };

function _setRangeActive(tabId, range) {
  document.querySelectorAll(`#${tabId} .range-btn`).forEach(b =>
    b.classList.toggle('active', b.dataset.range === range));
}

// ── Blood Pressure ────────────────────────────────────────────

async function loadBpData() {
  const data = await apiGet('/api/v1/blood-pressure');
  window._bpData = data;
  applyBpRange();
}

function applyBpRange() {
  if (!window._bpData) return;
  const filtered = filterRange(window._bpData, 'measured_at', ranges.bp);
  renderBpTable(filtered);
  buildBpChart(filtered);
  _updateBpAvg7(filtered);
}

function _updateBpAvg7(filtered) {
  const recent7 = (filtered || []).slice(0, 7);
  const avgSys = avg(recent7.map(r => r.systolic));
  const avgDia = avg(recent7.map(r => r.diastolic));
  document.getElementById('bp-avg-sys7').textContent = avgSys != null ? avgSys.toFixed(0) : '—';
  document.getElementById('bp-avg-dia7').textContent = avgDia != null ? avgDia.toFixed(0) : '—';
}

function renderBpTable(records) {
  const tbody = document.querySelector('#bp-table tbody');
  if (!records.length) {
    const msg = window._bpData && window._bpData.length ? 'No records in selected range' : 'No records yet';
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">${msg}</td></tr>`;
    return;
  }
  tbody.innerHTML = '';
  records.forEach(r => {
    const tr = document.createElement('tr');
    tr.className = getBpClass(r.systolic, r.diastolic);
    tr.innerHTML = `
      <td>${fmtDatetime(r.measured_at)}</td>
      <td>${r.systolic}</td>
      <td>${r.diastolic}</td>
      <td>${r.pulse ?? '—'}</td>
      <td>${r.notes ?? ''}</td>
      <td></td>`;
    tr.lastElementChild.appendChild(makeDeleteBtn('/api/v1/blood-pressure', r.id, loadBpData));
    tbody.appendChild(tr);
  });
}

document.getElementById('bp-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = document.getElementById('bp-form-status');
  const fd = new FormData(e.target);
  const body = {
    measured_at: fd.get('measured_at'),
    systolic:    parseInt(fd.get('systolic')),
    diastolic:   parseInt(fd.get('diastolic')),
    pulse:       fd.get('pulse') ? parseInt(fd.get('pulse')) : null,
    notes:       fd.get('notes') || null,
  };
  try {
    await apiPost('/api/v1/blood-pressure', body);
    setStatus(status, 'Saved!');
    e.target.reset();
    await loadBpData();
  } catch (err) {
    setStatus(status, err.message, true);
  }
});

document.querySelectorAll('#tab-blood-pressure .range-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    ranges.bp = btn.dataset.range;
    _setRangeActive('tab-blood-pressure', ranges.bp);
    applyBpRange();
  });
});

// ── Weight ────────────────────────────────────────────────────

async function loadWeightData() {
  const data = await apiGet('/api/v1/weight');
  window._weightData = data;
  applyWeightRange();
}

function applyWeightRange() {
  if (!window._weightData) return;
  const filtered = filterRange(window._weightData, 'measured_at', ranges.weight);
  renderWeightTable(filtered);
  buildWeightChart(filtered);
}

function renderWeightTable(records) {
  const tbody = document.querySelector('#weight-table tbody');
  if (!records.length) {
    const msg = window._weightData && window._weightData.length ? 'No records in selected range' : 'No records yet';
    tbody.innerHTML = `<tr class="empty-row"><td colspan="4">${msg}</td></tr>`;
    return;
  }
  tbody.innerHTML = '';
  records.forEach(r => {
    const tr = document.createElement('tr');
    tr.className = getWeightClass(r.value_kg);
    tr.innerHTML = `
      <td>${fmtDatetime(r.measured_at)}</td>
      <td>${r.value_kg.toFixed(1)}</td>
      <td>${r.notes ?? ''}</td>
      <td></td>`;
    tr.lastElementChild.appendChild(makeDeleteBtn('/api/v1/weight', r.id, loadWeightData));
    tbody.appendChild(tr);
  });
}

// ── Weight goal ───────────────────────────────────────────────
function updateWeightGoalInput(goal) {
  if (goal != null) document.getElementById('weight-goal-input').value = goal;
}

document.getElementById('weight-goal-save').addEventListener('click', async () => {
  const val = parseFloat(document.getElementById('weight-goal-input').value);
  const status = document.getElementById('weight-goal-status');
  if (isNaN(val) || val <= 0) { setStatus(status, 'Enter a valid weight', true); return; }
  try {
    const user = await apiPut('/api/v1/auth/weight-goal', { value_kg: val });
    window._weightGoal = user.weight_goal;
    window._weightData && applyWeightRange();
    setStatus(status, 'Goal saved!');
  } catch (err) {
    setStatus(status, err.message, true);
  }
});

document.getElementById('weight-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = document.getElementById('weight-form-status');
  const fd = new FormData(e.target);
  const body = {
    measured_at: fd.get('measured_at'),
    value_kg:    parseFloat(fd.get('value_kg')),
    notes:       fd.get('notes') || null,
  };
  try {
    await apiPost('/api/v1/weight', body);
    setStatus(status, 'Saved!');
    e.target.reset();
    await loadWeightData();
  } catch (err) {
    setStatus(status, err.message, true);
  }
});

document.querySelectorAll('#tab-weight .range-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    ranges.weight = btn.dataset.range;
    _setRangeActive('tab-weight', ranges.weight);
    applyWeightRange();
  });
});

// ── Steps ─────────────────────────────────────────────────────

async function loadStepsData() {
  const data = await apiGet('/api/v1/steps');
  window._stepsData = data;
  applyStepsRange();
}

function applyStepsRange() {
  if (!window._stepsData) return;
  const filtered = filterRange(window._stepsData, 'step_date', ranges.steps);
  renderStepsTable(filtered);
  buildStepsChart(filtered);
  buildDistanceChart(filtered);
}

function renderStepsTable(records) {
  const tbody = document.querySelector('#steps-table tbody');
  if (!records.length) {
    const msg = window._stepsData && window._stepsData.length ? 'No records in selected range' : 'No records yet';
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">${msg}</td></tr>`;
    return;
  }
  tbody.innerHTML = '';
  records.forEach(r => {
    const distKm = r.distance_m != null ? (r.distance_m / 1000).toFixed(2) + ' km' : '—';
    const tr = document.createElement('tr');
    tr.className = getStepsClass(r.step_count);
    ['step_date', 'step_count', 'distance_m', 'notes', ''].forEach((field, i) => {
      const td = document.createElement('td');
      if (i === 0) td.textContent = r.step_date;
      else if (i === 1) td.textContent = r.step_count.toLocaleString();
      else if (i === 2) td.textContent = distKm;
      else if (i === 3) td.textContent = r.notes ?? '';
      tr.appendChild(td);
    });
    tr.lastElementChild.appendChild(makeDeleteBtn('/api/v1/steps', r.id, loadStepsData));
    tbody.appendChild(tr);
  });
}

document.getElementById('steps-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = document.getElementById('steps-form-status');
  const fd = new FormData(e.target);
  const distKm = parseFloat(fd.get('distance_km'));
  const body = {
    step_date:  fd.get('step_date'),
    step_count: parseInt(fd.get('step_count')),
    distance_m: isNaN(distKm) ? null : distKm * 1000,
    notes:      fd.get('notes') || null,
  };
  try {
    await apiPost('/api/v1/steps', body);
    setStatus(status, 'Saved!');
    e.target.reset();
    await loadStepsData();
  } catch (err) {
    setStatus(status, err.message, true);
  }
});

document.querySelectorAll('#tab-steps .range-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    ranges.steps = btn.dataset.range;
    _setRangeActive('tab-steps', ranges.steps);
    applyStepsRange();
  });
});

// ── Load data when tab is shown ───────────────────────────────
window.addEventListener('tabchange', async (e) => {
  const tab = e.detail;
  if (tab === 'blood-pressure') await loadBpData().catch(console.error);
  if (tab === 'weight')         await loadWeightData().catch(console.error);
  if (tab === 'steps')          await loadStepsData().catch(console.error);
});

// Expose apply helpers so charts.js tabchange can use them, and
// updateWeightGoalInput so auth.js can populate it after login.
Object.assign(window, { applyBpRange, applyWeightRange, applyStepsRange, updateWeightGoalInput });
