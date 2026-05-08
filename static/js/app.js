// ── Tab routing ───────────────────────────────────────────────
const tabBtns    = document.querySelectorAll('.tab-btn');
const tabPanels  = document.querySelectorAll('.tab-content');

function showTab(name, fireEvent = true) {
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  tabPanels.forEach(p => {
    const active = p.id === `tab-${name}`;
    p.classList.toggle('active', active);
  });
  // Trigger chart/data refresh for the newly shown tab
  if (fireEvent) window.dispatchEvent(new CustomEvent('tabchange', { detail: name }));
}

tabBtns.forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));

document.querySelector('.metrics').addEventListener('click', e => {
  const card = e.target.closest('[data-nav-tab]');
  if (card) showTab(card.dataset.navTab);
});

// ── Settings dropdown ─────────────────────────────────────────
const settingsBtn      = document.getElementById('settings-btn');
const settingsDropdown = document.getElementById('settings-dropdown');
settingsBtn.addEventListener('click', e => {
  e.stopPropagation();
  settingsDropdown.classList.toggle('hidden');
});
settingsDropdown.addEventListener('click', e => e.stopPropagation());
document.addEventListener('click', () => settingsDropdown.classList.add('hidden'));

// ── Shared API helpers ────────────────────────────────────────
let _reloading = false;
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
    if (!_reloading) {
      _reloading = true;
      clearToken();
      location.reload();
    }
    return;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function apiGet(path)          { return apiFetch(path); }
async function apiPost(path, body)   { return apiFetch(path, { method: 'POST', body: JSON.stringify(body) }); }
async function apiPut(path, body)    { return apiFetch(path, { method: 'PUT',  body: JSON.stringify(body) }); }
async function apiDelete(path)       { return apiFetch(path, { method: 'DELETE' }); }

// ── Date formatting ───────────────────────────────────────────
function fmtDatetime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const mon = d.toLocaleString('default', { month: 'short' });
  const day = d.getDate();
  const hh  = String(d.getHours()).padStart(2, '0');
  const mm  = String(d.getMinutes()).padStart(2, '0');
  return `${mon} ${day} · ${hh}:${mm}`;
}

function fmtDate(str) {
  if (!str) return '—';
  return str.substring(0, 10);
}

// ── HTML escaping (use for all user-controlled data in innerHTML) ─────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function filterRange(records, dateField, range) {
  if (range === 'all') return records;
  const days = { '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '5Y': 1825 }[range];
  if (!days) return records;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return records.filter(r => new Date(r[dateField]) >= cutoff);
}

function avg(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
}

// ── Aggregation helpers ───────────────────────────────────────
function _weekStart(d) {
  const date = new Date(typeof d === 'string' && d.length === 10 ? d + 'T00:00:00' : d);
  const day  = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
}

function aggregateRecords(records, dateField, level) {
  if (!level || level === 'none' || !records.length) return records;
  const getKey = r => {
    const src = r[dateField];
    const d   = new Date(typeof src === 'string' && src.length === 10 ? src + 'T00:00:00' : src);
    if (level === 'day')   return d.toISOString().slice(0, 10);
    if (level === 'week')  return _weekStart(d);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
  };
  const groups = new Map();
  records.forEach(r => {
    const k = getKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  });
  const numFields = Object.keys(records[0]).filter(k =>
    k !== 'id' && k !== dateField && records.some(r => typeof r[k] === 'number')
  );
  return [...groups.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([key, recs]) => {
    const agg = { [dateField]: key };
    numFields.forEach(f => {
      const vals = recs.map(r => r[f]).filter(v => v != null);
      agg[f] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    });
    return agg;
  });
}

function rangeAggLevel(range) {
  return { '1W': 'none', '1M': 'day', '3M': 'week', '6M': 'week', '1Y': 'month', '5Y': 'month', 'all': 'month' }[range] ?? 'none';
}

// Make helpers global so other scripts can use them
Object.assign(window, {
  apiFetch, apiGet, apiPost, apiPut, apiDelete,
  fmtDatetime, fmtDate, setStatus, last30Days, last7Days, avg, filterRange, escHtml,
  aggregateRecords, rangeAggLevel,
});

// Show dashboard on load (no tabchange — authReady handles initial data load)
showTab('dashboard', false);
