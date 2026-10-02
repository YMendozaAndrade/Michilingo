const express = require('express');
const { query } = require('../db');
const { authenticate, requirePerm } = require('../middleware');
const { responderError } = require('../errores');

const router = express.Router();
router.use(authenticate);

const esAdmin = (auth) => (auth.roles || []).includes('Administrativo');
const esProfe = (auth) => (auth.roles || []).includes('Profesor');

async function cargarExamen(id) {
  const rows = await query('SELECT * FROM examenes WHERE id_examen = ?', [id]);
  return rows[0] || null;
}

// Devuelve true si el usuario puede trabajar con el grupo (Administrativo
// con todos, Profesor solo con los suyos).
async function accesible(auth, id_grupo) {
  const rows = await query('SELECT id_profesor FROM grupos WHERE id_grupo = ?', [id_grupo]);
  if (rows.length === 0) return false;
  if (esAdmin(auth)) return true;
  return esProfe(auth) && rows[0].id_profesor === auth.id_usuario;
}

// GET /api/examenes?grupo=ID -> exámenes (temas) del grupo con las notas de cada estudiante
router.get('/', requirePerm('notas.ver'), async (req, res) => {
  const id_grupo = Number(req.query.grupo);
  if (!id_grupo) return res.status(400).json({ error: 'Indique el grupo.' });
  try {
    const g = await query('SELECT id_grupo, nombre FROM grupos WHERE id_grupo = ?', [id_grupo]);
    if (g.length === 0) return res.status(404).json({ error: 'Grupo no encontrado.' });
    if (!await accesible(req.auth, id_grupo)) {
      return res.status(403).json({ error: 'No tiene acceso a los exámenes de este grupo.' });
    }
    const estudiantes = await query(
      `SELECT u.id_usuario AS id_estudiante, u.nombres, u.apellidos
         FROM grupos_estudiantes ge
         JOIN usuarios u ON u.id_usuario = ge.id_estudiante
        WHERE ge.id_grupo = ? ORDER BY u.nombres, u.apellidos`, [id_grupo]);
    const examenes = await query('SELECT * FROM examenes WHERE id_grupo = ? ORDER BY fecha, id_examen', [id_grupo]);
    const notas = await query(
      `SELECT n.id_examen, n.id_estudiante, n.calificacion
         FROM notas n JOIN examenes e ON e.id_examen = n.id_examen
        WHERE e.id_grupo = ?`, [id_grupo]);
    examenes.forEach(ex => {
      ex.notas = notas.filter(n => n.id_examen === ex.id_examen);
    });
    res.json({ grupo: g[0], estudiantes, examenes });
  } catch (e) {
    responderError(res, e, 'Error al listar los exámenes.');
  }
});

// GET /api/examenes/mis -> las notas del usuario autenticado (estudiante)
router.get('/mis', requirePerm('notas.ver'), async (req, res) => {
  try {
    const rows = await query(
      `SELECT e.id_examen, e.nombre, e.fecha, g.nombre AS grupo, n.calificacion
         FROM notas n
         JOIN examenes e ON e.id_examen = n.id_examen
         JOIN grupos g ON g.id_grupo = e.id_grupo
        WHERE n.id_estudiante = ?
        ORDER BY e.fecha DESC, e.id_examen DESC`, [req.auth.id_usuario]);
    res.json(rows);
  } catch (e) {
    responderError(res, e, 'Error al cargar sus notas.');
  }
});

// POST /api/examenes -> crear un examen (tema) para un grupo (fecha OBLIGATORIA)
router.post('/', requirePerm('notas.gestionar'), async (req, res) => {
  const { id_grupo, nombre, fecha } = req.body || {};
  if (!id_grupo || !nombre) {
    return res.status(400).json({ error: 'Indique el grupo y el nombre del examen.' });
  }
  if (!fecha) {
    return res.status(400).json({ error: 'La fecha del examen es obligatoria.' });
  }
  try {
    if (!await accesible(req.auth, Number(id_grupo))) {
      const g = await query('SELECT id_grupo FROM grupos WHERE id_grupo = ?', [Number(id_grupo)]);
      return res.status(g.length ? 403 : 404)
                .json({ error: g.length ? 'No puede crear exámenes en este grupo.' : 'Grupo no encontrado.' });
    }
    const r = await query('INSERT INTO examenes (id_grupo, nombre, fecha) VALUES (?,?,?)',
                          [Number(id_grupo), nombre, fecha]);
    res.status(201).json({ id_examen: r.insertId, mensaje: 'Examen creado.' });
  } catch (e) {
    responderError(res, e, 'Error al crear el examen.');
  }
});

// PUT /api/examenes/:id -> editar nombre/fecha del examen
router.put('/:id', requirePerm('notas.gestionar'), async (req, res) => {
  const id = Number(req.params.id);
  const { nombre, fecha } = req.body || {};
  try {
    const ex = await cargarExamen(id);
    if (!ex) return res.status(404).json({ error: 'Examen no encontrado.' });
    if (!await accesible(req.auth, ex.id_grupo)) {
      return res.status(403).json({ error: 'No puede editar exámenes de este grupo.' });
    }
    const nom = nombre !== undefined ? String(nombre).trim() : ex.nombre;
    if (!nom) return res.status(400).json({ error: 'El nombre del examen es obligatorio.' });
    await query('UPDATE examenes SET nombre = ?, fecha = ? WHERE id_examen = ?',
                [nom, fecha !== undefined ? fecha : ex.fecha, id]);
    res.json({ id_examen: id, mensaje: 'Examen actualizado.' });
  } catch (e) {
    responderError(res, e, 'Error al actualizar el examen.');
  }
});

// DELETE /api/examenes/:id -> eliminar el examen (borra sus notas en cascada)
router.delete('/:id', requirePerm('notas.gestionar'), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const ex = await cargarExamen(id);
    if (!ex) return res.status(404).json({ error: 'Examen no encontrado.' });
    if (!await accesible(req.auth, ex.id_grupo)) {
      return res.status(403).json({ error: 'No puede eliminar exámenes de este grupo.' });
    }
    await query('DELETE FROM examenes WHERE id_examen = ?', [id]);
    res.json({ id_examen: id, mensaje: 'Examen eliminado.' });
  } catch (e) {
    responderError(res, e, 'Error al eliminar el examen.');
  }
});

// POST /api/examenes/notas -> guardar calificaciones (0.0 a 5.0) de un examen
router.post('/notas', requirePerm('notas.gestionar'), async (req, res) => {
  const { id_examen, notas } = req.body || {};
  if (!id_examen || !Array.isArray(notas) || notas.length === 0) {
    return res.status(400).json({ error: 'Indique el examen y al menos una nota.' });
  }
  try {
    const ex = await cargarExamen(Number(id_examen));
    if (!ex) return res.status(404).json({ error: 'Examen no encontrado.' });
    if (!await accesible(req.auth, ex.id_grupo)) {
      return res.status(403).json({ error: 'No puede calificar exámenes de este grupo.' });
    }
    for (const n of notas) {
      if (!n || !n.id_estudiante) continue;
      const cal = Number(n.calificacion);
      if (!Number.isFinite(cal) || cal < 0 || cal > 5) {
        return res.status(400).json({ error: 'Las notas deben estar entre 0.0 y 5.0.' });
      }
      await query(
        `INSERT INTO notas (id_examen, id_estudiante, calificacion) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE calificacion = VALUES(calificacion)`,
        [Number(id_examen), Number(n.id_estudiante), cal]);
    }
    res.json({ mensaje: 'Notas guardadas.' });
  } catch (e) {
    responderError(res, e, 'Error al guardar las notas.');
  }
});

module.exports = router;