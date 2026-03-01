// ── Tab routing ───────────────────────────────────────────────
const tabBtns    = document.querySelectorAll('.tab-btn');
const tabPanels  = document.querySelectorAll('.tab-content');

function showTab(name) {
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  tabPanels.forEach(p => {
    const active = p.id === `tab-${name}`;
    p.classList.toggle('active', active);
  });
  // Trigger chart/data refresh for the newly shown tab
  window.dispatchEvent(new CustomEvent('tabchange', { detail: name }));
}

tabBtns.forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));

// ── Shared API helpers ────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  });
  if (res.status === 401) {
    clearToken();
    location.reload();
    return;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function apiGet(path)         { return apiFetch(path); }
async function apiPost(path, body)  { return apiFetch(path, { method: 'POST', body: JSON.stringify(body) }); }
async function apiDelete(path)      { return apiFetch(path, { method: 'DELETE' }); }

// ── Date formatting ───────────────────────────────────────────
function fmtDatetime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function fmtDate(str) {
  if (!str) return '—';
  return str.substring(0, 10);
}

// ── Status helpers ────────────────────────────────────────────
function setStatus(el, msg, isError = false) {
  el.textContent = msg;
  el.className = 'form-status ' + (isError ? 'error' : 'success');
  setTimeout(() => { el.textContent = ''; el.className = 'form-status'; }, 4000);
}

// ── Date range filters ────────────────────────────────────────
function last30Days(records, dateField) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  return records.filter(r => new Date(r[dateField]) >= cutoff);
}

function last7Days(records, dateField) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  return records.filter(r => new Date(r[dateField]) >= cutoff);
}

function avg(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
}

// Make helpers global so other scripts can use them
Object.assign(window, {
  apiFetch, apiGet, apiPost, apiDelete,
  fmtDatetime, fmtDate, setStatus, last30Days, last7Days, avg,
});

// Show dashboard on load
showTab('dashboard');
