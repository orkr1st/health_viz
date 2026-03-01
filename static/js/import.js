// ── Modal helpers ─────────────────────────────────────────────
const modal     = document.getElementById('import-modal');
const modalBody = document.getElementById('modal-body');

function openModal() { modal.classList.remove('hidden'); }
function closeModal() { modal.classList.add('hidden'); }

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-close-btn').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// ── Log viewer ────────────────────────────────────────────────
async function openLog() {
  modalBody.innerHTML = '<p style="color:var(--muted)">Loading log…</p>';
  openModal();
  try {
    const token = localStorage.getItem('health_token');
    const res  = await fetch('/api/import/log?lines=300', {
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

// ── Build results view ────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text}`);
    }
    const results = await res.json();

    // Quick header status
    const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
    const totalErrors   = results.reduce((s, r) => s + r.errors,   0);
    statusEl.textContent = `+${totalInserted} inserted, ${totalErrors} errors`;
    statusEl.className   = totalErrors > 0 ? 'error' : 'success';
    setTimeout(() => { statusEl.textContent = ''; statusEl.className = ''; }, 6000);

    // Full results in modal
    modalBody.innerHTML = buildResultsHtml(results);
    openModal();

    // Refresh the active tab's data
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
    if (activeTab) {
      window.dispatchEvent(new CustomEvent('tabchange', { detail: activeTab }));
    }

    fileInput.value = '';
    document.getElementById('import-file-name').textContent = 'No file selected';
  } catch (err) {
    statusEl.textContent = 'Import failed: ' + err.message;
    statusEl.className   = 'error';
    modalBody.innerHTML  = `<p style="color:var(--danger)">${escHtml(err.message)}</p>`;
    openModal();
  }
});
