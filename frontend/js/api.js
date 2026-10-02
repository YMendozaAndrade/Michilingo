const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

function guardarSesion(token, usuario) {
  localStorage.setItem('token', token);
  localStorage.setItem('usuario', JSON.stringify(usuario));
}

function getUsuarioSesion() {
  try { return JSON.parse(localStorage.getItem('usuario') || 'null'); } catch (e) { return null; }
}

function cerrarSesion() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  location.href = 'index.html';
}

async function apiRequest(path, metodo = 'GET', body = null) {
  const config = {
    method: metodo,
    headers: { 'Content-Type': 'application/json' }
  };
  const token = getToken();
  if (token) config.headers['Authorization'] = 'Bearer ' + token;
  if (body) config.body = JSON.stringify(body);

  const res = await fetch(API_BASE + path, config);
  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    if (getToken()) { cerrarSesion(); throw new Error('Sesión expirada.'); }
    throw new Error(data.error || ('Error ' + res.status));
  }
  if (!res.ok) throw new Error(data.error || ('Error ' + res.status));
  return data;
}