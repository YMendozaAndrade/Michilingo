const express = require('express');
const { query } = require('../db');
const { hashPassword } = require('../security');
const { authenticate, requirePerm } = require('../middleware');
const { responderError } = require('../errores');
const { guardarCredencial, eliminarCredencial, renombrarCredencial } = require('../redis');

const router = express.Router();
router.use(authenticate);

// GET /api/usuarios -> lista de usuarios con sus roles
router.get('/', requirePerm('usuarios.ver'), async (req, res) => {
  try {
    const usuarios = await query(
      `SELECT u.id_usuario, u.nombre_usuario, u.nombres, u.apellidos, u.correo,
              u.activo, u.ultimo_acceso, u.creado_en
         FROM usuarios u
        ORDER BY u.id_usuario`);
    const roles = await query(
      `SELECT ur.id_usuario, r.id_rol, r.nombre
         FROM usuarios_roles ur
         JOIN roles r ON r.id_rol = ur.id_rol`);
    const mapa = new Map();
    for (const u of usuarios) {
      u.roles = roles.filter(r => r.id_usuario === u.id_usuario)
                     .map(r => ({ id_rol: r.id_rol, nombre: r.nombre }));
      mapa.set(u.id_usuario, u);
    }
    res.json(usuarios);
  } catch (e) {
    responderError(res, e, 'Error al listar usuarios.');
  }
});

// POST /api/usuarios -> crear usuario (nombres, apellidos y correo OBLIGATORIOS y únicos)
router.post('/', requirePerm('usuarios.crear'), async (req, res) => {
  const { nombre_usuario, contrasena, nombres, apellidos, correo, roles, activo } = req.body || {};
  const usuario = nombre_usuario || req.body.usuario;
  if (!usuario || !contrasena) {
    return res.status(400).json({ error: 'El nombre de usuario y la contraseña son obligatorios.' });
  }
  if (!nombres || !String(nombres).trim()) {
    return res.status(400).json({ error: 'Los nombres son obligatorios.' });
  }
  if (!apellidos || !String(apellidos).trim()) {
    return res.status(400).json({ error: 'Los apellidos son obligatorios.' });
  }
  if (!correo || !String(correo).trim()) {
    return res.status(400).json({ error: 'El correo es obligatorio.' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(correo).trim())) {
    return res.status(400).json({ error: 'El correo no tiene un formato válido.' });
  }
  if (String(contrasena).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }
  if (!roles || roles.length === 0) {
    return res.status(400).json({ error: 'Debe asignar al menos un rol (perfil) al usuario.' });
  }
  try {
    const exist = await query('SELECT id_usuario FROM usuarios WHERE nombre_usuario = ?', [usuario]);
    if (exist.length > 0) return res.status(409).json({ error: 'El nombre de usuario ya existe.' });
    const existCorreo = await query('SELECT id_usuario FROM usuarios WHERE correo = ?', [String(correo).trim()]);
    if (existCorreo.length > 0) return res.status(409).json({ error: 'Ese correo ya está registrado.' });

    const nuevoHash = hashPassword(contrasena);
    const resUsr = await query(
      `INSERT INTO usuarios (nombre_usuario, contrasena, nombres, apellidos, correo, activo)
       VALUES (?,?,?,?,?,?)`,
      [usuario, nuevoHash, String(nombres).trim(), String(apellidos).trim(), String(correo).trim(), activo === false ? 0 : 1]);
    const id_usuario = resUsr.insertId;

    for (const rol of roles) {
      await query('INSERT IGNORE INTO usuarios_roles (id_usuario, id_rol) SELECT ?, id_rol FROM roles WHERE nombre = ?',
                  [id_usuario, rol]);
    }
    // Sync Redis: registra al nuevo usuario (solo si queda activo).
    if (activo !== false) {
      try {
        await guardarCredencial(usuario, id_usuario, nuevoHash);
      } catch (e) {
        console.error('[redis] no se pudo registrar credencial de', usuario, '-', e.message);
      }
    }
    res.status(201).json({ id_usuario, mensaje: 'Usuario creado correctamente.' });
  } catch (e) {
    responderError(res, e, 'Error al crear el usuario.');
  }
});

// PUT /api/usuarios/:id -> editar usuario (sincroniza Redis en cada cambio
// de nombre, contraseña o estado; en Redis solo están los activos)
router.put('/:id', requirePerm('usuarios.editar'), async (req, res) => {
  const id = Number(req.params.id);
  const { nombre_usuario, contrasena, nombres, apellidos, correo, activo, roles } = req.body || {};
  try {
    const exist = await query('SELECT id_usuario, nombre_usuario FROM usuarios WHERE id_usuario = ?', [id]);
    if (exist.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
    const nombreActual = exist[0].nombre_usuario;
    let nombreFinal = nombreActual;
    let hashNuevo = null;

    if (nombre_usuario !== undefined && nombre_usuario !== '') {
      const dup = await query('SELECT id_usuario FROM usuarios WHERE nombre_usuario = ? AND id_usuario <> ?', [nombre_usuario, id]);
      if (dup.length > 0) return res.status(409).json({ error: 'Ese nombre de usuario ya está en uso.' });
      await query('UPDATE usuarios SET nombre_usuario = ? WHERE id_usuario = ?', [nombre_usuario, id]);
      nombreFinal = nombre_usuario;
    }
    if (contrasena) {
      if (String(contrasena).length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
      }
      hashNuevo = hashPassword(contrasena);
      await query('UPDATE usuarios SET contrasena = ? WHERE id_usuario = ?', [hashNuevo, id]);
    }
    if (nombres !== undefined) {
      if (!String(nombres).trim()) return res.status(400).json({ error: 'Los nombres son obligatorios.' });
      await query('UPDATE usuarios SET nombres = ? WHERE id_usuario = ?', [nombres, id]);
    }
    if (apellidos !== undefined) {
      if (!String(apellidos).trim()) return res.status(400).json({ error: 'Los apellidos son obligatorios.' });
      await query('UPDATE usuarios SET apellidos = ? WHERE id_usuario = ?', [apellidos, id]);
    }
    if (correo !== undefined) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(correo))) {
        return res.status(400).json({ error: 'El correo no tiene un formato válido.' });
      }
      const dupC = await query('SELECT id_usuario FROM usuarios WHERE correo = ? AND id_usuario <> ?', [correo, id]);
      if (dupC.length > 0) return res.status(409).json({ error: 'Ese correo ya está registrado.' });
      await query('UPDATE usuarios SET correo = ? WHERE id_usuario = ?', [correo, id]);
    }
    if (activo !== undefined) {
      await query('UPDATE usuarios SET activo = ? WHERE id_usuario = ?', [activo ? 1 : 0, id]);
    }
    if (roles && roles.length > 0) {
      await query('DELETE FROM usuarios_roles WHERE id_usuario = ?', [id]);
      for (const rol of roles) {
        await query('INSERT IGNORE INTO usuarios_roles (id_usuario, id_rol) SELECT ?, id_rol FROM roles WHERE nombre = ?',
                    [id, rol]);
      }
    }
    // Sync Redis según el caso.
    try {
      if (activo !== undefined && !activo) {
        await eliminarCredencial(nombreFinal);
        if (nombreFinal !== nombreActual) await eliminarCredencial(nombreActual);
      } else {
        if (nombreFinal !== nombreActual) await renombrarCredencial(nombreActual, nombreFinal);
        if (hashNuevo || nombreFinal !== nombreActual || (activo !== undefined && activo)) {
          const fila = await query('SELECT contrasena FROM usuarios WHERE id_usuario = ?', [id]);
          if (fila.length > 0) await guardarCredencial(nombreFinal, id, fila[0].contrasena);
        }
      }
    } catch (e) {
      console.error('[redis] no se pudo sincronizar usuario', nombreFinal, '-', e.message);
    }
    res.json({ id_usuario: id, mensaje: 'Usuario actualizado.' });
  } catch (e) {
    responderError(res, e, 'Error al actualizar el usuario.');
  }
});

// DELETE /api/usuarios/:id -> desactivar usuario
router.delete('/:id', requirePerm('usuarios.eliminar'), async (req, res) => {
  const id = Number(req.params.id);
  try {
    if (id === req.auth.id_usuario) {
      return res.status(400).json({ error: 'No puede desactivar su propio usuario.' });
    }
    const exist = await query('SELECT id_usuario, nombre_usuario FROM usuarios WHERE id_usuario = ?', [id]);
    if (exist.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
    await query('UPDATE usuarios SET activo = 0 WHERE id_usuario = ?', [id]);
    // Sync Redis: en Redis solo están los activos -> se elimina la clave.
    try {
      await eliminarCredencial(exist[0].nombre_usuario);
    } catch (e) {
      console.error('[redis] no se pudo eliminar credencial de', exist[0].nombre_usuario, '-', e.message);
    }
    res.json({ id_usuario: id, mensaje: 'Usuario desactivado.' });
  } catch (e) {
    responderError(res, e, 'Error al desactivar el usuario.');
  }
});

module.exports = router;