// Respuestas de error amigables: convierte errores comunes de MySQL
// (UNIQUE, llaves foráneas, CHECK) a mensajes claros sin fuga de SQL.
function esErrorDuplicado(e) {
  return e.errno === 1062 || e.code === 'ER_DUP_ENTRY' || e.code === 'ER_DUP_KEYNAME';
}

function esErrorFK(e) {
  return e.errno === 1451 || e.errno === 1452 || e.code === 'ER_ROW_IS_REFERENCED_2' || e.code === 'ER_NO_REFERENCED_ROW_2';
}

function responderError(res, e, fallback) {
  if (esErrorDuplicado(e)) {
    return res.status(409).json({ error: 'Registro duplicado: ese valor único ya existe.' });
  }
  if (esErrorFK(e)) {
    return res.status(409).json({ error: 'No se puede completar: el registro tiene datos asociados o no existe la referencia.' });
  }
  if (e.errno === 3819 || e.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    return res.status(400).json({ error: (e.sqlMessage || 'Valor fuera de las reglas de la tabla.').replace(/Check constraint '[^']*' is violated\./, '') });
  }
  if (e.status && e.status >= 400 && e.status < 500) {
    return res.status(e.status).json({ error: e.message });
  }
  return res.status(500).json({ error: fallback, detalle: e.message });
}

module.exports = { responderError, esErrorDuplicado, esErrorFK };