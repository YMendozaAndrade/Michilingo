const express = require('express');
const { query } = require('../db');
const { authenticate, requirePerm } = require('../middleware');
const { responderError } = require('../errores');

const router = express.Router();
router.use(authenticate);

const esAdmin = (auth) => (auth.roles || []).includes('Administrativo');

// GET /api/horas -> horas trabajadas (Administrativo: todas; Profesor: las suyas)
router.get('/', requirePerm('horas.ver'), async (req, res) => {
  try {
    const filtro = esAdmin(req.auth) ? '' : ' AND h.id_profesor = ? ';
    const params = esAdmin(req.auth) ? [] : [req.auth.id_usuario];
    const rows = await query(
      `SELECT h.id_hora, h.fecha, h.horas,
              g.nombre AS grupo, h2.dia_semana,
              DATE_FORMAT(h2.hora_inicio, '%H:%i') AS hora_inicio,
              DATE_FORMAT(h2.hora_fin, '%H:%i') AS hora_fin,
              h.id_profesor,
              CONCAT(u.nombres, ' ', u.apellidos) AS profesor
         FROM horas_profesor h
         JOIN grupos g ON g.id_grupo = h.id_grupo
         JOIN horarios h2 ON h2.id_horario = h.id_horario
         JOIN usuarios u ON u.id_usuario = h.id_profesor
        WHERE 1=1 ${filtro}
        ORDER BY h.fecha DESC, h.id_hora DESC`, params);
    res.json(rows);
  } catch (e) {
    responderError(res, e, 'Error al listar horas trabajadas.');
  }
});

// POST /api/horas -> registrar horas trabajadas (el profesor solo elige grupo + horario;
// la cantidad de horas se calcula del intervalo del horario del grupo)
router.post('/', requirePerm('horas.registrar'), async (req, res) => {
  const { id_grupo, id_horario, fecha, id_profesor } = req.body || {};
  if (!id_grupo || !id_horario || !fecha) {
    return res.status(400).json({ error: 'Indique grupo, horario y fecha.' });
  }
  const idProf = esAdmin(req.auth) && id_profesor ? Number(id_profesor) : req.auth.id_usuario;
  try {
    const g = await query('SELECT id_profesor FROM grupos WHERE id_grupo = ?', [Number(id_grupo)]);
    if (g.length === 0) return res.status(404).json({ error: 'Grupo no encontrado.' });
    if (!esAdmin(req.auth) && g[0].id_profesor !== req.auth.id_usuario) {
      return res.status(403).json({ error: 'Solo puede registrar horas de sus propios grupos.' });
    }
    const h = await query(
      'SELECT id_horario, hora_inicio, hora_fin FROM horarios WHERE id_horario = ? AND id_grupo = ?',
      [Number(id_horario), Number(id_grupo)]);
    if (h.length === 0) return res.status(400).json({ error: 'El horario no pertenece al grupo.' });

    const horas = diffHoras(h[0].hora_inicio, h[0].hora_fin);
    if (horas <= 0) return res.status(400).json({ error: 'El horario no permite calcular las horas.' });

    const r = await query(
      'INSERT INTO horas_profesor (id_profesor, id_grupo, id_horario, fecha, horas) VALUES (?,?,?,?,?)',
      [idProf, Number(id_grupo), Number(id_horario), fecha, horas]);
    res.status(201).json({ id_hora: r.insertId, horas, mensaje: 'Horas registradas (calculadas del horario).' });
  } catch (e) {
    responderError(res, e, 'Error al registrar horas.');
  }
});

function diffHoras(inicio, fin) {
  const convertir = (t) => {
    const [h, m, s = 0] = String(t).split(':').map(Number);
    return (h * 60 + m + s / 60) / 60;
  };
  return Math.round((convertir(fin) - convertir(inicio)) * 10) / 10;
}

// DELETE /api/horas/:id -> eliminar el registro (solo el propio profesor o Administrativo)
router.delete('/:id', requirePerm('horas.registrar'), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const rows = await query('SELECT id_profesor FROM horas_profesor WHERE id_hora = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Registro no encontrado.' });
    if (!esAdmin(req.auth) && rows[0].id_profesor !== req.auth.id_usuario) {
      return res.status(403).json({ error: 'No puede eliminar horas de otro profesor.' });
    }
    await query('DELETE FROM horas_profesor WHERE id_hora = ?', [id]);
    res.json({ id_hora: id, mensaje: 'Registro eliminado.' });
  } catch (e) {
    responderError(res, e, 'Error al eliminar el registro.');
  }
});

module.exports = router;