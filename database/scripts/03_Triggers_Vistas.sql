-- =====================================================================
-- MichiLingo - 03_Triggers_Vistas.sql (integridad referencial avanzada)
-- Requiere: 01_DDL.sql + 02_DML.sql ya cargados.
-- Demuestra que asistencia/horas/notas/sesiones siempre son coherentes
-- con grupo + profesor + horario + estudiantes matriculados.
-- =====================================================================
USE academia_idiomas;

DROP TRIGGER IF EXISTS trg_asistencia_estudiante_en_grupo;
DROP TRIGGER IF EXISTS trg_asistencia_registrador_es_profesor;
DROP TRIGGER IF EXISTS trg_horas_horario_del_grupo;
DROP TRIGGER IF EXISTS trg_horas_profesor_del_grupo;
DROP TRIGGER IF EXISTS trg_notas_estudiante_en_grupo;
DROP TRIGGER IF EXISTS trg_sesion_profesor_del_grupo;
DROP TRIGGER IF EXISTS trg_sesion_horario_del_grupo;
DROP VIEW IF EXISTS v_resumen_grupo;
DROP VIEW IF EXISTS v_horas_detalle;

DELIMITER $$

-- Asistencia: el estudiante DEBE estar matriculado en el grupo.
CREATE TRIGGER trg_asistencia_estudiante_en_grupo
BEFORE INSERT ON asistencia
FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM grupos_estudiantes
                  WHERE id_grupo = NEW.id_grupo AND id_estudiante = NEW.id_estudiante) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El estudiante no está matriculado en ese grupo.';
  END IF;
END$$

CREATE TRIGGER trg_asistencia_registrador_es_profesor
BEFORE INSERT ON asistencia
FOR EACH ROW
BEGIN
  DECLARE v_prof INT UNSIGNED;
  SELECT id_profesor INTO v_prof FROM grupos WHERE id_grupo = NEW.id_grupo;
  IF v_prof IS NULL OR v_prof <> NEW.registrado_por THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo el profesor del grupo puede registrar asistencia.';
  END IF;
END$$

-- Horas: el horario DEBE pertenecer al grupo y el profesor DEBE ser el del grupo.
CREATE TRIGGER trg_horas_horario_del_grupo
BEFORE INSERT ON horas_profesor
FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM horarios
                  WHERE id_horario = NEW.id_horario AND id_grupo = NEW.id_grupo) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El horario no pertenece al grupo indicado.';
  END IF;
END$$

CREATE TRIGGER trg_horas_profesor_del_grupo
BEFORE INSERT ON horas_profesor
FOR EACH ROW
BEGIN
  DECLARE v_prof INT UNSIGNED;
  SELECT id_profesor INTO v_prof FROM grupos WHERE id_grupo = NEW.id_grupo;
  IF v_prof IS NULL OR v_prof <> NEW.id_profesor THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Solo el profesor del grupo puede registrar horas en él.';
  END IF;
END$$

-- Notas: el estudiante DEBE estar matriculado en el grupo del examen.
CREATE TRIGGER trg_notas_estudiante_en_grupo
BEFORE INSERT ON notas
FOR EACH ROW
BEGIN
  DECLARE v_grupo INT UNSIGNED;
  SELECT id_grupo INTO v_grupo FROM examenes WHERE id_examen = NEW.id_examen;
  IF NOT EXISTS (SELECT 1 FROM grupos_estudiantes
                  WHERE id_grupo = v_grupo AND id_estudiante = NEW.id_estudiante) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El estudiante no pertenece al grupo del examen.';
  END IF;
END$$

-- Sesiones: el profesor DEBE ser el del grupo; el horario (si se indica) del grupo.
CREATE TRIGGER trg_sesion_profesor_del_grupo
BEFORE INSERT ON sesiones_clase
FOR EACH ROW
BEGIN
  DECLARE v_prof INT UNSIGNED;
  SELECT id_profesor INTO v_prof FROM grupos WHERE id_grupo = NEW.id_grupo;
  IF v_prof IS NULL OR v_prof <> NEW.id_profesor THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'La sesión debe dictarla el profesor del grupo.';
  END IF;
END$$

CREATE TRIGGER trg_sesion_horario_del_grupo
BEFORE INSERT ON sesiones_clase
FOR EACH ROW
BEGIN
  IF NEW.id_horario IS NOT NULL AND NOT EXISTS
     (SELECT 1 FROM horarios WHERE id_horario = NEW.id_horario AND id_grupo = NEW.id_grupo) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'El horario de la sesión no pertenece al grupo.';
  END IF;
END$$

DELIMITER ;

-- ---------------------------------------------------------------------
-- Vistas de apoyo (resúmenes que usa el perfil Administrativo)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_resumen_grupo AS
SELECT g.id_grupo, g.nombre AS grupo,
       COUNT(DISTINCT ge.id_estudiante) AS estudiantes,
       COUNT(DISTINCT s.id_sesion)      AS sesiones,
       COUNT(DISTINCT e.id_examen)      AS examenes
  FROM grupos g
  LEFT JOIN grupos_estudiantes ge ON ge.id_grupo = g.id_grupo
  LEFT JOIN sesiones_clase s      ON s.id_grupo = g.id_grupo
  LEFT JOIN examenes e            ON e.id_grupo = g.id_grupo
 GROUP BY g.id_grupo, g.nombre;

CREATE OR REPLACE VIEW v_horas_detalle AS
SELECT h.id_hora, h.fecha, h.horas,
       CONCAT(u.nombres, ' ', u.apellidos) AS profesor,
       g.nombre AS grupo, ho.dia_semana,
       ho.hora_inicio, ho.hora_fin
  FROM horas_profesor h
  JOIN usuarios u ON u.id_usuario = h.id_profesor
  JOIN grupos g   ON g.id_grupo = h.id_grupo
  JOIN horarios ho ON ho.id_horario = h.id_horario;
