-- =====================================================================
-- MichiLingo - 01_DDL.sql (SOLO estructura: tablas + integridad + triggers + vistas)
-- Base: academia_idiomas | Motor: MySQL 8 / MariaDB | CHARSET utf8mb4
-- Correcciones aplicadas (retroalimentación docente):
--  1) MR-3FN: FKs obligatorias (NOT NULL), sin reglas opcionales en
--     asistencia/horas; nueva tabla sesiones_clase (Temas vistos por sesión).
--  2) Integridad del dato: NOT NULL + DEFAULT + UNIQUE funcionales + CHECK.
-- =====================================================================
DROP DATABASE IF EXISTS academia_idiomas;
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
-- Permisos por funcionalidad y ACCION (ver/crear/editar/eliminar/marcar/registrar/gestionar)
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
  CONSTRAINT ck_horario_dia CHECK (dia_semana IN ('Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo')),
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
-- SESIONES DE CLASE (Temas vistos por sesión) - NUEVO, exigido en retroalimentación.
-- Cada sesión pertenece a un grupo, la dicta su profesor, en una fecha,
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
-- Exámenes (temas evaluados) por grupo: fecha obligatoria + UNIQUE por grupo.
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
