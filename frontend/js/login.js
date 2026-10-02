const $ = (id) => document.getElementById(id);

const contrasenaIn = $('contrasena');
const toggleBtn = $('toggleContrasena');
const ojitoAbierto = toggleBtn.querySelector('.ojito-abierto');
const ojitoCerrado = toggleBtn.querySelector('.ojito-cerrado');

toggleBtn.addEventListener('click', () => {
  const mostrar = contrasenaIn.type === 'password';
  contrasenaIn.type = mostrar ? 'text' : 'password';
  ojitoAbierto.classList.toggle('hidden', mostrar);
  ojitoCerrado.classList.toggle('hidden', !mostrar);
});

$('formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = $('mensajeError');
  errorEl.classList.add('hidden');
  const usuarioIn = $('usuario').value.trim();
  const contrasena = contrasenaIn.value;
  if (!usuarioIn || !contrasena) { errorEl.textContent = 'Ingrese usuario y contraseña.'; errorEl.classList.remove('hidden'); return; }

  try {
    const data = await apiRequest('/auth/login', 'POST', { usuario: usuarioIn, contrasena });
    guardarSesion(data.token, data.usuario);
    location.href = 'app.html';
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
});