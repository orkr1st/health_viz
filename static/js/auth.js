// ── Token storage ─────────────────────────────────────────────
function getToken() { return localStorage.getItem('health_token'); }
function setToken(t) { localStorage.setItem('health_token', t); }
function clearToken() { localStorage.removeItem('health_token'); }

// ── Overlay helpers ───────────────────────────────────────────
const overlay      = document.getElementById('auth-overlay');
const authTitle    = document.getElementById('auth-title');
const authError    = document.getElementById('auth-error');
const submitBtn    = document.getElementById('auth-submit-btn');
const toggleBtn    = document.getElementById('auth-toggle-btn');
const headerUser        = document.getElementById('header-username');
const logoutBtn         = document.getElementById('logout-btn');
const authConfirmWrap   = document.getElementById('auth-confirm-wrap');
const authPasswordConfirm = document.getElementById('auth-password-confirm');

let isRegisterMode = false;

function showOverlay() { overlay.classList.remove('hidden'); }
function hideOverlay() { overlay.classList.add('hidden'); }

function setAuthError(msg) { authError.textContent = msg; }
function clearAuthError()  { authError.textContent = ''; }

function setHeaderUser(username, avatarUrl) {
  headerUser.textContent = username;
  const img = document.getElementById('header-avatar');
  const placeholder = document.getElementById('header-avatar-placeholder');
  if (avatarUrl) {
    img.src = avatarUrl + '?v=' + Date.now();
    img.classList.remove('hidden');
    placeholder.style.display = 'none';
  } else {
    img.classList.add('hidden');
    placeholder.style.display = '';
    placeholder.textContent = username.charAt(0).toUpperCase();
  }
}

// ── Mode toggle ───────────────────────────────────────────────
toggleBtn.addEventListener('click', () => {
  isRegisterMode = !isRegisterMode;
  authTitle.textContent   = isRegisterMode ? 'Register' : 'Login';
  submitBtn.textContent   = isRegisterMode ? 'Create account' : 'Log in';
  toggleBtn.textContent   = isRegisterMode ? 'Already have an account? Log in' : 'No account? Register';
  authConfirmWrap.style.display = isRegisterMode ? '' : 'none';
  authPasswordConfirm.value = '';
  clearAuthError();
});

// ── Submit handler ────────────────────────────────────────────
submitBtn.addEventListener('click', async () => {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  clearAuthError();

  if (!username || !password) {
    setAuthError('Username and password are required.');
    return;
  }

  if (isRegisterMode && password !== authPasswordConfirm.value) {
    setAuthError('Passwords do not match.');
    return;
  }

  try {
    if (isRegisterMode) {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAuthError(data.detail || 'Registration failed.');
        return;
      }
    }
    // Login (runs for both register-then-login and direct login)
    const form = new URLSearchParams({ username, password });
    const tokenRes = await fetch('/api/v1/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (!tokenRes.ok) {
      const data = await tokenRes.json().catch(() => ({}));
      setAuthError(data.detail || 'Login failed.');
      return;
    }
    const { access_token } = await tokenRes.json();
    setToken(access_token);
    const meRes = await fetch('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const meUser = meRes.ok ? await meRes.json() : { username, avatar_url: null };
    setHeaderUser(meUser.username, meUser.avatar_url);
    window._weightGoal = meUser.weight_goal ?? null;
    window.updateWeightGoalInput?.(window._weightGoal);
    hideOverlay();
    window.dispatchEvent(new CustomEvent('authReady'));
  } catch (err) {
    setAuthError('Network error. Please try again.');
  }
});

// Allow Enter key to submit
document.getElementById('auth-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitBtn.click();
});
authPasswordConfirm.addEventListener('keydown', e => {
  if (e.key === 'Enter') submitBtn.click();
});
document.getElementById('auth-username').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitBtn.click();
});

// ── Logout ────────────────────────────────────────────────────
function logout() {
  clearToken();
  location.reload();
}
logoutBtn.addEventListener('click', logout);

// ── Init: validate existing token or show overlay ─────────────
(async function init() {
  const token = getToken();
  if (!token) {
    showOverlay();
    return;
  }
  try {
    const res = await fetch('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      clearToken();
      showOverlay();
      return;
    }
    const user = await res.json();
    setHeaderUser(user.username, user.avatar_url);
    window._weightGoal = user.weight_goal ?? null;
    window.updateWeightGoalInput?.(window._weightGoal);
    hideOverlay();
    window.dispatchEvent(new CustomEvent('authReady'));
  } catch {
    showOverlay();
  }
})();

// ── Avatar upload ─────────────────────────────────────────────
['header-avatar', 'header-avatar-placeholder', 'change-avatar-btn'].forEach(id => {
  document.getElementById(id).addEventListener('click', () =>
    document.getElementById('avatar-file-input').click()
  );
});

document.getElementById('avatar-file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/v1/auth/avatar', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: fd,
  });
  if (res.ok) {
    const user = await res.json();
    setHeaderUser(user.username, user.avatar_url);
  }
  e.target.value = '';
});

// ── Change password ───────────────────────────────────────────
const pwToggleBtn = document.getElementById('pw-toggle-btn');
const pwFields    = document.getElementById('pw-fields');
const pwStatus    = document.getElementById('pw-status');

pwToggleBtn.addEventListener('click', () => {
  const open = pwFields.style.display !== 'none';
  pwFields.style.display = open ? 'none' : '';
  pwToggleBtn.textContent = open ? 'Change password…' : 'Hide';
  pwStatus.textContent = '';
  pwStatus.className = 'form-status';
  if (!open) document.getElementById('pw-current').focus();
});

document.getElementById('pw-submit-btn').addEventListener('click', async () => {
  const current = document.getElementById('pw-current').value;
  const newPw   = document.getElementById('pw-new').value;
  const confirm = document.getElementById('pw-confirm').value;
  pwStatus.textContent = '';
  pwStatus.className = 'form-status';

  if (!current || !newPw) {
    pwStatus.textContent = 'All fields are required.';
    pwStatus.className = 'form-status error';
    return;
  }
  if (newPw !== confirm) {
    pwStatus.textContent = 'New passwords do not match.';
    pwStatus.className = 'form-status error';
    return;
  }

  const res = await fetch('/api/v1/auth/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ current_password: current, new_password: newPw }),
  });

  if (res.ok) {
    pwStatus.textContent = 'Password updated.';
    pwStatus.className = 'form-status success';
    document.getElementById('pw-current').value = '';
    document.getElementById('pw-new').value = '';
    document.getElementById('pw-confirm').value = '';
  } else {
    const data = await res.json().catch(() => ({}));
    pwStatus.textContent = data.detail || 'Failed to update password.';
    pwStatus.className = 'form-status error';
  }
});

// ── Help modal ────────────────────────────────────────────────
const helpModal = document.getElementById('help-modal');
function openHelpModal()  { helpModal.classList.remove('hidden'); }
function closeHelpModal() { helpModal.classList.add('hidden'); }
document.getElementById('help-btn').addEventListener('click', openHelpModal);
document.getElementById('help-modal-close').addEventListener('click', closeHelpModal);
document.getElementById('help-modal-close-btn').addEventListener('click', closeHelpModal);
helpModal.addEventListener('click', e => { if (e.target === helpModal) closeHelpModal(); });

// ── Deduplicate ───────────────────────────────────────────────
const dedupBtn       = document.getElementById('dedup-btn');
const dedupStatus    = document.getElementById('dedup-status');
const dedupModal     = document.getElementById('dedup-modal');
const dedupModalBody = document.getElementById('dedup-modal-body');
const dedupConfirm   = document.getElementById('dedup-confirm-btn');

function closeDedupModal() {
  dedupModal.classList.add('hidden');
}
document.getElementById('dedup-modal-close').addEventListener('click', closeDedupModal);
document.getElementById('dedup-cancel-btn').addEventListener('click', closeDedupModal);
dedupModal.addEventListener('click', (e) => { if (e.target === dedupModal) closeDedupModal(); });

function buildDedupBody(data) {
  const total = data.blood_pressure.length + data.weight.length + data.steps.length;
  dedupConfirm.textContent = `Remove ${total} duplicate(s)`;

  let html = `<p style="margin-bottom:0.75rem">The following records will be <strong>permanently deleted</strong>. The earliest entry in each group is kept.</p>`;

  if (data.blood_pressure.length) {
    html += `<h3 style="font-size:0.9rem;margin:0.5rem 0 0.25rem">Blood Pressure (${data.blood_pressure.length})</h3><ul class="dedup-list">`;
    data.blood_pressure.forEach(r => {
      const pulse = r.pulse != null ? ` pulse ${r.pulse}` : '';
      html += `<li>${fmtDatetime(r.measured_at)} — ${r.systolic}/${r.diastolic}${pulse}</li>`;
    });
    html += '</ul>';
  }

  if (data.weight.length) {
    html += `<h3 style="font-size:0.9rem;margin:0.5rem 0 0.25rem">Weight (${data.weight.length})</h3><ul class="dedup-list">`;
    data.weight.forEach(r => {
      html += `<li>${fmtDatetime(r.measured_at)} — ${r.value_kg.toFixed(1)} kg</li>`;
    });
    html += '</ul>';
  }

  if (data.steps.length) {
    html += `<h3 style="font-size:0.9rem;margin:0.5rem 0 0.25rem">Steps (${data.steps.length})</h3><ul class="dedup-list">`;
    data.steps.forEach(r => {
      html += `<li>${r.step_date} — ${r.step_count.toLocaleString()} steps</li>`;
    });
    html += '</ul>';
  }

  dedupModalBody.innerHTML = html;
}

dedupBtn.addEventListener('click', async () => {
  dedupStatus.textContent = 'Scanning…';
  dedupStatus.className = 'form-status';
  try {
    const res = await fetch('/api/v1/deduplicate', {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const total = data.blood_pressure.length + data.weight.length + data.steps.length;
    if (total === 0) {
      dedupStatus.textContent = 'No duplicates found.';
    } else {
      dedupStatus.textContent = '';
      buildDedupBody(data);
      dedupModal.classList.remove('hidden');
    }
  } catch (err) {
    dedupStatus.textContent = 'Failed: ' + err.message;
    dedupStatus.className = 'form-status error';
  }
});

dedupConfirm.addEventListener('click', async () => {
  dedupConfirm.disabled = true;
  try {
    const res = await fetch('/api/v1/deduplicate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const total = data.blood_pressure + data.weight + data.steps;
    closeDedupModal();
    dedupStatus.textContent =
      `Removed ${total} duplicate(s): ${data.blood_pressure} BP, ${data.weight} weight, ${data.steps} steps.`;
    dedupStatus.className = 'form-status success';
  } catch (err) {
    dedupStatus.textContent = 'Failed: ' + err.message;
    dedupStatus.className = 'form-status error';
  } finally {
    dedupConfirm.disabled = false;
  }
});

// ── Import History ────────────────────────────────────────────
const importHistoryBtn   = document.getElementById('import-history-btn');
const importHistoryModal = document.getElementById('import-history-modal');
const importHistoryList  = document.getElementById('import-history-list');

function closeImportHistoryModal() {
  importHistoryModal.classList.add('hidden');
}
document.getElementById('import-history-modal-close').addEventListener('click', closeImportHistoryModal);
importHistoryModal.addEventListener('click', e => { if (e.target === importHistoryModal) closeImportHistoryModal(); });

function fmtImportDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function renderImportHistory(batches) {
  if (!batches.length) {
    importHistoryList.innerHTML = '<p class="import-history-empty">No imports found.</p>';
    return;
  }
  importHistoryList.innerHTML = batches.map(b => {
    const counts = [];
    if (b.bp_count)     counts.push(`${b.bp_count} BP`);
    if (b.weight_count) counts.push(`${b.weight_count} weight`);
    if (b.steps_count)  counts.push(`${b.steps_count} steps`);
    const countStr = counts.length ? counts.join(', ') : '0 records';
    return `<div class="import-history-row" data-id="${b.id}">
      <span class="import-history-name">${escHtml(b.filename)}</span>
      <span class="import-history-date">${fmtImportDate(b.imported_at)}</span>
      <span class="import-history-counts">${escHtml(countStr)}</span>
      <button class="btn-danger-sm" data-id="${b.id}" data-name="${escHtml(b.filename)}" data-count="${escHtml(counts.join(', ') || '0 records')}">Delete</button>
    </div>`;
  }).join('');

  importHistoryList.querySelectorAll('button[data-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id   = btn.dataset.id;
      const name = btn.dataset.name;
      const cnt  = btn.dataset.count;
      if (!confirm(`Delete ${cnt} from "${name}"?\nThis cannot be undone.`)) return;
      try {
        const res = await fetch(`/api/v1/imports/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) throw new Error(await res.text());
        // Remove row from DOM
        btn.closest('.import-history-row').remove();
        if (!importHistoryList.querySelector('.import-history-row')) {
          importHistoryList.innerHTML = '<p class="import-history-empty">No imports found.</p>';
        }
        // Refresh charts
        window.applyBpRange?.();
        window.applyWeightRange?.();
        window.applyStepsRange?.();
      } catch (err) {
        alert('Delete failed: ' + err.message);
      }
    });
  });
}

importHistoryBtn.addEventListener('click', async () => {
  importHistoryList.innerHTML = '<p class="import-history-empty">Loading…</p>';
  importHistoryModal.classList.remove('hidden');
  try {
    const res = await fetch('/api/v1/imports', {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error(await res.text());
    renderImportHistory(await res.json());
  } catch (err) {
    importHistoryList.innerHTML = `<p class="import-history-empty">Error: ${err.message}</p>`;
  }
});

// Expose logout globally
window.logout = logout;
