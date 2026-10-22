-- =====================================================================
-- MichiLingo - Script de la base de datos academia_idiomas
-- =====================================================================

CREATE DATABASE academia_idiomas DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE academia_idiomas;

-- ---------------------------------------------------------------------
-- Usuarios del sistema
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
  id_usuario     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre_usuario VARCHAR(50)  NOT NULL,
  contrasena     VARCHAR(255) NOT NULL,
  nombres        VARCHAR(100) NOT NULL,
  apellidos      VARCHAR(100) NOT NULL,
  correo         VARCHAR(150) NOT NULL,
  activo         TINYINT(1)   NOT NULL DEFAULT 1,
  ultimo_acceso  DATETIME     NULL,
  creado_en      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_usuario),
  UNIQUE KEY uq_usuario_nombre (nombre_usuario),
  UNIQUE KEY uq_usuario_correo (correo),
  CONSTRAINT ck_usuario_correo CHECK (correo LIKE '%@%.%'),
  CONSTRAINT ck_usuario_activo CHECK (activo IN (0,1))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Roles o perfiles de usuario
-- ---------------------------------------------------------------------
CREATE TABLE roles (
  id_rol      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre      VARCHAR(60)  NOT NULL,
  descripcion VARCHAR(255) NULL,
  PRIMARY KEY (id_rol),
  UNIQUE KEY uq_rol_nombre (nombre)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Permisos por funcionalidad y ACCION
-- ---------------------------------------------------------------------
CREATE TABLE permisos (
  id_permiso  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre      VARCHAR(80)  NOT NULL,
  modulo      VARCHAR(60)  NOT NULL,
  descripcion VARCHAR(255) NULL,
  PRIMARY KEY (id_permiso),
  UNIQUE KEY uq_permiso_nombre (nombre),
  KEY ix_permiso_modulo (modulo)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Asignacion de permisos a cada rol
-- ---------------------------------------------------------------------
CREATE TABLE roles_permisos (
  id_rol     INT UNSIGNED NOT NULL,
  id_permiso INT UNSIGNED NOT NULL,
  PRIMARY KEY (id_rol, id_permiso),
  KEY fk_rp_permiso (id_permiso),
  CONSTRAINT fk_rp_rol     FOREIGN KEY (id_rol)     REFERENCES roles (id_rol)         ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rp_permiso FOREIGN KEY (id_permiso) REFERENCES permisos (id_permiso) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Roles asignados a cada usuario
-- ---------------------------------------------------------------------
CREATE TABLE usuarios_roles (
  id_usuario INT UNSIGNED NOT NULL,
  id_rol     INT UNSIGNED NOT NULL,
  PRIMARY KEY (id_usuario, id_rol),
  KEY fk_ur_rol (id_rol),
  CONSTRAINT fk_ur_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ur_rol     FOREIGN KEY (id_rol)     REFERENCES roles (id_rol)         ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Grupos academicos: todo grupo TIENE profesor a cargo (NOT NULL).
-- ---------------------------------------------------------------------
CREATE TABLE grupos (
  id_grupo    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre      VARCHAR(80)  NOT NULL,
  id_profesor INT UNSIGNED NOT NULL,
  creado_en   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_grupo),
  UNIQUE KEY uq_grupo_nombre (nombre),
  KEY fk_grupo_profesor (id_profesor),
  CONSTRAINT fk_grupo_profesor FOREIGN KEY (id_profesor) REFERENCES usuarios (id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Horarios de clase de cada grupo
-- ---------------------------------------------------------------------
CREATE TABLE horarios (
  id_horario  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_grupo    INT UNSIGNED NOT NULL,
  dia_semana  VARCHAR(10)  NOT NULL,
  hora_inicio TIME         NOT NULL,
  hora_fin    TIME         NOT NULL,
  PRIMARY KEY (id_horario),
  KEY fk_horario_grupo (id_grupo),
  UNIQUE KEY uq_horario (id_grupo, dia_semana, hora_inicio, hora_fin),
  CONSTRAINT fk_horario_grupo FOREIGN KEY (id_grupo) REFERENCES grupos (id_grupo) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT ck_horario_dia CHECK (dia_semana IN ('Lunes','Martes','Miercoles','Jueves','Viernes','Sabado','Domingo')),
  CONSTRAINT ck_horario_horas CHECK (hora_fin > hora_inicio)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Estudiantes asignados a cada grupo
-- ---------------------------------------------------------------------
CREATE TABLE grupos_estudiantes (
  id_grupo      INT UNSIGNED NOT NULL,
  id_estudiante INT UNSIGNED NOT NULL,
  PRIMARY KEY (id_grupo, id_estudiante),
  KEY fk_ge_estudiante (id_estudiante),
  CONSTRAINT fk_ge_grupo      FOREIGN KEY (id_grupo)      REFERENCES grupos (id_grupo)   ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ge_estudiante FOREIGN KEY (id_estudiante) REFERENCES usuarios (id_usuario) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- SESIONES DE CLASE (Temas vistos por sesion)
-- Cada sesion pertenece a un grupo, la dicta su profesor, en una fecha,
-- con un tema obligatorio. Si se indica horario, debe ser del mismo grupo.
-- ---------------------------------------------------------------------
CREATE TABLE sesiones_clase (
  id_sesion    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_grupo     INT UNSIGNED NOT NULL,
  id_profesor  INT UNSIGNED NOT NULL,
  id_horario   INT UNSIGNED NULL,
  fecha        DATE         NOT NULL,
  tema         VARCHAR(150) NOT NULL,
  descripcion  TEXT         NULL,
  creado_en    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_sesion),
  UNIQUE KEY uq_sesion (id_grupo, fecha, tema),
  KEY fk_sesion_grupo (id_grupo),
  KEY fk_sesion_profesor (id_profesor),
  KEY fk_sesion_horario (id_horario),
  CONSTRAINT fk_sesion_grupo    FOREIGN KEY (id_grupo)    REFERENCES grupos (id_grupo)     ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_sesion_profesor FOREIGN KEY (id_profesor) REFERENCES usuarios (id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_sesion_horario  FOREIGN KEY (id_horario)  REFERENCES horarios (id_horario) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Asistencia: todas las FK obligatorias (NOT NULL), sin reglas opcionales.
-- ---------------------------------------------------------------------
CREATE TABLE asistencia (
  id_asistencia    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_grupo         INT UNSIGNED NOT NULL,
  id_estudiante    INT UNSIGNED NOT NULL,
  fecha            DATE         NOT NULL,
  estado           ENUM('Presente','Ausente','Excusa') NOT NULL DEFAULT 'Presente',
  registrado_por   INT UNSIGNED NOT NULL,
  PRIMARY KEY (id_asistencia),
  UNIQUE KEY uq_asistencia (id_grupo, id_estudiante, fecha),
  KEY fk_asist_estudiante (id_estudiante),
  KEY fk_asist_registrador (registrado_por),
  CONSTRAINT fk_asist_grupo       FOREIGN KEY (id_grupo)      REFERENCES grupos (id_grupo)     ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_asist_estudiante  FOREIGN KEY (id_estudiante) REFERENCES usuarios (id_usuario) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_asist_registrador FOREIGN KEY (registrado_por) REFERENCES usuarios (id_usuario) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Horas trabajadas: todas las FK obligatorias + CHECK + UNIQUE anti-duplicado.
-- ---------------------------------------------------------------------
CREATE TABLE horas_profesor (
  id_hora      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_profesor  INT UNSIGNED NOT NULL,
  id_grupo     INT UNSIGNED NOT NULL,
  id_horario   INT UNSIGNED NOT NULL,
  fecha        DATE         NOT NULL,
  horas        DECIMAL(4,1) NOT NULL,
  PRIMARY KEY (id_hora),
  UNIQUE KEY uq_hora (id_profesor, id_grupo, id_horario, fecha),
  KEY fk_hp_profesor (id_profesor),
  KEY fk_hp_grupo (id_grupo),
  KEY fk_hp_horario (id_horario),
  CONSTRAINT fk_hp_profesor FOREIGN KEY (id_profesor) REFERENCES usuarios (id_usuario) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_hp_grupo    FOREIGN KEY (id_grupo)    REFERENCES grupos (id_grupo)     ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_hp_horario  FOREIGN KEY (id_horario)  REFERENCES horarios (id_horario) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ck_horas_positivas CHECK (horas > 0 AND horas <= 12)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Examenes (temas evaluados) por grupo: fecha obligatoria + UNIQUE por grupo.
-- ---------------------------------------------------------------------
CREATE TABLE examenes (
  id_examen INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_grupo  INT UNSIGNED NOT NULL,
  nombre    VARCHAR(100) NOT NULL,
  fecha     DATE         NOT NULL,
  PRIMARY KEY (id_examen),
  UNIQUE KEY uq_examen_grupo_nombre (id_grupo, nombre),
  KEY fk_examen_grupo (id_grupo),
  CONSTRAINT fk_examen_grupo FOREIGN KEY (id_grupo) REFERENCES grupos (id_grupo) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Notas: escala 0.0 a 5.0 con CHECK a nivel de BD.
-- ---------------------------------------------------------------------
CREATE TABLE notas (
  id_examen     INT UNSIGNED NOT NULL,
  id_estudiante INT UNSIGNED NOT NULL,
  calificacion  DECIMAL(4,2) NOT NULL,
  PRIMARY KEY (id_examen, id_estudiante),
  KEY fk_nota_estudiante (id_estudiante),
  CONSTRAINT fk_nota_examen     FOREIGN KEY (id_examen)     REFERENCES examenes (id_examen) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_nota_estudiante FOREIGN KEY (id_estudiante) REFERENCES usuarios (id_usuario) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT ck_nota_rango CHECK (calificacion >= 0 AND calificacion <= 5)
) ENGINE=InnoDB;

-- =====================================================================
-- Datos de ejemplo
-- =====================================================================
USE academia_idiomas;

-- ---------------------------------------------------------------------
-- Permisos por funcionalidad + ACCION
-- ---------------------------------------------------------------------
INSERT INTO permisos (nombre, modulo, descripcion) VALUES
  ('usuarios.ver',      'Usuarios',   'Ver el listado de usuarios.'),
  ('usuarios.crear',    'Usuarios',   'Crear nuevos usuarios.'),
  ('usuarios.editar',   'Usuarios',   'Editar usuarios existentes.'),
  ('usuarios.eliminar', 'Usuarios',   'Desactivar usuarios.'),
  ('roles.ver',         'Roles',      'Ver roles, perfiles y sus permisos de accion.'),
  ('roles.gestionar',   'Roles',      'Crear, editar y eliminar roles y sus permisos.'),
  ('grupos.ver',        'Grupos',     'Ver los grupos con su profesor y horarios.'),
  ('grupos.gestionar',  'Grupos',     'Crear, editar y eliminar grupos y asignar estudiantes.'),
  ('asistencia.ver',    'Asistencia', 'Ver la asistencia de los estudiantes.'),
  ('asistencia.marcar', 'Asistencia', 'Marcar asistencia, faltas y excusas.'),
  ('horas.ver',         'Horas',      'Ver las horas trabajadas por los profesores.'),
  ('horas.registrar',   'Horas',      'Registrar las horas trabajadas con grupo y horario.'),
  ('notas.ver',         'Notas',      'Ver los examenes (temas) y las notas.'),
  ('notas.gestionar',   'Notas',      'Crear examenes y subir las notas (0.0 a 5.0).'),
  ('sesiones.ver',      'Sesiones',   'Ver las sesiones de clase (temas vistos).'),
  ('sesiones.gestionar','Sesiones',   'Crear, editar y eliminar sesiones de clase.')
ON DUPLICATE KEY UPDATE modulo = VALUES(modulo), descripcion = VALUES(descripcion);

-- ---------------------------------------------------------------------
-- Roles del instituto
-- ---------------------------------------------------------------------
INSERT INTO roles (nombre, descripcion) VALUES
  ('Administrativo', 'Administracion de usuarios y consulta de resumenes: asistencia, sesiones, examenes, notas y horas. Gestiona roles y permisos.'),
  ('Profesor',       'Administra sus grupos: dicta sesiones (temas), marca asistencia, registra horas y sube notas.'),
  ('Estudiante',     'Solo lectura: consulta su grupo, sesiones, asistencia y notas.')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

-- ---------------------------------------------------------------------
-- Permisos asignados a cada perfil
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
-- Usuarios iniciales
-- ---------------------------------------------------------------------
INSERT INTO usuarios (nombre_usuario, contrasena, nombres, apellidos, correo, activo) VALUES
  ('admin',  SHA2('admin123', 256),  'Secretaria', 'Academica',     'admin@michilingo.edu.co',  1),
  ('profe',  SHA2('profe123', 256),  'Carlos',     'Ramirez',       'profe@michilingo.edu.co',  1),
  ('Lucia',  SHA2('est123', 256),    'Lucia',      'Gomez',         'lucia@michilingo.edu.co',  1),
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
-- Grupos + horarios + estudiantes
-- ---------------------------------------------------------------------
INSERT IGNORE INTO grupos (nombre, id_profesor)
SELECT 'Ingles A1 - Grupo 1', u.id_usuario FROM usuarios u WHERE u.nombre_usuario = 'profe';

INSERT IGNORE INTO horarios (id_grupo, dia_semana, hora_inicio, hora_fin)
SELECT g.id_grupo, h.dia, h.inicio, h.fin FROM grupos g
CROSS JOIN (SELECT 'Lunes' AS dia, '18:00:00' AS inicio, '20:00:00' AS fin
            UNION ALL SELECT 'Miercoles', '18:00:00', '20:00:00') h
WHERE g.nombre = 'Ingles A1 - Grupo 1';

INSERT IGNORE INTO grupos_estudiantes (id_grupo, id_estudiante)
SELECT g.id_grupo, u.id_usuario FROM grupos g, usuarios u
WHERE g.nombre = 'Ingles A1 - Grupo 1' AND u.nombre_usuario = 'Lucia';

INSERT IGNORE INTO grupos (nombre, id_profesor)
SELECT 'Ingles B1', u.id_usuario FROM usuarios u WHERE u.nombre_usuario = 'profe';

INSERT IGNORE INTO horarios (id_grupo, dia_semana, hora_inicio, hora_fin)
SELECT g.id_grupo, 'Sabado', '08:00:00', '12:00:00' FROM grupos g
WHERE g.nombre = 'Ingles B1'
  AND NOT EXISTS (SELECT 1 FROM horarios h WHERE h.id_grupo = g.id_grupo AND h.dia_semana = 'Sabado');

INSERT IGNORE INTO grupos_estudiantes (id_grupo, id_estudiante)
SELECT g.id_grupo, u.id_usuario FROM grupos g, usuarios u
WHERE g.nombre = 'Ingles B1' AND u.nombre_usuario = 'julian';

-- ---------------------------------------------------------------------
-- SESIONES DE CLASE (Temas vistos)
-- ---------------------------------------------------------------------
INSERT IGNORE INTO sesiones_clase (id_grupo, id_profesor, id_horario, fecha, tema, descripcion)
SELECT g.id_grupo, prof.id_usuario, h.id_horario, '2026-09-08', 'Saludos y presentaciones',
       'Saludos formales e informales, verbo to be afirmativo.'
FROM grupos g, usuarios prof, horarios h
WHERE g.nombre = 'Ingles A1 - Grupo 1' AND prof.nombre_usuario = 'profe'
  AND h.id_grupo = g.id_grupo AND h.dia_semana = 'Lunes';

INSERT IGNORE INTO sesiones_clase (id_grupo, id_profesor, id_horario, fecha, tema, descripcion)
SELECT g.id_grupo, prof.id_usuario, h.id_horario, '2026-09-10', 'Verbo to be: preguntas y respuestas',
       'Preguntas con What/Where, respuestas cortas y vocabulario de la casa.'
FROM grupos g, usuarios prof, horarios h
WHERE g.nombre = 'Ingles A1 - Grupo 1' AND prof.nombre_usuario = 'profe'
  AND h.id_grupo = g.id_grupo AND h.dia_semana = 'Miercoles';

INSERT IGNORE INTO sesiones_clase (id_grupo, id_profesor, id_horario, fecha, tema, descripcion)
SELECT g.id_grupo, prof.id_usuario, h.id_horario, '2026-09-13', 'Pasado simple: introduccion',
       'Pasado del verbo to be (was/were) y expresiones de tiempo.'
FROM grupos g, usuarios prof, horarios h
WHERE g.nombre = 'Ingles B1' AND prof.nombre_usuario = 'profe'
  AND h.id_grupo = g.id_grupo AND h.dia_semana = 'Sabado';

-- ---------------------------------------------------------------------
-- Examenes + notas
-- ---------------------------------------------------------------------
INSERT IGNORE INTO examenes (id_grupo, nombre, fecha)
SELECT g.id_grupo, 'Examen parcial 1', '2026-10-05' FROM grupos g
WHERE g.nombre = 'Ingles A1 - Grupo 1';

INSERT IGNORE INTO notas (id_examen, id_estudiante, calificacion)
SELECT e.id_examen, u.id_usuario, 4.0 FROM examenes e, usuarios u
WHERE e.nombre = 'Examen parcial 1' AND u.nombre_usuario = 'Lucia';

INSERT IGNORE INTO examenes (id_grupo, nombre, fecha)
SELECT g.id_grupo, 'examen A1', '2026-09-12' FROM grupos g WHERE g.nombre = 'Ingles B1';

INSERT IGNORE INTO notas (id_examen, id_estudiante, calificacion)
SELECT e.id_examen, u.id_usuario, 3.5 FROM examenes e, usuarios u
WHERE e.nombre = 'examen A1' AND u.nombre_usuario = 'julian';

-- ---------------------------------------------------------------------
-- Asistencia
-- ---------------------------------------------------------------------
INSERT IGNORE INTO asistencia (id_grupo, id_estudiante, fecha, estado, registrado_por)
SELECT g.id_grupo, u.id_usuario, '2026-09-14', 'Presente', p.id_usuario
FROM grupos g, usuarios u, usuarios p
WHERE g.nombre = 'Ingles A1 - Grupo 1' AND u.nombre_usuario = 'Lucia' AND p.nombre_usuario = 'profe';

INSERT IGNORE INTO asistencia (id_grupo, id_estudiante, fecha, estado, registrado_por)
SELECT g.id_grupo, u.id_usuario, '2026-09-14', 'Excusa', p.id_usuario
FROM grupos g, usuarios u, usuarios p
WHERE g.nombre = 'Ingles B1' AND u.nombre_usuario = 'julian' AND p.nombre_usuario = 'profe';

-- ---------------------------------------------------------------------
-- Horas
-- ---------------------------------------------------------------------
INSERT IGNORE INTO horas_profesor (id_profesor, id_grupo, id_horario, fecha, horas)
SELECT prof.id_usuario, g.id_grupo, h.id_horario, '2026-09-14', 4.0
FROM grupos g, usuarios prof, horarios h
WHERE g.nombre = 'Ingles B1' AND prof.nombre_usuario = 'profe'
  AND h.id_grupo = g.id_grupo AND h.dia_semana = 'Sabado';
