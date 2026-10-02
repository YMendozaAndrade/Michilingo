const express = require('express');
const { query } = require('../db');
const { authenticate, requirePerm } = require('../middleware');
const { responderError } = require('../errores');

const router = express.Router();
router.use(authenticate);

const esAdmin = (auth) => (auth.roles || []).includes('Administrativo');
const esProfe = (auth) => (auth.roles || []).includes('Profesor');
const esEstudiante = (auth) => (auth.roles || []).includes('Estudiante');

async function cargarGrupo(id_grupo) {
  const rows = await query('SELECT * FROM grupos WHERE id_grupo = ?', [id_grupo]);
  return rows.length > 0 ? rows[0] : null;
}

async function conDetalles(grupos) {
  const detalles = [];
  for (const g of grupos) {
    const horarios = await query(
      `SELECT h.id_horario, h.dia_semana, DATE_FORMAT(h.hora_inicio, '%H:%i') AS hora_inicio,
              DATE_FORMAT(h.hora_fin, '%H:%i') AS hora_fin
         FROM horarios h WHERE h.id_grupo = ? ORDER BY h.id_horario`, [g.id_grupo]);
    const estudiantes = await query(
      `SELECT u.id_usuario AS id_estudiante, u.nombres, u.apellidos, u.correo
         FROM grupos_estudiantes ge
         JOIN usuarios u ON u.id_usuario = ge.id_estudiante
        WHERE ge.id_grupo = ? ORDER BY u.nombres`, [g.id_grupo]);
    const profe = g.id_profesor ? await query('SELECT nombres, apellidos FROM usuarios WHERE id_usuario = ?', [g.id_profesor]) : [];
    detalles.push({
      id_grupo: g.id_grupo,
      nombre: g.nombre,
      id_profesor: g.id_profesor,
      profesor: profe[0] ? `${profe[0].nombres} ${profe[0].apellidos}`.trim() : null,
      horarios,
      estudiantes
    });
  }
  return detalles;
}

// GET /api/grupos -> grupos visibles según el perfil (Administrativo: todos;
// Profesor: los que imparte; Estudiante: los suyos)
router.get('/', requirePerm('grupos.ver'), async (req, res) => {
  try {
    let grupos;
    if (esEstudiante(req.auth) && !esAdmin(req.auth) && !esProfe(req.auth)) {
      grupos = await query(
        `SELECT g.* FROM grupos g JOIN grupos_estudiantes ge ON ge.id_grupo = g.id_grupo
          WHERE ge.id_estudiante = ?`, [req.auth.id_usuario]);
    } else if (esProfe(req.auth) && !esAdmin(req.auth)) {
      grupos = await query('SELECT * FROM grupos WHERE id_profesor = ?', [req.auth.id_usuario]);
    } else {
      grupos = await query('SELECT * FROM grupos ORDER BY id_grupo');
    }
    res.json(await conDetalles(grupos));
  } catch (e) {
    responderError(res, e, 'Error al listar grupos.');
  }
});

// POST /api/grupos -> crear grupo con profesor, horarios y estudiantes
// El profesor es OBLIGATORIO (integridad referencial, MR-3FN).
router.post('/', requirePerm('grupos.gestionar'), async (req, res) => {
  const { nombre, id_profesor, horarios, estudiantes } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'El nombre del grupo es obligatorio.' });
  if (!id_profesor) return res.status(400).json({ error: 'El profesor a cargo es obligatorio.' });
  try {
    const exist = await query('SELECT id_grupo FROM grupos WHERE nombre = ?', [nombre]);
    if (exist.length > 0) return res.status(409).json({ error: 'Ya existe un grupo con ese nombre.' });

    const g = await query('INSERT INTO grupos (nombre, id_profesor) VALUES (?,?)',
                          [nombre, Number(id_profesor)]);
    const id_grupo = g.insertId;
    await guardarHorarios(id_grupo, horarios);
    await guardarEstudiantes(id_grupo, estudiantes);
    res.status(201).json({ id_grupo, mensaje: 'Grupo creado.' });
  } catch (e) {
    responderError(res, e, 'Error al crear el grupo.');
  }
});

// PUT /api/grupos/:id -> editar grupo (reemplaza horarios y estudiantes)
router.put('/:id', requirePerm('grupos.gestionar'), async (req, res) => {
  const id = Number(req.params.id);
  const { nombre, id_profesor, horarios, estudiantes } = req.body || {};
  try {
    if (!await cargarGrupo(id)) return res.status(404).json({ error: 'Grupo no encontrado.' });
    if (nombre) await query('UPDATE grupos SET nombre = ? WHERE id_grupo = ?', [nombre, id]);
    if (id_profesor !== undefined) {
      if (!id_profesor) return res.status(400).json({ error: 'El profesor a cargo es obligatorio.' });
      await query('UPDATE grupos SET id_profesor = ? WHERE id_grupo = ?', [Number(id_profesor), id]);
    }
    await query('DELETE FROM horarios WHERE id_grupo = ?', [id]);
    await query('DELETE FROM grupos_estudiantes WHERE id_grupo = ?', [id]);
    await guardarHorarios(id, horarios);
    await guardarEstudiantes(id, estudiantes);
    res.json({ id_grupo: id, mensaje: 'Grupo actualizado.' });
  } catch (e) {
    responderError(res, e, 'Error al actualizar el grupo.');
  }
});

// DELETE /api/grupos/:id
router.delete('/:id', requirePerm('grupos.gestionar'), async (req, res) => {
  const id = Number(req.params.id);
  try {
    if (!await cargarGrupo(id)) return res.status(404).json({ error: 'Grupo no encontrado.' });
    await query('DELETE FROM grupos WHERE id_grupo = ?', [id]);
    res.json({ id_grupo: id, mensaje: 'Grupo eliminado.' });
  } catch (e) {
    responderError(res, e, 'Error al eliminar el grupo.');
  }
});

async function guardarHorarios(id_grupo, horarios) {
  if (!Array.isArray(horarios)) return;
  for (const h of horarios) {
    if (!h || !h.dia_semana || !h.hora_inicio || !h.hora_fin) continue;
    await query('INSERT INTO horarios (id_grupo, dia_semana, hora_inicio, hora_fin) VALUES (?,?,?,?)',
                [id_grupo, h.dia_semana, h.hora_inicio, h.hora_fin]);
  }
}

async function guardarEstudiantes(id_grupo, estudiantes) {
  if (!Array.isArray(estudiantes)) return;
  for (const idEst of estudiantes) {
    await query('INSERT IGNORE INTO grupos_estudiantes (id_grupo, id_estudiante) VALUES (?,?)',
                [id_grupo, Number(idEst)]);
  }
}

module.exports = router;