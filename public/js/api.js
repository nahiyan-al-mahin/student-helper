// =====================================================================
//  api.js - shared helpers used by every page
//   - api():   call the server's REST API with the login token
//   - auth:    save / read / clear the login
//   - UI bits: toast messages, modals, escaping, time formatting
// =====================================================================

// The API lives on the same server as the website.
// (A mobile app would point this at the server's address instead.)
// The phone app (later) will set window.API_URL to the hosted address,
// e.g. 'https://student-helper.onrender.com', before loading this file.
const API_BASE = (window.API_URL || '') + '/api';

const auth = {
  get token() { return localStorage.getItem('sh_token'); },
  get user() { try { return JSON.parse(localStorage.getItem('sh_user')); } catch { return null; } },
  save(token, user) {
    if (token) localStorage.setItem('sh_token', token);
    localStorage.setItem('sh_user', JSON.stringify(user));
  },
  logout() {
    localStorage.removeItem('sh_token');
    localStorage.removeItem('sh_user');
    location.href = '/login.html';
  },
};

// api('GET', '/today')   api('POST', '/goals', { title: 'Read' })
// Throws an Error with the server's message when something fails.
async function api(method, path, body) {
  const headers = {};
  if (auth.token) headers.Authorization = 'Bearer ' + auth.token;
  const isForm = body instanceof FormData;
  if (body && !isForm) headers['Content-Type'] = 'application/json';

  // The free server sleeps when nobody uses it. The first request can take
  // up to a minute, so tell the student what is going on.
  const slow = setTimeout(() => { if (!api.wakeShown) { api.wakeShown = true; toast('Waking up the server, this can take up to a minute...'); } }, 5000);
  let res;
  try {
    res = await fetch(API_BASE + path, { method, headers, body: isForm ? body : body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('No internet connection, or the server is not reachable.');
  } finally { clearTimeout(slow); }
  let data = {};
  try { data = await res.json(); } catch { /* empty response */ }

  if (res.status === 401 && path !== '/auth/login') { auth.logout(); throw new Error(data.error); }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ---------- Small UI helpers ----------

// Makes text safe to put inside HTML (stops <script> injection from user content)
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function toast(message, type = '') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = message;
  box.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// Opens a modal with the given inner HTML. Returns the modal element.
// Any element with [data-close] closes it.
function openModal(html, { wide = false, onClose } = {}) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}">${html}</div>`;
  const close = () => { bg.remove(); onClose && onClose(); };
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
  document.body.appendChild(bg);
  const modal = bg.firstElementChild;
  modal.close = close;
  return modal;
}

// Run an async action from a button: disables it while working and shows errors.
async function withButton(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); }
  catch (err) { toast(err.message, 'error'); }
  finally { if (btn) btn.disabled = false; }
}

// Read a <form> into a plain object
const formData = (form) => Object.fromEntries(new FormData(form).entries());

// ---------- Formatting ----------
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CATEGORY = {
  study: { label: 'Study', icon: '<i data-icon="book"></i>' },
  work: { label: 'Work', icon: '<i data-icon="briefcase"></i>' },
  exercise: { label: 'Exercise', icon: '<i data-icon="activity"></i>' },
  personal: { label: 'Personal', icon: '<i data-icon="sprout"></i>' },
  break: { label: 'Break', icon: '<i data-icon="coffee"></i>' },
  other: { label: 'Other', icon: '<i data-icon="sparkles"></i>' },
};

const pad = (n) => String(n).padStart(2, '0');
const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// '14:30' -> '2:30 PM'
function fmtTime(t) {
  if (!t) return '';
  let [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${pad(m)} ${ap}`;
}

// '2026-10-28' -> 'Wed, 28 Oct'
function fmtDate(s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}

// milliseconds -> '1h 20m' / '5m' / '40s'
function fmtDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${pad(s % 60)}s`;
  return `${s}s`;
}

// 'YYYY-MM-DD HH:MM:SS' from the server -> 'Oct 28, 2:30 PM' or '2:30 PM' if today
function fmtStamp(s) {
  const d = new Date(s.replace(' ', 'T'));
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return todayStr(d) === todayStr() ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

// Avatar <img> or a colored circle with the first letter
function avatarHtml(user, size = '') {
  if (!user) return '';
  if (user.avatar_url) {
    const src = user.avatar_url.startsWith('/') ? (window.API_URL || '') + user.avatar_url : user.avatar_url;
    return `<img class="avatar ${size}" src="${esc(src)}" alt="">`;
  }
  const bg = user.accent_color ? `style="background:${esc(user.accent_color)}"` : '';
  return `<span class="avatar ${size}" ${bg}>${esc((user.display_name || user.username || '?')[0].toUpperCase())}</span>`;
}

// Theme (light / dark) is remembered in the browser
function applyTheme(theme = localStorage.getItem('sh_theme')) {
  const t = theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = t;
  return t;
}
applyTheme();

// =====================================================================
//  Install as an app
//  - Website: a service worker (/sw.js) makes it installable (PWA).
//  - Android app: built with Capacitor (see /mobile). There the page runs
//    inside the app, so IS_NATIVE_APP is true and we skip the PWA parts.
// =====================================================================
const IS_NATIVE_APP = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const ANDROID_APK_URL = 'https://github.com/nahiyan-al-mahin/student-helper/releases/download/android/student-helper.apk';

if ('serviceWorker' in navigator && !IS_NATIVE_APP && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// Chrome / Edge / Android fire this when the site can be installed
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  document.dispatchEvent(new Event('installable'));
});
const isInstalled = () => IS_NATIVE_APP || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
async function installApp() {
  if (!installPrompt) return false;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  return true;
}
