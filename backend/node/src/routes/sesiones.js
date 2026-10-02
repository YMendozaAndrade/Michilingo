const express = require('express');
const { query } = require('../db');
const { authenticate, requirePerm } = require('../middleware');
const { responderError } = require('../errores');

const router = express.Router();
router.use(authenticate);

const esAdmin = (auth) => (auth.roles || []).includes('Administrativo');
const esProfe = (auth) => (auth.roles || []).includes('Profesor');
const esEstudianteSolo = (auth) =>
  (auth.roles || []).includes('Estudiante') && !esAdmin(auth) && !esProfe(auth);

// Grupo visible según perfil: admin todos, profe los suyos, estudiante los suyos.
async function grupoPermitido(auth, id_grupo) {
  const g = await query('SELECT id_grupo, id_profesor FROM grupos WHERE id_grupo = ?', [id_grupo]);
  if (g.length === 0) return { existe: false };
  if (esAdmin(auth)) return { existe: true };
  if (esProfe(auth) && g[0].id_profesor === auth.id_usuario) return { existe: true };
  if (esEstudianteSolo(auth)) {
    const m = await query(
      'SELECT 1 FROM grupos_estudiantes WHERE id_grupo = ? AND id_estudiante = ?',
      [id_grupo, auth.id_usuario]);
    return m.length > 0 ? { existe: true } : { existe: true, denegado: true };
  }
  return { existe: true, denegado: true };
}

// GET /api/sesiones?grupo=ID -> sesiones de clase (temas vistos) del grupo
router.get('/', requirePerm('sesiones.ver'), async (req, res) => {
  const id_grupo = Number(req.query.grupo);
  if (!id_grupo) return res.status(400).json({ error: 'Indique el grupo.' });
  try {
    const g = await grupoPermitido(req.auth, id_grupo);
    if (!g.existe) return res.status(404).json({ error: 'Grupo no encontrado.' });
    if (g.denegado) return res.status(403).json({ error: 'No tiene acceso a las sesiones de este grupo.' });
    const grupo = await query('SELECT id_grupo, nombre FROM grupos WHERE id_grupo = ?', [id_grupo]);
    const sesiones = await query(
      `SELECT s.id_sesion, s.id_grupo, s.id_profesor, s.id_horario, s.fecha, s.tema, s.descripcion,
              CONCAT(u.nombres, ' ', u.apellidos) AS profesor,
              h.dia_semana, h.hora_inicio, h.hora_fin
         FROM sesiones_clase s
         JOIN usuarios u ON u.id_usuario = s.id_profesor
         LEFT JOIN horarios h ON h.id_horario = s.id_horario
        WHERE s.id_grupo = ?
        ORDER BY s.fecha DESC, s.id_sesion DESC`, [id_grupo]);
    res.json({ grupo: grupo[0], sesiones });
  } catch (e) {
    responderError(res, e, 'Error al listar las sesiones de clase.');
  }
});

// GET /api/sesiones/mis -> sesiones de los grupos del estudiante autenticado
router.get('/mis', requirePerm('sesiones.ver'), async (req, res) => {
  try {
    const rows = await query(
      `SELECT s.id_sesion, s.fecha, s.tema, s.descripcion, g.nombre AS grupo
         FROM sesiones_clase s
         JOIN grupos g ON g.id_grupo = s.id_grupo
         JOIN grupos_estudiantes ge ON ge.id_grupo = s.id_grupo AND ge.id_estudiante = ?
        ORDER BY s.fecha DESC, s.id_sesion DESC`, [req.auth.id_usuario]);
    res.json(rows);
  } catch (e) {
    responderError(res, e, 'Error al cargar sus sesiones de clase.');
  }
});

// POST /api/sesiones -> crear sesión (tema visto) en un grupo
router.post('/', requirePerm('sesiones.gestionar'), async (req, res) => {
  const { id_grupo, fecha, tema, descripcion, id_horario } = req.body || {};
  if (!id_grupo || !fecha || !tema || !String(tema).trim()) {
    return res.status(400).json({ error: 'Indique grupo, fecha y tema de la sesión.' });
  }
  try {
    const g = await grupoPermitido(req.auth, Number(id_grupo));
    if (!g.existe) return res.status(404).json({ error: 'Grupo no encontrado.' });
    if (g.denegado || (!esAdmin(req.auth) && !esProfe(req.auth))) {
      return res.status(403).json({ error: 'Solo el profesor del grupo puede crear sesiones.' });
    }
    if (!esAdmin(req.auth)) {
      const gg = await query('SELECT id_profesor FROM grupos WHERE id_grupo = ?', [Number(id_grupo)]);
      if (!gg[0] || gg[0].id_profesor !== req.auth.id_usuario) {
        return res.status(403).json({ error: 'Solo el profesor del grupo puede crear sesiones.' });
      }
    }
    if (id_horario) {
      const h = await query('SELECT id_horario FROM horarios WHERE id_horario = ? AND id_grupo = ?',
        [Number(id_horario), Number(id_grupo)]);
      if (h.length === 0) return res.status(400).json({ error: 'El horario no pertenece al grupo.' });
    }
    const idProf = esAdmin(req.auth) && req.body.id_profesor
      ? Number(req.body.id_profesor)
      : (await query('SELECT id_profesor FROM grupos WHERE id_grupo = ?', [Number(id_grupo)]))[0].id_profesor;
    const r = await query(
      'INSERT INTO sesiones_clase (id_grupo, id_profesor, id_horario, fecha, tema, descripcion) VALUES (?,?,?,?,?,?)',
      [Number(id_grupo), idProf, id_horario ? Number(id_horario) : null, fecha, String(tema).trim(), descripcion || null]);
    res.status(201).json({ id_sesion: r.insertId, mensaje: 'Sesión de clase creada.' });
  } catch (e) {
    responderError(res, e, 'Error al crear la sesión de clase.');
  }
});

// PUT /api/sesiones/:id -> editar tema/fecha/descripción
router.put('/:id', requirePerm('sesiones.gestionar'), async (req, res) => {
  const id = Number(req.params.id);
  const { fecha, tema, descripcion, id_horario } = req.body || {};
  try {
    const rows = await query('SELECT * FROM sesiones_clase WHERE id_sesion = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Sesión no encontrada.' });
    const ses = rows[0];
    if (!esAdmin(req.auth)) {
      const gg = await query('SELECT id_profesor FROM grupos WHERE id_grupo = ?', [ses.id_grupo]);
      if (!gg[0] || gg[0].id_profesor !== req.auth.id_usuario) {
        return res.status(403).json({ error: 'No puede editar sesiones de este grupo.' });
      }
    }
    if (id_horario !== undefined && id_horario !== null && id_horario !== '') {
      const h = await query('SELECT id_horario FROM horarios WHERE id_horario = ? AND id_grupo = ?',
        [Number(id_horario), ses.id_grupo]);
      if (h.length === 0) return res.status(400).json({ error: 'El horario no pertenece al grupo.' });
    }
    const nom = tema !== undefined ? String(tema).trim() : ses.tema;
    if (!nom) return res.status(400).json({ error: 'El tema de la sesión es obligatorio.' });
    await query('UPDATE sesiones_clase SET fecha = ?, tema = ?, descripcion = ?, id_horario = ? WHERE id_sesion = ?',
      [fecha !== undefined ? fecha : ses.fecha, nom,
       descripcion !== undefined ? descripcion : ses.descripcion,
       id_horario === '' ? null : (id_horario !== undefined ? Number(id_horario) : ses.id_horario), id]);
    res.json({ id_sesion: id, mensaje: 'Sesión actualizada.' });
  } catch (e) {
    responderError(res, e, 'Error al actualizar la sesión.');
  }
});

// DELETE /api/sesiones/:id
router.delete('/:id', requirePerm('sesiones.gestionar'), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const rows = await query('SELECT * FROM sesiones_clase WHERE id_sesion = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Sesión no encontrada.' });
    if (!esAdmin(req.auth)) {
      const gg = await query('SELECT id_profesor FROM grupos WHERE id_grupo = ?', [rows[0].id_grupo]);
      if (!gg[0] || gg[0].id_profesor !== req.auth.id_usuario) {
        return res.status(403).json({ error: 'No puede eliminar sesiones de este grupo.' });
      }
    }
    await query('DELETE FROM sesiones_clase WHERE id_sesion = ?', [id]);
    res.json({ id_sesion: id, mensaje: 'Sesión eliminada.' });
  } catch (e) {
    responderError(res, e, 'Error al eliminar la sesión.');
  }
});

module.exports = router;
