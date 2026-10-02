const { verifyToken } = require('./security');
const { query } = require('./db');

async function loadAuth(req) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  const payload = verifyToken(token);
  if (!payload || !payload.id_usuario) return null;

  const usuarios = await query(
    `SELECT u.id_usuario, u.nombre_usuario, u.nombres, u.apellidos, u.correo, u.activo, u.ultimo_acceso
       FROM usuarios u
      WHERE u.id_usuario = ?`, [payload.id_usuario]);
  if (usuarios.length === 0 || !usuarios[0].activo) return null;

  const roles = await query(
    `SELECT r.id_rol, r.nombre
       FROM usuarios_roles ur
       JOIN roles r ON r.id_rol = ur.id_rol
      WHERE ur.id_usuario = ?`, [payload.id_usuario]);

  const permisos = await query(
    `SELECT DISTINCT p.nombre
       FROM usuarios_roles ur
       JOIN roles_permisos rp ON rp.id_rol = ur.id_rol
       JOIN permisos p ON p.id_permiso = rp.id_permiso
      WHERE ur.id_usuario = ?`, [payload.id_usuario]);

  return {
    id_usuario: usuarios[0].id_usuario,
    nombre_usuario: usuarios[0].nombre_usuario,
    nombres: usuarios[0].nombres,
    apellidos: usuarios[0].apellidos,
    correo: usuarios[0].correo,
    activo: !!usuarios[0].activo,
    roles: roles.map(r => r.nombre),
    permisos: permisos.map(p => p.nombre)
  };
}

async function authenticate(req, res, next) {
  try {
    const auth = await loadAuth(req);
    if (!auth) return res.status(401).json({ error: 'No autorizado. Sesión inválida o expirada.' });
    req.auth = auth;
    next();
  } catch (e) {
    res.status(500).json({ error: 'Error al validar la sesión.' });
  }
}

function requirePerm(nombre) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'No autorizado.' });
    if (!req.auth.permisos.includes(nombre)) {
      return res.status(403).json({ error: 'Permiso denegado. No tiene el permiso: ' + nombre });
    }
    next();
  };
}

module.exports = { authenticate, requirePerm };