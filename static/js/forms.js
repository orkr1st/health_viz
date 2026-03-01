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

// ── Blood Pressure ────────────────────────────────────────────

async function loadBpData() {
  const data = await apiGet('/api/blood-pressure');
  window._bpData = data;
  renderBpTable(data);
  buildBpChart(data);
}

function renderBpTable(records) {
  const tbody = document.querySelector('#bp-table tbody');
  if (!records.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No records yet</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  records.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDatetime(r.measured_at)}</td>
      <td>${r.systolic}</td>
      <td>${r.diastolic}</td>
      <td>${r.pulse ?? '—'}</td>
      <td>${r.notes ?? ''}</td>
      <td></td>`;
    tr.lastElementChild.appendChild(makeDeleteBtn('/api/blood-pressure', r.id, loadBpData));
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
    await apiPost('/api/blood-pressure', body);
    setStatus(status, 'Saved!');
    e.target.reset();
    await loadBpData();
  } catch (err) {
    setStatus(status, err.message, true);
  }
});

// ── Weight ────────────────────────────────────────────────────

async function loadWeightData() {
  const data = await apiGet('/api/weight');
  window._weightData = data;
  renderWeightTable(data);
  buildWeightChart(data);
}

function renderWeightTable(records) {
  const tbody = document.querySelector('#weight-table tbody');
  if (!records.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">No records yet</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  records.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDatetime(r.measured_at)}</td>
      <td>${r.value_kg.toFixed(1)}</td>
      <td>${r.notes ?? ''}</td>
      <td></td>`;
    tr.lastElementChild.appendChild(makeDeleteBtn('/api/weight', r.id, loadWeightData));
    tbody.appendChild(tr);
  });
}

// ── Weight goal ───────────────────────────────────────────────
(function () {
  const input = document.getElementById('weight-goal-input');
  const saved = localStorage.getItem('weightGoal');
  if (saved) input.value = saved;

  document.getElementById('weight-goal-save').addEventListener('click', () => {
    const val = parseFloat(input.value);
    const status = document.getElementById('weight-goal-status');
    if (isNaN(val) || val <= 0) { setStatus(status, 'Enter a valid weight', true); return; }
    localStorage.setItem('weightGoal', val);
    window._weightData && buildWeightChart(window._weightData);
    setStatus(status, 'Goal saved!');
  });
})();

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
    await apiPost('/api/weight', body);
    setStatus(status, 'Saved!');
    e.target.reset();
    await loadWeightData();
  } catch (err) {
    setStatus(status, err.message, true);
  }
});

// ── Steps ─────────────────────────────────────────────────────

async function loadStepsData() {
  const data = await apiGet('/api/steps');
  window._stepsData = data;
  renderStepsTable(data);
  buildStepsChart(data);
  buildDistanceChart(data);
}

function renderStepsTable(records) {
  const tbody = document.querySelector('#steps-table tbody');
  if (!records.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">No records yet</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  records.forEach(r => {
    const distKm = r.distance_m != null ? (r.distance_m / 1000).toFixed(2) + ' km' : '—';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.step_date}</td>
      <td>${r.step_count.toLocaleString()}</td>
      <td>${distKm}</td>
      <td></td>`;
    tr.lastElementChild.appendChild(makeDeleteBtn('/api/steps', r.id, loadStepsData));
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
  };
  try {
    await apiPost('/api/steps', body);
    setStatus(status, 'Saved!');
    e.target.reset();
    await loadStepsData();
  } catch (err) {
    setStatus(status, err.message, true);
  }
});

// ── Load data when tab is shown ───────────────────────────────
window.addEventListener('tabchange', async (e) => {
  const tab = e.detail;
  if (tab === 'blood-pressure') await loadBpData().catch(console.error);
  if (tab === 'weight')         await loadWeightData().catch(console.error);
if (tab === 'steps')          await loadStepsData().catch(console.error);
});
