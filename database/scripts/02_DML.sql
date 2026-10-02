-- =====================================================================
-- MichiLingo - 02_DML.sql (SOLO datos: permisos, roles, usuarios, grupos,
-- horarios, sesiones de clase, asistencia, horas, exámenes y notas)
-- Requiere: 01_DDL.sql ya cargado.
-- =====================================================================
USE academia_idiomas;

-- ---------------------------------------------------------------------
-- 16 permisos por funcionalidad + ACCION (cada opción de menú exige el suyo)
-- ---------------------------------------------------------------------
INSERT INTO permisos (nombre, modulo, descripcion) VALUES
  ('usuarios.ver',      'Usuarios',   'Ver el listado de usuarios.'),
  ('usuarios.crear',    'Usuarios',   'Crear nuevos usuarios.'),
  ('usuarios.editar',   'Usuarios',   'Editar usuarios existentes.'),
  ('usuarios.eliminar', 'Usuarios',   'Desactivar usuarios.'),
  ('roles.ver',         'Roles',      'Ver roles, perfiles y sus permisos de acción.'),
  ('roles.gestionar',   'Roles',      'Crear, editar y eliminar roles y sus permisos.'),
  ('grupos.ver',        'Grupos',     'Ver los grupos con su profesor y horarios.'),
  ('grupos.gestionar',  'Grupos',     'Crear, editar y eliminar grupos y asignar estudiantes.'),
  ('asistencia.ver',    'Asistencia', 'Ver la asistencia de los estudiantes.'),
  ('asistencia.marcar', 'Asistencia', 'Marcar asistencia, faltas y excusas.'),
  ('horas.ver',         'Horas',      'Ver las horas trabajadas por los profesores.'),
  ('horas.registrar',   'Horas',      'Registrar las horas trabajadas con grupo y horario.'),
  ('notas.ver',         'Notas',      'Ver los exámenes (temas) y las notas.'),
  ('notas.gestionar',   'Notas',      'Crear exámenes y subir las notas (0.0 a 5.0).'),
  ('sesiones.ver',      'Sesiones',   'Ver las sesiones de clase (temas vistos).'),
  ('sesiones.gestionar','Sesiones',   'Crear, editar y eliminar sesiones de clase.')
ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descripcion = VALUES(descripcion);

-- ---------------------------------------------------------------------
-- Roles del instituto
-- ---------------------------------------------------------------------
INSERT INTO roles (nombre, descripcion) VALUES
  ('Administrativo', 'Administración de usuarios y consulta de resúmenes: asistencia, sesiones, exámenes, notas y horas. Gestiona roles y permisos.'),
  ('Profesor',       'Administra sus grupos: dicta sesiones (temas), marca asistencia, registra horas y sube notas.'),
  ('Estudiante',     'Solo lectura: consulta su grupo, sesiones, asistencia y notas.')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

-- ---------------------------------------------------------------------
-- Permisos asignados a cada perfil (cada acción del menú exige su permiso)
--  Administrativo (12): todo ver + gestionar usuarios/roles/grupos.
--  Profesor (9): sus grupos + sesiones + asistencia + horas + notas.
--  Estudiante (4): solo lectura (grupos, sesiones, asistencia, notas).
-- ---------------------------------------------------------------------
DELETE FROM roles_permisos;
INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso FROM roles r, permisos p
WHERE r.nombre = 'Administrativo'
  AND p.nombre IN ('usuarios.ver','usuarios.crear','usuarios.editar','usuarios.eliminar',
                   'roles.ver','roles.gestionar',
                   'grupos.ver','grupos.gestionar',
                   'asistencia.ver','horas.ver','notas.ver','sesiones.ver')
UNION ALL
SELECT r.id_rol, p.id_permiso FROM roles r, permisos p
WHERE r.nombre = 'Profesor'
  AND p.nombre IN ('grupos.ver',
                   'asistencia.ver','asistencia.marcar',
                   'horas.ver','horas.registrar',
                   'notas.ver','notas.gestionar',
                   'sesiones.ver','sesiones.gestionar')
UNION ALL
SELECT r.id_rol, p.id_permiso FROM roles r, permisos p
WHERE r.nombre = 'Estudiante'
  AND p.nombre IN ('grupos.ver','sesiones.ver','asistencia.ver','notas.ver');

-- ---------------------------------------------------------------------
-- Usuarios iniciales (nombres, apellidos y correo OBLIGATORIOS y ÚNICOS)
-- ---------------------------------------------------------------------
INSERT INTO usuarios (nombre_usuario, contrasena, nombres, apellidos, correo, activo) VALUES
  ('admin',  SHA2('admin123', 256),  'Secretaria', 'Académica',     'admin@michilingo.edu.co',  1),
  ('profe',  SHA2('profe123', 256),  'Carlos',     'Ramírez',       'profe@michilingo.edu.co',  1),
  ('Lucia',  SHA2('est123', 256),    'Lucía',      'Gómez',         'lucia@michilingo.edu.co',  1),
  ('julian', 'scrypt$16384$8864089ff5d3fa127422610f3180331e$8a1600e02599a06356ff5b4c8da67558dec09de7039a8c1106cc46524ebeab9725e3b279c4312d1efcf301dd674971b617c6c084ef2ee72acee667e841d05634',
             'Julian', 'Salazar Arias', 'julian@michilingo.edu.co', 1)
ON DUPLICATE KEY UPDATE nombres = VALUES(nombres), apellidos = VALUES(apellidos),
                        correo = VALUES(correo), activo = VALUES(activo);

INSERT IGNORE INTO usuarios_roles (id_usuario, id_rol)
SELECT u.id_usuario, r.id_rol FROM usuarios u, roles r
WHERE (u.nombre_usuario = 'admin'  AND r.nombre = 'Administrativo')
   OR (u.nombre_usuario = 'profe'  AND r.nombre = 'Profesor')
   OR (u.nombre_usuario = 'Lucia'  AND r.nombre = 'Estudiante')
   OR (u.nombre_usuario = 'julian' AND r.nombre = 'Estudiante');

-- ---------------------------------------------------------------------
-- Grupos + horarios + estudiantes (el profesor es OBLIGATORIO)
-- ---------------------------------------------------------------------
INSERT IGNORE INTO grupos (nombre, id_profesor)
SELECT 'Inglés A1 - Grupo 1', u.id_usuario FROM usuarios u WHERE u.nombre_usuario = 'profe';

INSERT IGNORE INTO horarios (id_grupo, dia_semana, hora_inicio, hora_fin)
SELECT g.id_grupo, h.dia, h.inicio, h.fin FROM grupos g
CROSS JOIN (SELECT 'Lunes' AS dia, '18:00:00' AS inicio, '20:00:00' AS fin
            UNION ALL SELECT 'Miércoles', '18:00:00', '20:00:00') h
WHERE g.nombre = 'Inglés A1 - Grupo 1';

INSERT IGNORE INTO grupos_estudiantes (id_grupo, id_estudiante)
SELECT g.id_grupo, u.id_usuario FROM grupos g, usuarios u
WHERE g.nombre = 'Inglés A1 - Grupo 1' AND u.nombre_usuario = 'Lucia';

INSERT IGNORE INTO grupos (nombre, id_profesor)
SELECT 'Ingles B1', u.id_usuario FROM usuarios u WHERE u.nombre_usuario = 'profe';

INSERT IGNORE INTO horarios (id_grupo, dia_semana, hora_inicio, hora_fin)
SELECT g.id_grupo, 'Sábado', '08:00:00', '12:00:00' FROM grupos g
WHERE g.nombre = 'Ingles B1'
  AND NOT EXISTS (SELECT 1 FROM horarios h WHERE h.id_grupo = g.id_grupo AND h.dia_semana = 'Sábado');

INSERT IGNORE INTO grupos_estudiantes (id_grupo, id_estudiante)
SELECT g.id_grupo, u.id_usuario FROM grupos g, usuarios u
WHERE g.nombre = 'Ingles B1' AND u.nombre_usuario = 'julian';

-- ---------------------------------------------------------------------
-- SESIONES DE CLASE (Temas vistos): evidencia exigida por el docente.
-- ---------------------------------------------------------------------
INSERT IGNORE INTO sesiones_clase (id_grupo, id_profesor, id_horario, fecha, tema, descripcion)
SELECT g.id_grupo, prof.id_usuario, h.id_horario, '2026-09-08', 'Saludos y presentaciones',
       'Saludos formales e informales, verbo to be afirmativo.'
FROM grupos g, usuarios prof, horarios h
WHERE g.nombre = 'Inglés A1 - Grupo 1' AND prof.nombre_usuario = 'profe'
  AND h.id_grupo = g.id_grupo AND h.dia_semana = 'Lunes';

INSERT IGNORE INTO sesiones_clase (id_grupo, id_profesor, id_horario, fecha, tema, descripcion)
SELECT g.id_grupo, prof.id_usuario, h.id_horario, '2026-09-10', 'Verbo to be: preguntas y respuestas',
       'Preguntas con What/Where, respuestas cortas y vocabulario de la casa.'
FROM grupos g, usuarios prof, horarios h
WHERE g.nombre = 'Inglés A1 - Grupo 1' AND prof.nombre_usuario = 'profe'
  AND h.id_grupo = g.id_grupo AND h.dia_semana = 'Miércoles';

INSERT IGNORE INTO sesiones_clase (id_grupo, id_profesor, id_horario, fecha, tema, descripcion)
SELECT g.id_grupo, prof.id_usuario, h.id_horario, '2026-09-13', 'Pasado simple: introducción',
       'Pasado del verbo to be (was/were) y expresiones de tiempo.'
FROM grupos g, usuarios prof, horarios h
WHERE g.nombre = 'Ingles B1' AND prof.nombre_usuario = 'profe'
  AND h.id_grupo = g.id_grupo AND h.dia_semana = 'Sábado';

-- ---------------------------------------------------------------------
-- Exámenes + notas (fecha OBLIGATORIA, nota 0.0-5.0)
-- ---------------------------------------------------------------------
INSERT IGNORE INTO examenes (id_grupo, nombre, fecha)
SELECT g.id_grupo, 'Examen parcial 1', '2026-10-05' FROM grupos g
WHERE g.nombre = 'Inglés A1 - Grupo 1';

INSERT IGNORE INTO notas (id_examen, id_estudiante, calificacion)
SELECT e.id_examen, u.id_usuario, 4.0 FROM examenes e, usuarios u
WHERE e.nombre = 'Examen parcial 1' AND u.nombre_usuario = 'Lucia';

INSERT IGNORE INTO examenes (id_grupo, nombre, fecha)
SELECT g.id_grupo, 'examen A1', '2026-09-12' FROM grupos g WHERE g.nombre = 'Ingles B1';

INSERT IGNORE INTO notas (id_examen, id_estudiante, calificacion)
SELECT e.id_examen, u.id_usuario, 3.5 FROM examenes e, usuarios u
WHERE e.nombre = 'examen A1' AND u.nombre_usuario = 'julian';

-- ---------------------------------------------------------------------
-- Asistencia (estudiante matriculado + registrado por su profesor)
-- ---------------------------------------------------------------------
INSERT IGNORE INTO asistencia (id_grupo, id_estudiante, fecha, estado, registrado_por)
SELECT g.id_grupo, u.id_usuario, '2026-09-14', 'Presente', p.id_usuario
FROM grupos g, usuarios u, usuarios p
WHERE g.nombre = 'Inglés A1 - Grupo 1' AND u.nombre_usuario = 'Lucia' AND p.nombre_usuario = 'profe';

INSERT IGNORE INTO asistencia (id_grupo, id_estudiante, fecha, estado, registrado_por)
SELECT g.id_grupo, u.id_usuario, '2026-09-14', 'Excusa', p.id_usuario
FROM grupos g, usuarios u, usuarios p
WHERE g.nombre = 'Ingles B1' AND u.nombre_usuario = 'julian' AND p.nombre_usuario = 'profe';

-- ---------------------------------------------------------------------
-- Horas (horario del mismo grupo + profesor del grupo)
-- ---------------------------------------------------------------------
INSERT IGNORE INTO horas_profesor (id_profesor, id_grupo, id_horario, fecha, horas)
SELECT prof.id_usuario, g.id_grupo, h.id_horario, '2026-09-14', 4.0
FROM grupos g, usuarios prof, horarios h
WHERE g.nombre = 'Ingles B1' AND prof.nombre_usuario = 'profe'
  AND h.id_grupo = g.id_grupo AND h.dia_semana = 'Sábado';
