const express = require('express');
const { query } = require('../db');
const { authenticate, requirePerm } = require('../middleware');
const { responderError } = require('../errores');

const router = express.Router();
router.use(authenticate);

const esAdmin = (auth) => (auth.roles || []).includes('Administrativo');
const esProfe = (auth) => (auth.roles || []).includes('Profesor');

// GET /api/resumen/grupo/:id -> resumen del grupo: asistencia acumulada,
// sesiones de clase (temas vistos) y exámenes con su promedio.
router.get('/grupo/:id', requirePerm('asistencia.ver'), async (req, res) => {
  const id = Number(req.params.id);
  if (!(req.auth.permisos || []).includes('notas.ver')) {
    return res.status(403).json({ error: 'No tiene permiso para ver las notas.' });
  }
  if (!(req.auth.permisos || []).includes('sesiones.ver')) {
    return res.status(403).json({ error: 'No tiene permiso para ver las sesiones de clase.' });
  }
  try {
    const g = await query('SELECT id_grupo, nombre FROM grupos WHERE id_grupo = ?', [id]);
    if (g.length === 0) return res.status(404).json({ error: 'Grupo no encontrado.' });
    if (!esAdmin(req.auth)) {
      const g2 = await query('SELECT id_profesor FROM grupos WHERE id_grupo = ?', [id]);
      if (!(esProfe(req.auth) && g2[0] && g2[0].id_profesor === req.auth.id_usuario)) {
        return res.status(403).json({ error: 'No tiene acceso al resumen de este grupo.' });
      }
    }

    const estudiantes = await query(
      `SELECT u.id_usuario AS id_estudiante, u.nombres, u.apellidos,
              COALESCE(SUM(a.estado = 'Presente'), 0) AS presentes,
              COALESCE(SUM(a.estado = 'Ausente'), 0)  AS ausentes,
              COALESCE(SUM(a.estado = 'Excusa'), 0)   AS excusas
         FROM grupos_estudiantes ge
         JOIN usuarios u ON u.id_usuario = ge.id_estudiante
         LEFT JOIN asistencia a ON a.id_grupo = ge.id_grupo AND a.id_estudiante = ge.id_estudiante
        WHERE ge.id_grupo = ?
        GROUP BY u.id_usuario, u.nombres, u.apellidos
        ORDER BY u.nombres, u.apellidos`, [id]);
    const examenes = await query(
      `SELECT e.id_examen, e.nombre, e.fecha,
              COUNT(n.id_estudiante) AS alumnos,
              ROUND(COALESCE(AVG(n.calificacion), 0), 2) AS promedio
         FROM examenes e
         LEFT JOIN notas n ON n.id_examen = e.id_examen
        WHERE e.id_grupo = ?
        GROUP BY e.id_examen, e.nombre, e.fecha
        ORDER BY e.fecha, e.id_examen`, [id]);
    const sesiones = await query(
      `SELECT s.id_sesion, s.fecha, s.tema, s.descripcion,
              CONCAT(u.nombres, ' ', u.apellidos) AS profesor
         FROM sesiones_clase s
         JOIN usuarios u ON u.id_usuario = s.id_profesor
        WHERE s.id_grupo = ?
        ORDER BY s.fecha DESC, s.id_sesion DESC`, [id]);
    res.json({ grupo: g[0], estudiantes, examenes, sesiones });
  } catch (e) {
    responderError(res, e, 'Error al generar el resumen del grupo.');
  }
});

// GET /api/resumen/estudiante/:id -> resumen de un estudiante (asistencia, faltas,
// excusas y sus notas) - solo para el Administrativo
router.get('/estudiante/:id', requirePerm('asistencia.ver'), async (req, res) => {
  if (!esAdmin(req.auth)) {
    return res.status(403).json({ error: 'Solo el perfil Administrativo consulta el resumen por estudiante.' });
  }
  if (!(req.auth.permisos || []).includes('notas.ver')) {
    return res.status(403).json({ error: 'No tiene permiso para ver las notas.' });
  }
  const id = Number(req.params.id);
  try {
    const est = await query('SELECT id_usuario, nombres, apellidos, correo FROM usuarios WHERE id_usuario = ?', [id]);
    if (est.length === 0) return res.status(404).json({ error: 'Estudiante no encontrado.' });

    const registros = await query(
      `SELECT g.nombre AS grupo, a.fecha, a.estado
         FROM asistencia a
         JOIN grupos g ON g.id_grupo = a.id_grupo
        WHERE a.id_estudiante = ?
        ORDER BY a.fecha DESC, a.id_asistencia DESC`, [id]);
    const notas = await query(
      `SELECT e.id_examen, e.nombre, e.fecha, g.nombre AS grupo, n.calificacion
         FROM notas n
         JOIN examenes e ON e.id_examen = n.id_examen
         JOIN grupos g ON g.id_grupo = e.id_grupo
        WHERE n.id_estudiante = ?
        ORDER BY e.fecha DESC, e.id_examen DESC`, [id]);
    res.json({
      estudiante: est[0],
      asistencia: {
        presente: registros.filter(r => r.estado === 'Presente').length,
        ausente: registros.filter(r => r.estado === 'Ausente').length,
        excusa: registros.filter(r => r.estado === 'Excusa').length,
        total: registros.length
      },
      registros,
      notas
    });
  } catch (e) {
    responderError(res, e, 'Error al generar el resumen del estudiante.');
  }
});

module.exports = router;