// Settings: edit profile, avatar, privacy lock, notifications, theme, password
// Calm, earthy colours that match the site
const COLORS = ['#4f7a6a', '#c4705a', '#5d88ad', '#c99a45', '#8a6fa0', '#6f8f4e', '#b06a7a', '#3e4a5a'];
let me = auth.user;

function fill() {
  const f = $('#profileForm');
  f.display_name.value = me.display_name;
  f.school.value = me.school || '';
  f.bio.value = me.bio || '';
  f.is_private.checked = me.is_private;
  $('#colors').innerHTML = COLORS.map((c) => `<label class="chip-toggle"><input type="radio" name="accent_color" value="${c}" ${c === me.accent_color ? 'checked' : ''}>
    <span style="background:${c};border-color:${c};width:34px;height:34px;padding:0;border-radius:50%;box-shadow:${c === me.accent_color ? '0 0 0 3px var(--card), 0 0 0 5px ' + c : 'none'}"></span></label>`).join('');
  $('#avatarPreview').innerHTML = avatarHtml(me, 'lg');
  $('#emailLine').textContent = `Logged in as @${me.username} (${me.email || ''})`;
}

$('#colors').onchange = (e) => { me = { ...me, accent_color: e.target.value }; fill(); };

$('#profileForm').onsubmit = (e) => {
  e.preventDefault();
  const f = e.target;
  withButton(f.querySelector('button'), async () => {
    const { user } = await api('PUT', '/users/me', {
      display_name: f.display_name.value, school: f.school.value, bio: f.bio.value,
      accent_color: (f.querySelector('[name=accent_color]:checked') || {}).value, is_private: f.is_private.checked,
    });
    me = user; auth.save(null, user); fill();
    toast('Profile saved', 'success');
  });
};

// Make the photo small (max 400 x 400 px, JPEG) before uploading, so it is quick
// to load and fits easily in the database.
function shrinkImage(file, size = 400) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, size / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not read this image.'))), 'image/jpeg', 0.85);
    };
    img.onerror = () => reject(new Error('Could not read this image.'));
    img.src = URL.createObjectURL(file);
  });
}

$('#avatarInput').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  withButton(null, async () => {
    const data = new FormData();
    data.append('avatar', await shrinkImage(file), 'avatar.jpg');
    const { avatar_url } = await api('POST', '/users/me/avatar', data);
    me = { ...me, avatar_url }; auth.save(null, me); fill();
    toast('Photo updated', 'success');
  });
};

$('#pwForm').onsubmit = (e) => {
  e.preventDefault();
  withButton(e.target.querySelector('button'), async () => {
    await api('PUT', '/users/me/password', formData(e.target));
    e.target.reset();
    toast('Password changed', 'success');
  });
};

function notifState() {
  const p = 'Notification' in window ? Notification.permission : 'unsupported';
  $('#notifStatus').textContent = { granted: 'On', denied: 'Blocked (change it in your browser site settings)', default: 'Not set yet', unsupported: 'Not supported in this browser' }[p];
  $('#notifBtn').classList.toggle('hidden', p !== 'default');
}
$('#notifBtn').onclick = async () => { await Notification.requestPermission(); notifState(); };
$('#testAlarm').onclick = () => Alarm.test();

function themeState() {
  $$('#themeTabs button').forEach((b) => b.classList.toggle('active', b.dataset.theme === document.documentElement.dataset.theme));
}
$('#themeTabs').onclick = (e) => {
  const b = e.target.closest('[data-theme]');
  if (!b) return;
  localStorage.setItem('sh_theme', b.dataset.theme);
  applyTheme(b.dataset.theme); themeState();
};

$('#logoutBtn').onclick = () => auth.logout();

api('GET', '/auth/me').then(({ user }) => { me = user; auth.save(null, user); fill(); });
// ---------- Get the app ----------
function appState() {
  if (IS_NATIVE_APP) { $('#getApp').classList.add('hidden'); return; }
  $('#apkLink').href = ANDROID_APK_URL;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isInstalled()) $('#installHint').textContent = 'Already installed on this device.';
  else if (installPrompt) $('#installBtn').classList.remove('hidden');
  else if (ios) $('#installHint').textContent = 'iPhone: open this site in Safari, tap Share, then "Add to Home Screen".';
  else $('#installHint').textContent = 'Open this site in Chrome, tap the menu (three dots), then "Install app" or "Add to Home screen".';
}
document.addEventListener('installable', appState);
$('#installBtn').onclick = async () => { if (await installApp()) { $('#installBtn').classList.add('hidden'); toast('Installed. Find Student Helper on your home screen.', 'success'); } };

fill(); notifState(); themeState(); appState();
