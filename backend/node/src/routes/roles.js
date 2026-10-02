const express = require('express');
const { query } = require('../db');
const { authenticate, requirePerm } = require('../middleware');
const { responderError } = require('../errores');

const router = express.Router();
router.use(authenticate);

// GET /api/roles -> lista de roles con sus permisos
router.get('/', requirePerm('roles.ver'), async (req, res) => {
  try {
    const roles = await query('SELECT id_rol, nombre, descripcion FROM roles ORDER BY id_rol');
    const permisos = await query(
      `SELECT rp.id_rol, p.id_permiso, p.nombre, p.modulo, p.descripcion
         FROM roles_permisos rp
         JOIN permisos p ON p.id_permiso = rp.id_permiso
        ORDER BY p.modulo, p.nombre`);

    const grupos = new Map();
    for (const r of roles) {
      const modulos = {};
      for (const perm of permisos) {
        if (perm.id_rol !== r.id_rol) continue;
        if (!modulos[perm.modulo]) modulos[perm.modulo] = [];
        modulos[perm.modulo].push({ id_permiso: perm.id_permiso, nombre: perm.nombre, descripcion: perm.descripcion });
      }
      if (!grupos.has(r.id_rol)) grupos.set(r.id_rol, []);
      r.permisos = modulos;
    }
    res.json(roles);
  } catch (e) {
    res.status(500).json({ error: 'Error al listar roles.', detalle: e.message });
  }
});

// GET /api/permisos -> todos los permisos agrupados por módulo
router.get('/permisos', requirePerm('roles.ver'), async (req, res) => {
  try {
    const rows = await query(
      'SELECT id_permiso, nombre, modulo, descripcion FROM permisos ORDER BY modulo, nombre');
    const modulos = {};
    for (const row of rows) {
      if (!modulos[row.modulo]) modulos[row.modulo] = [];
      modulos[row.modulo].push(row);
    }
    res.json(modulos);
  } catch (e) {
    res.status(500).json({ error: 'Error al listar permisos.', detalle: e.message });
  }
});

// GET /api/roles/:id/permisos -> permisos de un rol concreto
router.get('/:id/permisos', requirePerm('roles.ver'), async (req, res) => {
  try {
    const rows = await query(
      `SELECT p.id_permiso, p.nombre, p.modulo, p.descripcion
         FROM roles_permisos rp
         JOIN permisos p ON p.id_permiso = rp.id_permiso
        WHERE rp.id_rol = ?
        ORDER BY p.modulo, p.nombre`, [Number(req.params.id)]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Error al listar permisos del rol.', detalle: e.message });
  }
});

// POST /api/roles -> crear rol con sus permisos (roles.gestionar)
router.post('/', requirePerm('roles.gestionar'), async (req, res) => {
  const { nombre, descripcion, permisos } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'El nombre del rol es obligatorio.' });
  try {
    const exist = await query('SELECT id_rol FROM roles WHERE nombre = ?', [nombre]);
    if (exist.length > 0) return res.status(409).json({ error: 'Ya existe un rol con ese nombre.' });

    const r = await query('INSERT INTO roles (nombre, descripcion) VALUES (?,?)',
                          [nombre, descripcion || null]);
    const id_rol = r.insertId;
    if (Array.isArray(permisos)) {
      for (const perm of permisos) {
        await query('INSERT IGNORE INTO roles_permisos (id_rol, id_permiso) SELECT ?, id_permiso FROM permisos WHERE nombre = ?',
                    [id_rol, perm]);
      }
    }
    res.status(201).json({ id_rol, mensaje: 'Rol creado.' });
  } catch (e) {
    responderError(res, e, 'Error al crear el rol.');
  }
});

// PUT /api/roles/:id -> editar rol y reemplazar sus permisos (roles.gestionar)
// Los roles base (Administrativo/Profesor/Estudiante) NO se renombran (el código
// valida por nombre), pero SÍ se les pueden modificar descripción y permisos.
router.put('/:id', requirePerm('roles.gestionar'), async (req, res) => {
  const id = Number(req.params.id);
  const { nombre, descripcion, permisos } = req.body || {};
  try {
    const exist = await query('SELECT id_rol, nombre FROM roles WHERE id_rol = ?', [id]);
    if (exist.length === 0) return res.status(404).json({ error: 'Rol no encontrado.' });
    const esBase = ['Administrativo', 'Profesor', 'Estudiante'].includes(exist[0].nombre);
    if (esBase) {
      await query('UPDATE roles SET descripcion = ? WHERE id_rol = ?', [descripcion || null, id]);
    } else if (nombre) {
      await query('UPDATE roles SET nombre = ?, descripcion = ? WHERE id_rol = ?',
                  [nombre, descripcion || null, id]);
    } else {
      await query('UPDATE roles SET descripcion = ? WHERE id_rol = ?', [descripcion || null, id]);
    }

    if (Array.isArray(permisos)) {
      await query('DELETE FROM roles_permisos WHERE id_rol = ?', [id]);
      for (const perm of permisos) {
        await query('INSERT IGNORE INTO roles_permisos (id_rol, id_permiso) SELECT ?, id_permiso FROM permisos WHERE nombre = ?',
                    [id, perm]);
      }
    }
    res.json({ id_rol: id, mensaje: 'Rol actualizado.' });
  } catch (e) {
    responderError(res, e, 'Error al actualizar el rol.');
  }
});

// DELETE /api/roles/:id -> eliminar rol (roles.gestionar)
router.delete('/:id', requirePerm('roles.gestionar'), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const exist = await query('SELECT id_rol, nombre FROM roles WHERE id_rol = ?', [id]);
    if (exist.length === 0) return res.status(404).json({ error: 'Rol no encontrado.' });
    if (['Administrativo', 'Profesor', 'Estudiante'].includes(exist[0].nombre)) {
      return res.status(403).json({ error: 'Los roles base del sistema no pueden eliminarse.' });
    }
    const usados = await query('SELECT COUNT(*) AS total FROM usuarios_roles WHERE id_rol = ?', [id]);
    if (usados[0].total > 0) return res.status(409).json({ error: 'El rol está asignado a usuarios y no puede eliminarse.' });
    await query('DELETE FROM roles_permisos WHERE id_rol = ?', [id]);
    await query('DELETE FROM roles WHERE id_rol = ?', [id]);
    res.json({ id_rol: id, mensaje: 'Rol eliminado.' });
  } catch (e) {
    responderError(res, e, 'Error al eliminar el rol.');
  }
});

module.exports = router;