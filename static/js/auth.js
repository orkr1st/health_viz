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
      const res = await fetch('/api/auth/register', {
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
    const tokenRes = await fetch('/api/auth/token', {
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
    const meRes = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const meUser = meRes.ok ? await meRes.json() : { username, avatar_url: null };
    setHeaderUser(meUser.username, meUser.avatar_url);
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
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      clearToken();
      showOverlay();
      return;
    }
    const user = await res.json();
    setHeaderUser(user.username, user.avatar_url);
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
  const res = await fetch('/api/auth/avatar', {
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

  const res = await fetch('/api/auth/change-password', {
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

// Expose logout globally
window.logout = logout;
