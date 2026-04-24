// ── Helpers ───────────────────────────────────────────────────

function makeDeleteBtn(endpoint, id, onDelete) {
  const btn = document.createElement('button');
  btn.className = 'btn-delete';
  btn.textContent = '✕';
  btn.title = 'Delete';
  btn.addEventListener('click', async () => {
    if (!confirm('Delete this record?')) return;
    try {
      await apiDelete(endpoint + '/' + id);
      onDelete();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  });
  return btn;
}

function _makeTagEl(cls, text) {
  const span = document.createElement('span');
  span.className = 'tag ' + cls;
  span.textContent = text;
  return span;
}

// ── Classification helpers ────────────────────────────────────
/** Returns CSS class name based on AHA blood pressure zones. */
function getBpClass(sys, dia) {
  if (sys >= 180 || dia >= 120) return 'bp-crisis';
  if (sys >= 140 || dia >= 90)  return 'bp-high2';
  if (sys >= 130 || dia >= 80)  return 'bp-high1';
  if (sys >= 120 && dia < 80)   return 'bp-elevated';
  return 'bp-normal';
}

/** Returns CSS class name based on weight vs goal. */
function getWeightClass(kg) {
  const goal = window._weightGoal;
  if (!goal) return '';
  if (kg <= goal)        return 'wt-ok';
  if (kg <= goal * 1.05) return 'wt-warn';
  return 'wt-over';
}

/** Returns CSS class name based on daily step-count thresholds. */
function getStepsClass(count) {
  if (count >= 10000) return 'steps-great';
  if (count >= 7500)  return 'steps-good';
  if (count >= 5000)  return 'steps-ok';
  return 'steps-low';
}

function _bpTagEl(sys, dia) {
  const cls = getBpClass(sys, dia).replace('bp-', '');
  const labels = { normal: 'Normal', elevated: 'Elevated', high1: 'High I', high2: 'High II', crisis: 'Crisis' };
  return labels[cls] ? _makeTagEl(cls, labels[cls]) : null;
}

function _weightTagEl(kg) {
  const cls = getWeightClass(kg);
  if (!cls) return null;
  const map = { 'wt-ok': ['goal-ok', 'On track'], 'wt-warn': ['goal-warn', 'Near limit'], 'wt-over': ['goal-over', 'Over goal'] };
  const [tCls, text] = map[cls] || [];
  return tCls ? _makeTagEl(tCls, text) : null;
}

function _stepsTagEl(count) {
  const cls = getStepsClass(count).replace('steps-', '');
  const labels = { great: '≥ 10k', good: '7.5–10k', ok: '5–7.5k', low: '< 5k' };
  return labels[cls] ? _makeTagEl('steps-' + cls, labels[cls]) : null;
}

// ── Range state ───────────────────────────────────────────────
const ranges = { bp: '1M', weight: '1M', steps: '1M' };

function _setRangeActive(tabId, range) {
  document.querySelectorAll('#' + tabId + ' .range-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.range === range));
}

// ── New Entry Modal ───────────────────────────────────────────
const newEntryModal    = document.getElementById('new-entry-modal');
const newEntrySelector = document.getElementById('new-entry-selector');
const newEntryForms    = { 'blood-pressure': 'new-entry-bp', weight: 'new-entry-weight', steps: 'new-entry-steps' };

function openNewEntryModal(metric) {
  // metric: 'blood-pressure' | 'weight' | 'steps' | 'overview'
  Object.values(newEntryForms).forEach(id =>
    document.getElementById(id)?.classList.add('hidden'));

  if (!metric || metric === 'overview') {
    newEntrySelector?.classList.remove('hidden');
  } else {
    newEntrySelector?.classList.add('hidden');
    document.getElementById(newEntryForms[metric])?.classList.remove('hidden');
  }
  newEntryModal?.classList.remove('hidden');
}

function closeNewEntryModal() {
  newEntryModal?.classList.add('hidden');
  // Reset back to selector for next open
  newEntrySelector?.classList.remove('hidden');
  Object.values(newEntryForms).forEach(id =>
    document.getElementById(id)?.classList.add('hidden'));
}

// Close triggers
document.getElementById('new-entry-close')?.addEventListener('click', closeNewEntryModal);
newEntryModal?.addEventListener('click', e => { if (e.target === newEntryModal) closeNewEntryModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNewEntryModal(); });

// Hero "New entry" button — show selector (opened from Overview tab)
document.getElementById('new-entry-btn')?.addEventListener('click', () => {
  const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
  openNewEntryModal(activeTab === 'dashboard' ? 'overview' : activeTab);
});

// Per-metric "New entry +" buttons
document.getElementById('bp-new-btn')?.addEventListener('click',     () => openNewEntryModal('blood-pressure'));
document.getElementById('weight-new-btn')?.addEventListener('click', () => openNewEntryModal('weight'));
document.getElementById('steps-new-btn')?.addEventListener('click',  () => openNewEntryModal('steps'));

// Metric selector buttons inside modal
document.querySelectorAll('.metric-select-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const metric = btn.dataset.metric;
    newEntrySelector?.classList.add('hidden');
    Object.entries(newEntryForms).forEach(([m, id]) =>
      document.getElementById(id)?.classList.toggle('hidden', m !== metric));
  });
});

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
}

function renderBpTable(records) {
  const tbody = document.querySelector('#bp-table tbody');
  if (!records.length) {
    const msg = window._bpData?.length ? 'No records in selected range' : 'No records yet';
    const tr = document.createElement('tr');
    tr.className = 'empty-row';
    const td = document.createElement('td');
    td.colSpan = 7; td.textContent = msg;
    tr.appendChild(td); tbody.replaceChildren(tr);
    return;
  }
  tbody.replaceChildren();
  records.forEach(r => {
    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.textContent = fmtDatetime(r.measured_at);

    const tdSys = document.createElement('td');
    tdSys.className = 'num'; tdSys.textContent = r.systolic;

    const tdDia = document.createElement('td');
    tdDia.className = 'num'; tdDia.textContent = r.diastolic;

    const tdPulse = document.createElement('td');
    tdPulse.className = 'num'; tdPulse.textContent = r.pulse ?? '—';

    const tdCat = document.createElement('td');
    const chip = _bpTagEl(r.systolic, r.diastolic);
    if (chip) tdCat.appendChild(chip);

    const tdNotes = document.createElement('td');
    tdNotes.className = 'notes'; tdNotes.textContent = r.notes ?? '';

    const tdDel = document.createElement('td');
    tdDel.appendChild(makeDeleteBtn('/api/v1/blood-pressure', r.id, loadBpData));

    tr.append(tdDate, tdSys, tdDia, tdPulse, tdCat, tdNotes, tdDel);
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
    closeNewEntryModal();
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
    const msg = window._weightData?.length ? 'No records in selected range' : 'No records yet';
    const tr = document.createElement('tr');
    tr.className = 'empty-row';
    const td = document.createElement('td');
    td.colSpan = 5; td.textContent = msg;
    tr.appendChild(td); tbody.replaceChildren(tr);
    return;
  }
  tbody.replaceChildren();
  records.forEach(r => {
    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.textContent = fmtDatetime(r.measured_at);

    const tdWt = document.createElement('td');
    tdWt.className = 'num'; tdWt.textContent = r.value_kg.toFixed(1);

    const tdStatus = document.createElement('td');
    const chip = _weightTagEl(r.value_kg);
    if (chip) tdStatus.appendChild(chip);

    const tdNotes = document.createElement('td');
    tdNotes.className = 'notes'; tdNotes.textContent = r.notes ?? '';

    const tdDel = document.createElement('td');
    tdDel.appendChild(makeDeleteBtn('/api/v1/weight', r.id, loadWeightData));

    tr.append(tdDate, tdWt, tdStatus, tdNotes, tdDel);
    tbody.appendChild(tr);
  });
}

// ── Weight goal ───────────────────────────────────────────────
function updateWeightGoalInput(goal) {
  if (goal != null) document.getElementById('weight-goal-input').value = goal;
}

document.getElementById('weight-goal-edit-btn')?.addEventListener('click', () => {
  const row = document.getElementById('weight-goal-edit-row');
  const btn = document.getElementById('weight-goal-edit-btn');
  if (!row) return;
  const open = !row.classList.contains('hidden');
  row.classList.toggle('hidden', open);
  btn.textContent = open ? 'Edit goal' : 'Cancel';
});

document.getElementById('weight-goal-save').addEventListener('click', async () => {
  const val = parseFloat(document.getElementById('weight-goal-input').value);
  const status = document.getElementById('weight-goal-status');
  if (isNaN(val) || val <= 0) { setStatus(status, 'Enter a valid weight', true); return; }
  try {
    const user = await apiPut('/api/v1/auth/weight-goal', { value_kg: val });
    window._weightGoal = user.weight_goal;
    window._weightData && applyWeightRange();
    setStatus(status, 'Goal saved!');
    // collapse edit row
    document.getElementById('weight-goal-edit-row')?.classList.add('hidden');
    document.getElementById('weight-goal-edit-btn')?.textContent === 'Cancel' &&
      (document.getElementById('weight-goal-edit-btn').textContent = 'Edit goal');
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
    closeNewEntryModal();
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
    const msg = window._stepsData?.length ? 'No records in selected range' : 'No records yet';
    const tr = document.createElement('tr');
    tr.className = 'empty-row';
    const td = document.createElement('td');
    td.colSpan = 6; td.textContent = msg;
    tr.appendChild(td); tbody.replaceChildren(tr);
    return;
  }
  tbody.replaceChildren();
  records.forEach(r => {
    const tr = document.createElement('tr');
    const distKm = r.distance_m != null ? (r.distance_m / 1000).toFixed(2) + ' km' : '—';

    const tdDate = document.createElement('td');
    tdDate.textContent = r.step_date;

    const tdSteps = document.createElement('td');
    tdSteps.className = 'num'; tdSteps.textContent = r.step_count.toLocaleString();

    const tdDist = document.createElement('td');
    tdDist.className = 'num'; tdDist.textContent = distKm;

    const tdStatus = document.createElement('td');
    const chip = _stepsTagEl(r.step_count);
    if (chip) tdStatus.appendChild(chip);

    const tdNotes = document.createElement('td');
    tdNotes.className = 'notes'; tdNotes.textContent = r.notes ?? '';

    const tdDel = document.createElement('td');
    tdDel.appendChild(makeDeleteBtn('/api/v1/steps', r.id, loadStepsData));

    tr.append(tdDate, tdSteps, tdDist, tdStatus, tdNotes, tdDel);
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
    closeNewEntryModal();
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

Object.assign(window, { applyBpRange, applyWeightRange, applyStepsRange, updateWeightGoalInput, getBpClass, getWeightClass, getStepsClass });
