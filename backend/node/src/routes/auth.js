const express = require('express');
const { query } = require('../db');
const { hashPassword, verifyPassword, signToken } = require('../security');
const { authenticate } = require('../middleware');
const { leerCredencial, guardarCredencial } = require('../redis');

const router = express.Router();

// ---------------------------------------------------------------------
// Rate limiting básico del login (anti fuerza bruta, en memoria).
// 5 intentos fallidos por usuario + IP cada 15 minutos.
// ---------------------------------------------------------------------
const MAX_INTENTOS = 5;
const VENTANA_MS = 15 * 60 * 1000;
const intentos = new Map();

function limpiarVentana(ahora) {
  for (const [clave, datos] of intentos) {
    if (ahora - datos.resetea > 0) intentos.delete(clave);
  }
  if (intentos.size > 10000) intentos.clear();
}

function registrarFallo(usuario, ip, ahora) {
  const clave = `${usuario}|${ip}`;
  const datos = intentos.get(clave) || { cuenta: 0, resetea: ahora + VENTANA_MS };
  if (ahora > datos.resetea) { datos.cuenta = 0; datos.resetea = ahora + VENTANA_MS; }
  datos.cuenta += 1;
  intentos.set(clave, datos);
}

function estaBloqueado(usuario, ip, ahora) {
  const datos = intentos.get(`${usuario}|${ip}`);
  return datos ? ahora <= datos.resetea && datos.cuenta >= MAX_INTENTOS : false;
}

router.post('/login', async (req, res) => {
  const ahora = Date.now();
  limpiarVentana(ahora);
  try {
    const { usuario, contrasena } = req.body || {};
    if (!usuario || !contrasena) {
      return res.status(400).json({ error: 'Usuario y contraseña son obligatorios.' });
    }
    const ip = req.ip || req.connection?.remoteAddress || 'local';
    if (estaBloqueado(String(usuario), ip, ahora)) {
      return res.status(429).json({ error: 'Demasiados intentos fallidos. Espere 15 minutos.' });
    }

    // Parcial Redis: usuario y contraseña se validan en Redis (solo activos),
    // NO en la base relacional. Roles/permisos/menú siguen en MySQL.
    let cred;
    try {
      cred = await leerCredencial(String(usuario));
    } catch (e) {
      return res.status(503).json({ error: 'Servicio de autenticación no disponible. Intente más tarde.' });
    }
    const ok = cred && verifyPassword(contrasena, cred.contrasena);

    if (!ok) {
      registrarFallo(String(usuario), ip, ahora);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    // El usuario existe y está activo en Redis; se traen sus datos/roles de MySQL.
    const rows = await query(
      `SELECT u.id_usuario, u.nombre_usuario, u.activo, u.contrasena
         FROM usuarios u
        WHERE u.id_usuario = ?`, [cred.id_usuario]);
    if (rows.length === 0) {
      registrarFallo(String(usuario), ip, ahora);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }
    if (!rows[0].activo) {
      return res.status(403).json({ error: 'El usuario está desactivado. Contacte al administrador.' });
    }

    await query('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id_usuario = ?', [rows[0].id_usuario]);

    const token = signToken({ id_usuario: rows[0].id_usuario });

    const roles = await query(
      `SELECT r.nombre FROM usuarios_roles ur JOIN roles r ON r.id_rol = ur.id_rol
        WHERE ur.id_usuario = ?`, [rows[0].id_usuario]);
    const permisos = await query(
      `SELECT DISTINCT p.nombre
         FROM usuarios_roles ur
         JOIN roles_permisos rp ON rp.id_rol = ur.id_rol
         JOIN permisos p ON p.id_permiso = rp.id_permiso
        WHERE ur.id_usuario = ?`, [rows[0].id_usuario]);

    res.json({
      token,
      usuario: {
        id_usuario: rows[0].id_usuario,
        nombre_usuario: rows[0].nombre_usuario,
        roles: roles.map(r => r.nombre),
        permisos: permisos.map(p => p.nombre)
      }
    });
  } catch (e) {
    res.status(500).json({ error: 'Error en el servidor.' });
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ usuario: req.auth });
});

// Cambio de contraseña del usuario autenticado (autoservicio).
router.post('/cambiar-contrasena', authenticate, async (req, res) => {
  const { contrasena_actual, contrasena_nueva } = req.body || {};
  if (!contrasena_actual || !contrasena_nueva) {
    return res.status(400).json({ error: 'Contraseña actual y nueva son obligatorias.' });
  }
  if (String(contrasena_nueva).length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  }
  try {
    const rows = await query(
      'SELECT id_usuario, nombre_usuario, contrasena FROM usuarios WHERE id_usuario = ?', [req.auth.id_usuario]);
    if (rows.length === 0 || !verifyPassword(contrasena_actual, rows[0].contrasena)) {
      return res.status(401).json({ error: 'La contraseña actual es incorrecta.' });
    }
    const nuevoHash = hashPassword(contrasena_nueva);
    await query('UPDATE usuarios SET contrasena = ? WHERE id_usuario = ?',
                [nuevoHash, req.auth.id_usuario]);
    // Sync Redis: actualiza la credencial (solo activos están en Redis).
    try {
      await guardarCredencial(rows[0].nombre_usuario || req.auth.nombre_usuario, req.auth.id_usuario, nuevoHash);
    } catch (e) {
      console.error('[redis] no se pudo actualizar credencial de', req.auth.nombre_usuario, '-', e.message);
    }
    res.json({ mensaje: 'Contraseña actualizada.' });
  } catch (e) {
    res.status(500).json({ error: 'Error al cambiar la contraseña.' });
  }
});

module.exports = router;