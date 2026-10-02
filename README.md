# MichiLingo - Administración de usuarios

Sistema de **administración de usuarios por categorías** (Administrativo, Profesor, Estudiante) con los
módulos académicos de **grupos, sesiones de clase (temas vistos), asistencia (presentes/faltas/excusas),
notas de exámenes y horas trabajadas del profesor**.
Stack: base de datos **MySQL** + API **Node.js (Express)** + FrontEnd **HTML/CSS/JS**.

## Estructura
```
database/scripts/01_DDL.sql            SOLO estructura (tablas + CHECK/UNIQUE/NOT NULL/FK)
database/scripts/02_DML.sql            SOLO datos (permisos, roles, usuarios, grupos, sesiones, etc.)
database/scripts/03_Triggers_Vistas.sql Triggers de integridad + vistas (requiere root)
database/scripts/script_completo.sql    Todo junto (01+02+03) para carga rápida
backend/node/                          API REST + autenticación (puerto 3000)
frontend/                              Página de login y panel de administración
tests/pruebas.js                       Suite automatizada (72 pruebas)
Iniciar.ps1                            Arranca MySQL y la API, y abre el navegador
```

## Qué ve cada perfil (cada opción exige su permiso de acción)
- **Administrativo**
  - **Usuarios**: 3 cajas (Administrativos, Profesores, Estudiantes). Al entrar en cada caja puede
    agregar, editar y desactivar usuarios de esa categoría (permisos `usuarios.ver/crear/editar/eliminar`).
  - **Roles y permisos**: administra el módulo de autenticación (`roles.ver/gestionar`): qué permiso abre
    cada opción del menú, usuarios por rol y último acceso.
  - **Grupos**: administra los grupos (`grupos.ver/gestionar`, profesor obligatorio).
  - **Sesiones (Temas)**: consulta las sesiones de clase dictadas (`sesiones.ver`).
  - **Asistencia**: resumen por grupo o por estudiante (asistencia + sesiones + exámenes/notas). No marca.
  - **Horas trabajadas**: resumen de horas de los profesores (no registra).
- **Profesor** (entra directo a sus grupos)
  - **Grupos**: consulta los grupos que le pertenecen.
  - **Sesiones**: crea/edita/elimina sesiones de clase con fecha + tema (`sesiones.ver/gestionar`).
  - **Asistencia**: marca asistencia con 3 cuadros de color (Presente verde, Ausente rojo, Excusado amarillo).
  - **Notas**: crea exámenes (fecha obligatoria), sube notas de 0.0 a 5.0 y las edita.
  - **Horas trabajadas**: elige solo grupo y horario; la cantidad de horas se calcula del intervalo del
    horario (p. ej. una clase de 18:00 a 20:00 = 2 horas). Muestra un cuadro con las horas trabajadas en el mes.
- **Estudiante** (solo lectura)
  - **Grupos**: solo ve el grupo al que pertenece.
  - **Sesiones**: ve los temas vistos en su grupo.
  - **Asistencia**: resumen de su asistencia (presentes, ausencias, excusas).
  - **Notas**: consulta sus notas de exámenes. En verde si aprueba (≥ 3.5), en rojo si está por debajo.

## Cómo ponerlo en marcha
1. Crear la base de datos con `root` (destructivo: elimina y recrea `academia_idiomas`).
   En `cmd` (no PowerShell, para respetar tildes/UTF8):
   ```cmd
   "C:\Program Files\MySQL\MySQL Server 9.5\bin\mysql.exe" -u root -p < database\scripts\01_DDL.sql
   "C:\Program Files\MySQL\MySQL Server 9.5\bin\mysql.exe" -u root -p academia_idiomas < database\scripts\02_DML.sql
   "C:\Program Files\MySQL\MySQL Server 9.5\bin\mysql.exe" -u root -p academia_idiomas < database\scripts\03_Triggers_Vistas.sql
   ```
   Atajo: `script_completo.sql` = 01+02+03 en un solo archivo.
   Nota: `03_Triggers_Vistas.sql` requiere privilegio SUPER/root (`log_bin_trust_function_creators`).
2. Arrancar API y abrir el navegador:
   ```powershell
   powershell -ExecutionPolicy Bypass -File Iniciar.ps1
   ```
3. Entrar a http://localhost:3000/index.html

> Credenciales de conexión a BD en `backend/node/.env` (usuario de aplicación `Yessica`).
> El usuario `root` solo se usa para cargar el script y mantenimiento.

## Usuarios de prueba
| Usuario | Contraseña | Perfil | Funcionalidades |
|---|---|---|---|
| `admin` | `admin123` | Administrativo | Usuarios, grupos y consulta de resúmenes (asistencia, temas/notas, horas) |
| `profe` | `profe123` | Profesor | Sus grupos, marcar asistencia, subir notas y registrar horas |
| `Lucia` | `est123` | Estudiante | Su grupo (A1), su asistencia y sus notas (solo lectura) |
| `julian` | (la que usaste al crearlo) | Estudiante | Su grupo (Ingles B1), su asistencia y sus notas (solo lectura) |

Datos de ejemplo: grupo "Inglés A1 - Grupo 1" (profesor `profe`, horarios lunes/miércoles 18:00–20:00) con la
estudiante `Lucia` y el examen "Examen parcial 1" con nota 4.0. Además el grupo "Ingles B1" (profesor `profe`,
sábado 08:00–12:00) con el estudiante `julian`, que ya tiene su asistencia ("Presente"/"Excusa" del 2026-09-14),
horas registradas del profesor y el examen "examen A1" con nota 3.5, útil para probar que al cambiar de grupo
se actualizan la asistencia y las notas.

## Base de datos (correcciones del docente aplicadas)
Tablas: `usuarios`, `roles`, `permisos`, `roles_permisos`, `usuarios_roles`, `grupos`, `horarios`,
`grupos_estudiantes`, `sesiones_clase`, `asistencia`, `horas_profesor`, `examenes`, `notas`.
16 permisos por funcionalidad + acción; cada perfil tiene exactamente los suyos:
- Administrativo (12): usuarios.ver/crear/editar/eliminar, roles.ver/gestionar, grupos.ver/gestionar, asistencia.ver, horas.ver, notas.ver, sesiones.ver.
- Profesor (9): grupos.ver, sesiones.ver/gestionar, asistencia.ver/marcar, horas.ver/registrar, notas.ver/gestionar.
- Estudiante (4): grupos.ver, sesiones.ver, asistencia.ver, notas.ver.

Integridad:
- FK obligatorias (`NOT NULL`): grupo siempre con profesor, asistencia/horas/sesiones siempre con grupo+profesor+horario válidos (antes opcionales).
- `NOT NULL` + `DEFAULT` + `CHECK` + `UNIQUE` funcionales: correo único con formato, nombres/apellidos obligatorios, nota 0-5, horas 0-12, `hora_fin > hora_inicio`, examen `(id_grupo,nombre)` único, asistencia/hora/sesión anti-duplicados.
- Triggers (`03_Triggers_Vistas.sql`): estudiante matriculado en asistencia/notas, horario del mismo grupo en horas/sesiones, solo el profesor del grupo registra.
- Vistas: `v_resumen_grupo`, `v_horas_detalle`.

## Seguridad
- Contraseñas con `crypto.scrypt` y salt (compatible con hashes SHA-256 de los datos iniciales).
- Rate limiting en el login (5 intentos fallidos cada 15 min → 429).
- Cada funcionalidad exige su permiso y además se respeta el alcance por rol: el Profesor solo ve su
  grupo y sus horas; el Estudiante solo lectura; el Administrativo no marca asistencia ni registra horas.

## Autenticación en dos servidores (parcial Redis)
- **Redis (credenciales):** `michilingo:cred:{usuario}` → `{ id_usuario, contrasena(hash) }`. Solo usuarios **activos**.
  El login valida usuario+contraseña **en Redis, no en MySQL** (con el mismo `scrypt`/SHA2).
- **MySQL (autorización):** roles, permisos y menú se siguen pintando desde la relacional.
- **Sync automático:** crear → `HSET`; cambiar clave (admin o autoservicio) → `HSET`; desactivar → `DEL`;
  reactivar → `HSET`; renombrar → `DEL` vieja + `HSET` nueva.
- Levantar Redis (WSL): `wsl -e sh -c "redis-server --daemonize yes"` (o `Iniciar.ps1`, que ya lo hace).
  Migración inicial: `node backend/node/scripts/migrar_redis.js`. Evidencia: `redis-cli KEYS 'michilingo:cred:*'`, `HGETALL 'michilingo:cred:admin'`.
  `REDIS_URL` en `backend/node/.env` (defecto `redis://127.0.0.1:6379`).

## Pruebas automatizadas
Con la API corriendo, desde la raíz del proyecto:
```powershell
node tests/pruebas.js
```
La suite (72 pruebas) verifica login de los tres perfiles, 16 permisos por acción, módulo
Roles/Permisos (autenticación), creación de usuarios con integridad (correo único/obligatorio),
grupos con profesor obligatorio, sesiones de clase (temas), asistencia, exámenes con fecha
obligatoria y notas 0.0-5.0, resúmenes con sesiones, horas y rate limiting.