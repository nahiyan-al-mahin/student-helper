// Login + register pages share this file.
// On success the token is saved and the student goes to the Today page.
if (auth.token) location.replace('/app/today.html');

const isRegister = location.pathname.includes('register');

$('#authForm').onsubmit = (e) => {
  e.preventDefault();
  $('#formError').textContent = '';
  withButton(e.target.querySelector('button'), async () => {
    try {
      const { token, user } = await api('POST', isRegister ? '/auth/register' : '/auth/login', formData(e.target));
      auth.save(token, user);
      location.href = isRegister ? '/app/routine.html?welcome=1' : '/app/today.html';
    } catch (err) {
      $('#formError').textContent = err.message;
    }
  });
};
