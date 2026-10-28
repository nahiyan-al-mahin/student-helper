// Landing page (index.html)
// Already logged in? Change the buttons to go straight to the app.
if (auth.token) {
  $('#loginLink').classList.add('hidden');
  $('#startLink').textContent = 'Open app';
  $('#startLink').href = '/app/today.html';
}
$('#themeBtn').onclick = () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('sh_theme', next); applyTheme(next);
};
