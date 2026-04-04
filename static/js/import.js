// ── Modal helpers ─────────────────────────────────────────────
const modal     = document.getElementById('import-modal');
const modalBody = document.getElementById('modal-body');

let _activePoll = null;

function _cancelPoll() {
  if (_activePoll !== null) { clearInterval(_activePoll); _activePoll = null; }
}

function openModal() { modal.classList.remove('hidden'); }
function closeModal() { modal.classList.add('hidden'); _cancelPoll(); }

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-close-btn').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
window.addEventListener('beforeunload', _cancelPoll);

// ── Log viewer ────────────────────────────────────────────────
async function openLog() {
  modalBody.innerHTML = '<p style="color:var(--muted)">Loading log…</p>';
  openModal();
  try {
    const token = localStorage.getItem('health_token');
    const res  = await fetch('/api/v1/import/log?lines=300', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const text = await res.text();
    modalBody.innerHTML = `<pre class="log-pre">${escHtml(text || '(log is empty)')}</pre>`;
  } catch (err) {
    modalBody.innerHTML = `<p style="color:var(--danger)">Failed to load log: ${escHtml(err.message)}</p>`;
  }
}

document.getElementById('modal-view-log').addEventListener('click', openLog);
document.getElementById('view-log-btn').addEventListener('click', openLog);

// ── Data export ───────────────────────────────────────────────
document.getElementById('export-btn').addEventListener('click', async () => {
  const token = getToken();
  const res = await fetch('/api/v1/export', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) { alert('Export failed: ' + res.status); return; }
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const cd   = res.headers.get('Content-Disposition') || '';
  const match = cd.match(/filename="([^"]+)"/);
  a.href     = url;
  a.download = match ? match[1] : 'health_export.zip';
  a.click();
  URL.revokeObjectURL(url);
});

// ── Print report ─────────────────────────────────────────────
function printReport() {
  const username = document.getElementById('header-username')?.textContent ?? '';
  const today    = new Date().toLocaleDateString(undefined, { dateStyle: 'long' });

  function bpRows() {
    return (window._bpData || []).slice(0, 30).map(r => {
      const cls = typeof getBpClass === 'function' ? getBpClass(r.systolic, r.diastolic) : '';
      return `<tr class="${escHtml(cls)}">
        <td>${escHtml(String(r.measured_at).slice(0, 16).replace('T', ' '))}</td>
        <td>${r.systolic}</td><td>${r.diastolic}</td>
        <td>${r.pulse ?? '—'}</td><td>${escHtml(r.notes ?? '')}</td></tr>`;
    }).join('');
  }

  function weightRows() {
    return (window._weightData || []).slice(0, 30).map(r => {
      const cls = typeof getWeightClass === 'function' ? getWeightClass(r.value_kg) : '';
      return `<tr class="${escHtml(cls)}">
        <td>${escHtml(String(r.measured_at).slice(0, 16).replace('T', ' '))}</td>
        <td>${r.value_kg.toFixed(1)} kg</td><td>${escHtml(r.notes ?? '')}</td></tr>`;
    }).join('');
  }

  function stepsRows() {
    return (window._stepsData || []).slice(0, 30).map(r => {
      const cls = typeof getStepsClass === 'function' ? getStepsClass(r.step_count) : '';
      const dist = r.distance_m != null ? (r.distance_m / 1000).toFixed(2) + ' km' : '—';
      return `<tr class="${escHtml(cls)}">
        <td>${escHtml(r.step_date)}</td>
        <td>${r.step_count.toLocaleString()}</td><td>${dist}</td>
        <td>${escHtml(r.notes ?? '')}</td></tr>`;
    }).join('');
  }

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Health Report — ${escHtml(username)} — ${escHtml(today)}</title>
<style>
  body { font-family: system-ui, sans-serif; font-size: 12px; color: #1a1a1a; padding: 2cm; }
  h1 { font-size: 1.4rem; margin-bottom: 0.25rem; }
  h2 { font-size: 1rem; margin: 1.5rem 0 0.4rem; border-bottom: 1px solid #ccc; padding-bottom: 0.2rem; }
  p.meta { color: #666; font-size: 0.85rem; margin: 0 0 1rem; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
  th, td { border: 1px solid #ddd; padding: 4px 8px; text-align: left; }
  th { background: #f4f4f4; font-weight: 600; }
  tr.bp-normal   { background: rgba(22,163,74,0.08); }
  tr.bp-elevated { background: rgba(234,179,8,0.12); }
  tr.bp-high1    { background: rgba(249,115,22,0.12); }
  tr.bp-high2    { background: rgba(239,68,68,0.12); }
  tr.bp-crisis   { background: rgba(185,28,28,0.22); }
  tr.wt-ok   { background: rgba(22,163,74,0.08); }
  tr.wt-warn { background: rgba(234,179,8,0.12); }
  tr.wt-over { background: rgba(239,68,68,0.12); }
  tr.steps-great { background: rgba(22,163,74,0.08); }
  tr.steps-good  { background: rgba(132,204,22,0.12); }
  tr.steps-ok    { background: rgba(234,179,8,0.12); }
  tr.steps-low   { background: rgba(239,68,68,0.10); }
  @media print { body { padding: 0; } }
</style></head><body>
<h1>Health Report</h1>
<p class="meta">${escHtml(username)} &nbsp;&middot;&nbsp; ${escHtml(today)}</p>
<h2>Blood Pressure (last 30 readings)</h2>
<table><thead><tr><th>Date</th><th>Sys</th><th>Dia</th><th>Pulse</th><th>Notes</th></tr></thead>
<tbody>${bpRows() || '<tr><td colspan="5">No data</td></tr>'}</tbody></table>
<h2>Weight (last 30 readings)</h2>
<table><thead><tr><th>Date</th><th>Weight</th><th>Notes</th></tr></thead>
<tbody>${weightRows() || '<tr><td colspan="3">No data</td></tr>'}</tbody></table>
<h2>Steps (last 30 days)</h2>
<table><thead><tr><th>Date</th><th>Steps</th><th>Distance</th><th>Notes</th></tr></thead>
<tbody>${stepsRows() || '<tr><td colspan="4">No data</td></tr>'}</tbody></table>
<script>window.onload = function() { window.print(); }<\/script>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

document.getElementById('print-report-btn').addEventListener('click', printReport);

// ── Build results view ────────────────────────────────────────
function buildResultsHtml(results) {
  const rows = results.map(r => {
    const errCell  = r.errors  > 0 ? `<td class="num cell-error">${r.errors}</td>`  : `<td class="num">${r.errors}</td>`;
    const insCell  = r.inserted > 0 ? `<td class="num cell-ok">${r.inserted}</td>` : `<td class="num">${r.inserted}</td>`;
    return `<tr>
      <td title="${escHtml(r.filename)}">${escHtml(r.filename.length > 45 ? '…' + r.filename.slice(-43) : r.filename)}</td>
      <td>${escHtml(r.metric)}</td>
      ${insCell}
      <td class="num">${r.skipped}</td>
      ${errCell}
    </tr>`;
  }).join('');

  const accordions = results
    .filter(r => r.error_messages && r.error_messages.length > 0)
    .map(r => `
      <details class="error-accordion">
        <summary>${escHtml(r.metric)} — ${r.error_messages.length} error message(s)</summary>
        <pre>${escHtml(r.error_messages.join('\n'))}</pre>
      </details>`)
    .join('');

  return `
    <table class="import-result-table">
      <thead>
        <tr><th>File</th><th>Metric</th><th>Inserted</th><th>Skipped</th><th>Errors</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${accordions}`;
}

// ── File selection display ────────────────────────────────────
document.getElementById('import-file').addEventListener('change', (e) => {
  const name = e.target.files[0]?.name ?? '';
  document.getElementById('import-file-name').textContent = name || 'No file selected';
  // Re-show the dropdown in case the OS file dialog closed it
  document.getElementById('settings-dropdown').classList.remove('hidden');
});

// ── Import helpers (shared between submit handler and poll) ───
function _setModalError(msg) {
  const p = document.createElement('p');
  p.style.color = 'var(--danger)';
  p.textContent = msg;
  modalBody.replaceChildren(p);
}

function _finishImport(results) {
  const statusEl     = document.getElementById('import-status');
  const fileInput    = document.getElementById('import-file');
  const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
  const totalErrors   = results.reduce((s, r) => s + r.errors,   0);
  statusEl.textContent = `+${totalInserted} inserted, ${totalErrors} errors`;
  statusEl.className   = totalErrors > 0 ? 'error' : 'success';
  setTimeout(() => { statusEl.textContent = ''; statusEl.className = ''; }, 6000);
  modalBody.innerHTML = buildResultsHtml(results);
  const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
  if (activeTab) window.dispatchEvent(new CustomEvent('tabchange', { detail: activeTab }));
  fileInput.value = '';
  document.getElementById('import-file-name').textContent = 'No file selected';
}

// ── Form submit ───────────────────────────────────────────────
document.getElementById('import-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const statusEl  = document.getElementById('import-status');
  const fileInput = document.getElementById('import-file');
  const file      = fileInput.files[0];

  if (!file) {
    statusEl.textContent = 'Please select a file first.';
    statusEl.className   = 'error';
    return;
  }

  statusEl.textContent = 'Importing…';
  statusEl.className   = '';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const token = localStorage.getItem('health_token');
    const res = await fetch('/api/v1/import', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    if (res.status === 202) {
      const { job_id } = await res.json();
      statusEl.textContent = 'Processing large file\u2026';
      const p = document.createElement('p');
      p.style.color = 'var(--muted)';
      p.textContent = 'Processing\u2026 please wait.';
      modalBody.replaceChildren(p);
      openModal();
      _activePoll = setInterval(async () => {
        try {
          const sr = await fetch(`/api/v1/import/status/${job_id}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (!sr.ok) { _cancelPoll(); return; }
          const job = await sr.json();
          if (job.status === 'done') {
            _cancelPoll();
            _finishImport(job.results);
          } else if (job.status === 'error') {
            _cancelPoll();
            statusEl.textContent = 'Import failed: ' + (job.error || 'unknown error');
            statusEl.className   = 'error';
            _setModalError(job.error || 'Unknown error');
          }
        } catch { _cancelPoll(); }
      }, 2000);
      return;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text}`);
    }
    _finishImport(await res.json());
    openModal();
  } catch (err) {
    statusEl.textContent = 'Import failed: ' + err.message;
    statusEl.className   = 'error';
    _setModalError(err.message);
    openModal();
  }
});
