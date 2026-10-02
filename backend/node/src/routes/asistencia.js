const express = require('express');
const { query } = require('../db');
const { authenticate, requirePerm } = require('../middleware');
const { responderError } = require('../errores');

const router = express.Router();
router.use(authenticate);

const esAdmin = (auth) => (auth.roles || []).includes('Administrativo');
const esProfe = (auth) => (auth.roles || []).includes('Profesor');
const esEstudiante = (auth) => (auth.roles || []).includes('Estudiante');

const ESTADOS = ['Presente', 'Ausente', 'Excusa'];

async function grupoVisible(auth, id_grupo) {
  const rows = await query('SELECT id_profesor FROM grupos WHERE id_grupo = ?', [id_grupo]);
  if (rows.length === 0) return { existe: false };
  if (esAdmin(auth)) return { existe: true };
  if (esProfe(auth) && rows[0].id_profesor === auth.id_usuario) return { existe: true };
  return { existe: true, denegado: true };
}

// GET /api/asistencia?grupo=&fecha= -> estudiantes del grupo con su estado de la fecha
// (para que el profesor marque). Solo Administrativo y Profesor del grupo.
router.get('/', requirePerm('asistencia.ver'), async (req, res) => {
  const id_grupo = Number(req.query.grupo);
  const fecha = req.query.fecha;
  if (!id_grupo || !fecha) return res.status(400).json({ error: 'Indique grupo y fecha.' });
  if (esEstudiante(req.auth) && !esAdmin(req.auth) && !esProfe(req.auth)) {
    return res.status(403).json({ error: 'El estudiante solo consulta su propia asistencia.' });
  }
  try {
    const g = await grupoVisible(req.auth, id_grupo);
    if (!g.existe) return res.status(404).json({ error: 'Grupo no encontrado.' });
    if (g.denegado) return res.status(403).json({ error: 'No tiene acceso a este grupo.' });

    const grupo = await query('SELECT id_grupo, nombre FROM grupos WHERE id_grupo = ?', [id_grupo]);
    const estudiantes = await query(
      `SELECT u.id_usuario AS id_estudiante, u.nombres, u.apellidos,
              COALESCE(a.estado, NULL) AS estado
         FROM grupos_estudiantes ge
         JOIN usuarios u ON u.id_usuario = ge.id_estudiante
         LEFT JOIN asistencia a ON a.id_grupo = ge.id_grupo
              AND a.id_estudiante = ge.id_estudiante AND a.fecha = ?
        WHERE ge.id_grupo = ?
        ORDER BY u.nombres, u.apellidos`, [fecha, id_grupo]);
    res.json({ grupo: grupo[0], fecha, estudiantes });
  } catch (e) {
    responderError(res, e, 'Error al cargar la asistencia.');
  }
});

// POST /api/asistencia -> guardar la asistencia de un grupo en una fecha
router.post('/', requirePerm('asistencia.marcar'), async (req, res) => {
  const { id_grupo, fecha, registros } = req.body || {};
  if (!id_grupo || !fecha || !Array.isArray(registros) || registros.length === 0) {
    return res.status(400).json({ error: 'Indique grupo, fecha y al menos un registro.' });
  }
  try {
    const g = await grupoVisible(req.auth, id_grupo);
    if (!g.existe) return res.status(404).json({ error: 'Grupo no encontrado.' });
    if (g.denegado) return res.status(403).json({ error: 'Solo el profesor del grupo puede marcar asistencia.' });

    for (const reg of registros) {
      const estado = reg.estado;
      if (!ESTADOS.includes(estado)) {
        return res.status(400).json({ error: 'Estado inválido: ' + String(estado) });
      }
      await query(
        `INSERT INTO asistencia (id_grupo, id_estudiante, fecha, estado, registrado_por)
         VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE estado = VALUES(estado), registrado_por = VALUES(registrado_por)`,
        [id_grupo, Number(reg.id_estudiante), fecha, estado, req.auth.id_usuario]);
    }
    res.json({ mensaje: 'Asistencia guardada.' });
  } catch (e) {
    responderError(res, e, 'Error al guardar la asistencia.');
  }
});

// GET /api/asistencia/mi -> asistencia propia del estudiante autenticado
router.get('/mi', requirePerm('asistencia.ver'), async (req, res) => {
  try {
    const rows = await query(
      `SELECT a.id_asistencia, g.nombre AS grupo, a.fecha, a.estado
         FROM asistencia a
         JOIN grupos g ON g.id_grupo = a.id_grupo
        WHERE a.id_estudiante = ?
        ORDER BY a.fecha DESC`, [req.auth.id_usuario]);
    res.json(rows);
  } catch (e) {
    responderError(res, e, 'Error al cargar su asistencia.');
  }
});

module.exports = router;