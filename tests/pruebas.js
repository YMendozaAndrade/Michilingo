// Pruebas automatizadas - MichiLingo: usuarios, grupos, asistencia, horas y notas.
// Requisito: API Node.js en http://127.0.0.1:3000 e Iniciar.ps1 corriendo; BD con script_completo.sql.
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';

let aciertos = 0;
let fallas = 0;
const fracasos = [];

async function api(metodo, ruta, body, token) {
  const config = { method: metodo, headers: {} };
  if (body !== undefined) config.headers['Content-Type'] = 'application/json';
  if (token) config.headers['Authorization'] = 'Bearer ' + token;
  if (body !== undefined) config.body = JSON.stringify(body);
  const res = await fetch(BASE + '/api' + ruta, config);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function prueba(nombre, ok, detalle) {
  if (ok) { aciertos++; console.log('PASS  ' + nombre); }
  else { fallas++; fracasos.push(nombre); console.log('FAIL  ' + nombre + (detalle ? '  -> ' + detalle : '')); }
}

async function login(usuario, contrasena) { return api('POST', '/auth/login', { usuario, contrasena }); }

(async () => {
  // ---------- Autenticación de los tres perfiles ----------
  const admin = await login('admin', 'admin123');
  prueba('Login: Administrativo', admin.status === 200 && admin.data.usuario.roles.includes('Administrativo'), 'status=' + admin.status);
  const A = admin.data.token;
  const pro = await login('profe', 'profe123');
  prueba('Login: Profesor', pro.status === 200 && pro.data.usuario.roles.includes('Profesor'), 'status=' + pro.status);
  const P = pro.data.token;
  const est = await login('Lucia', 'est123');
  prueba('Login: Estudiante', est.status === 200 && est.data.usuario.roles.includes('Estudiante'), 'status=' + est.status);
  const E = est.data.token;

  const adminPerm = admin.data.usuario.permisos;
  const profePerm = pro.data.usuario.permisos;
  const estPerm = est.data.usuario.permisos;

  // Funcionalidades de cada perfil según el diseño
  const residAdmin = ['usuarios.ver','usuarios.crear','usuarios.editar','usuarios.eliminar','roles.ver','roles.gestionar','grupos.ver','grupos.gestionar','asistencia.ver','horas.ver','notas.ver','sesiones.ver'];
  prueba('Administrativo: usuarios + roles + consulta de resúmenes',
    residAdmin.every(p => adminPerm.includes(p)), JSON.stringify(adminPerm));
  prueba('Administrativo NO marca asistencia', !adminPerm.includes('asistencia.marcar'));
  prueba('Administrativo NO registra horas', !adminPerm.includes('horas.registrar'));
  prueba('Administrativo SÍ administra roles (autenticación)', adminPerm.includes('roles.ver') && adminPerm.includes('roles.gestionar'));

  const residProfe = ['grupos.ver','asistencia.ver','asistencia.marcar','horas.ver','horas.registrar','notas.ver','notas.gestionar','sesiones.ver','sesiones.gestionar'];
  prueba('Profesor: grupos + sesiones + asistencia + horas + notas',
    residProfe.every(p => profePerm.includes(p)) && !profePerm.includes('usuarios.crear'), JSON.stringify(profePerm));
  const residEst = ['grupos.ver','sesiones.ver','asistencia.ver','notas.ver'];
  prueba('Estudiante: solo lectura (+ sesiones)',
    residEst.every(p => estPerm.includes(p)) && !estPerm.includes('asistencia.marcar'), JSON.stringify(estPerm));

  // Catálogo completo: 16 permisos (usuarios 4 + roles 2 + grupos 2 + asistencia 2 + horas 2 + notas 2 + sesiones 2)
  const unidos = new Set([...adminPerm, ...profePerm, ...estPerm]);
  prueba('Funcionalidades asignadas: 16 permisos en uso', unidos.size === 16, 'union=' + unidos.size);

  const mal = await login('admin', 'clave_mala');
  prueba('Contraseña incorrecta rechazada', mal.status === 401, 'status=' + mal.status);
  prueba('Sin sesión no se listan usuarios', (await api('GET', '/usuarios')).status === 401);
  prueba('Administrativo SÍ lista roles y permisos (módulo autenticación)', (await api('GET', '/roles', undefined, A)).status === 200);

  // ---------- Usuarios por categorías (nombres/apellidos/correo obligatorios) ----------
  const usr = await api('POST', '/usuarios', { usuario: 'tmpusu', contrasena: 'clave123', nombres: 'Tmp', apellidos: 'Uno', correo: 'tmpusu@michilingo.edu.co', roles: ['Estudiante'], activo: true }, A);
  prueba('Crear usuario en categoría Estudiante', usr.status === 201, 'status=' + usr.status);
  const idUsr = usr.data.id_usuario;
  prueba('Usuario duplicado rechazado', (await api('POST', '/usuarios', { usuario: 'tmpusu', contrasena: 'clave123', nombres: 'Tmp', apellidos: 'Dos', correo: 'tmpusu2@michilingo.edu.co', roles: ['Estudiante'] }, A)).status === 409);
  prueba('Correo duplicado rechazado', (await api('POST', '/usuarios', { usuario: 'tmpusu3', contrasena: 'clave123', nombres: 'Tmp', apellidos: 'Tres', correo: 'tmpusu@michilingo.edu.co', roles: ['Estudiante'] }, A)).status === 409);
  prueba('Sin correo rechazado (integridad NOT NULL)', (await api('POST', '/usuarios', { usuario: 'sincorreo', contrasena: 'clave123', nombres: 'Sin', apellidos: 'Correo', roles: ['Estudiante'] }, A)).status === 400);
  prueba('Editar usuario (usuario y perfil)',
    (await api('PUT', '/usuarios/' + idUsr, { nombre_usuario: 'tmpusu2', roles: ['Profesor'] }, A)).status === 200);
  prueba('No se puede desactivar el propio usuario', (await api('DELETE', '/usuarios/' + admin.data.usuario.id_usuario, undefined, A)).status === 400);
  const estProfe = await api('POST', '/usuarios', { usuario: 'tmpprofe', contrasena: 'clave123', nombres: 'Tmp', apellidos: 'Profe', correo: 'tmpprofe@michilingo.edu.co', roles: ['Profesor'] }, A);
  const idPProfe = estProfe.data.id_usuario;
  const listaUsuarios = await api('GET', '/usuarios', undefined, A);
  const idProfe1 = listaUsuarios.data.find(u => u.nombre_usuario === 'profe').id_usuario;
  const idEst1 = listaUsuarios.data.find(u => u.nombre_usuario === 'Lucia').id_usuario;

  prueba('Profesor no puede crear usuarios', (await api('POST', '/usuarios', { usuario: 'x', contrasena: 'clave123', nombres: 'X', apellidos: 'Y', correo: 'x@michilingo.edu.co', roles: ['Profesor'] }, P)).status === 403);
  prueba('Estudiante no puede crear usuarios', (await api('POST', '/usuarios', { usuario: 'x', contrasena: 'clave123', nombres: 'X', apellidos: 'Y', correo: 'x2@michilingo.edu.co', roles: ['Profesor'] }, E)).status === 403);

  // ---------- Roles y permisos (módulo autenticación) ----------
  const rolesLis = await api('GET', '/roles', undefined, A);
  prueba('Administrativo evidencia roles con permisos por acción', rolesLis.status === 200 && Array.isArray(rolesLis.data) && rolesLis.data.length >= 3, 'status=' + rolesLis.status);
  prueba('Profesor no gestiona roles', (await api('GET', '/roles', undefined, P)).status === 403);
  prueba('Estudiante no ve roles', (await api('GET', '/roles', undefined, E)).status === 403);

  // ---------- Grupos ----------
  const gSeed = await api('GET', '/grupos', undefined, A);
  prueba('Administrativo ve los grupos iniciales (A1 y B1)', gSeed.status === 200 && gSeed.data.length === 2, 'status=' + gSeed.status);
  const gEst = await api('GET', '/grupos', undefined, E);
  prueba('Estudiante solo ve su grupo', gEst.status === 200 && gEst.data.length === 1 && gEst.data[0].nombre === 'Inglés A1 - Grupo 1', 'status=' + gEst.status);

  const grp = await api('POST', '/grupos', {
    nombre: 'TmpGrupo',
    id_profesor: idProfe1,
    horarios: [{ dia_semana: 'Viernes', hora_inicio: '19:00', hora_fin: '21:00' }],
    estudiantes: [idUsr, idEst1]
  }, A);
  prueba('Crear grupo con horarios y estudiantes', grp.status === 201, 'status=' + grp.status);
  const idGrupo = grp.data.id_grupo;

  const grpDet = await api('GET', '/grupos', undefined, P).then(r => r.data.find(x => x.id_grupo === idGrupo));
  const idHorario = grpDet && grpDet.horarios[0] ? grpDet.horarios[0].id_horario : null;
  prueba('El grupo nuevo tiene horario', idHorario != null, 'idHorario=' + idHorario);
  prueba('Editar grupo', (await api('PUT', '/grupos/' + idGrupo, { nombre: 'TmpGrupoEditado', horarios: grpDet.horarios, estudiantes: [idUsr, idEst1] }, A)).status === 200);
  const grpDet2 = await api('GET', '/grupos', undefined, P).then(r => r.data.find(x => x.id_grupo === idGrupo));
  const idHorario2 = grpDet2 && grpDet2.horarios[0] ? grpDet2.horarios[0].id_horario : null;
  prueba('Horario vigente tras editar el grupo', idHorario2 != null, 'idHorario2=' + idHorario2);
  prueba('Grupo sin profesor rechazado (FK obligatoria)', (await api('POST', '/grupos', { nombre: 'SinProfe', horarios: [] }, A)).status === 400);
  prueba('Estudiante no crea grupos', (await api('POST', '/grupos', { nombre: 'X', id_profesor: idProfe1, horarios: [] }, E)).status === 403);
  prueba('Profesor no gestiona grupos', (await api('PUT', '/grupos/' + idGrupo, { nombre: 'TmpGrupoEditado2', horarios: [] }, P)).status === 403);

  // ---------- Sesiones de clase (Temas vistos) ----------
  const sesNueva = await api('POST', '/sesiones', { id_grupo: idGrupo, fecha: '2026-09-15', tema: 'Saludos y presentaciones', descripcion: 'Saludos formales', id_horario: idHorario2 }, P);
  prueba('Profesor crea sesión de clase (tema visto)', sesNueva.status === 201, 'status=' + sesNueva.status);
  const idSesion = sesNueva.data.id_sesion;
  prueba('Sesión sin tema rechazada', (await api('POST', '/sesiones', { id_grupo: idGrupo, fecha: '2026-09-16' }, P)).status === 400);
  prueba('Profesor lista sesiones del grupo', (await api('GET', '/sesiones?grupo=' + idGrupo, undefined, P)).status === 200);
  prueba('Administrativo ve sesiones del grupo', (await api('GET', '/sesiones?grupo=' + idGrupo, undefined, A)).status === 200);
  prueba('Estudiante no crea sesiones', (await api('POST', '/sesiones', { id_grupo: idGrupo, fecha: '2026-09-16', tema: 'X' }, E)).status === 403);

  // ---------- Asistencia ----------
  const asG = await api('GET', '/asistencia?grupo=' + idGrupo + '&fecha=2026-09-14', undefined, P);
  prueba('Profesor carga la asistencia del grupo', asG.status === 200 && asG.data.estudiantes.length === 2, 'status=' + asG.status);
  const marcado = await api('POST', '/asistencia', {
    id_grupo: idGrupo, fecha: '2026-09-14',
    registros: [{ id_estudiante: idUsr, estado: 'Ausente' }, { id_estudiante: idEst1, estado: 'Presente' }]
  }, P);
  prueba('Profesor marca asistencia, faltas y excusas', marcado.status === 200, 'status=' + marcado.status);
  const asG2 = await api('GET', '/asistencia?grupo=' + idGrupo + '&fecha=2026-09-14', undefined, P);
  const estados = asG2.data.estudiantes.map(e => e.estado).sort();
  prueba('La asistencia quedó registrada', JSON.stringify(estados) === JSON.stringify(['Ausente','Presente']), JSON.stringify(estados));
  prueba('Administrativo ve la grilla del grupo', (await api('GET', '/asistencia?grupo=' + idGrupo + '&fecha=2026-09-14', undefined, A)).status === 200);
  prueba('Administrativo NO marca asistencia', (await api('POST', '/asistencia', { id_grupo: idGrupo, fecha: '2026-09-14', registros: [{ id_estudiante: idEst1, estado: 'Presente' }] }, A)).status === 403);
  prueba('Estudiante consulta su asistencia', (await api('GET', '/asistencia/mi', undefined, E)).status === 200);
  prueba('Estudiante no ve la grilla de otro', (await api('GET', '/asistencia?grupo=' + idGrupo + '&fecha=2026-09-14', undefined, E)).status === 403);
  prueba('Estudiante no marca asistencia', (await api('POST', '/asistencia', { id_grupo: idGrupo, fecha: '2026-09-14', registros: [{ id_estudiante: idEst1, estado: 'Presente' }] }, E)).status === 403);

  // ---------- Notas de exámenes ----------
  const exNuevo = await api('POST', '/examenes', { id_grupo: idGrupo, nombre: 'Quiz 1 (vocabulario)', fecha: '2026-10-05' }, P);
  prueba('Profesor crea examen (tema)', exNuevo.status === 201, 'status=' + exNuevo.status);
  const idExamen = exNuevo.data.id_examen;
  prueba('Profesor edita el examen', (await api('PUT', '/examenes/' + idExamen, { nombre: 'Quiz 1 (vocabulario)', fecha: '2026-10-05' }, P)).status === 200);
  const notasOk = await api('POST', '/examenes/notas', { id_examen: idExamen, notas: [{ id_estudiante: idUsr, calificacion: 2.0 }, { id_estudiante: idEst1, calificacion: 4.5 }] }, P);
  prueba('Profesor sube notas de 0.0 a 5.0', notasOk.status === 200, 'status=' + notasOk.status);
  prueba('Nota fuera de rango rechazada', (await api('POST', '/examenes/notas', { id_examen: idExamen, notas: [{ id_estudiante: idEst1, calificacion: 6 }] }, P)).status === 400);
  const exLis = await api('GET', '/examenes?grupo=' + idGrupo, undefined, P);
  prueba('Profesor lista los exámenes con sus notas', exLis.status === 200 && exLis.data.examenes[0].notas.length === 2, 'status=' + exLis.status);
  prueba('Administrativo ve los exámenes del grupo', (await api('GET', '/examenes?grupo=' + idGrupo, undefined, A)).status === 200);
  const misNotas = await api('GET', '/examenes/mis', undefined, E);
  prueba('Estudiante consulta sus notas', misNotas.status === 200 && misNotas.data.some(n => Number(n.calificacion) === 4.5), 'status=' + misNotas.status);
  prueba('Estudiante no ve las notas del grupo completo', (await api('GET', '/examenes?grupo=' + idGrupo, undefined, E)).status === 403);
  prueba('Estudiante no crea exámenes', (await api('POST', '/examenes', { id_grupo: idGrupo, nombre: 'X', fecha: '2026-10-06' }, E)).status === 403);
  prueba('Examen sin fecha rechazado (NOT NULL)', (await api('POST', '/examenes', { id_grupo: idGrupo, nombre: 'SinFecha' }, P)).status === 400);

  // ---------- Resumen del Administrativo (incluye sesiones/temas) ----------
  const resGrupo = await api('GET', '/resumen/grupo/' + idGrupo, undefined, A);
  prueba('Resumen por grupo (asistencia + sesiones + temas + notas)',
    resGrupo.status === 200 && resGrupo.data.estudiantes.length === 2 && resGrupo.data.examenes.length === 1 && Array.isArray(resGrupo.data.sesiones),
    'status=' + resGrupo.status);
  prueba('El resumen por grupo evidencia sesiones de clase', resGrupo.data.sesiones.length >= 1, 'sesiones=' + resGrupo.data.sesiones.length);
  prueba('El resumen por grupo tiene promedio de notas', Number(resGrupo.data.examenes[0].promedio) > 0, JSON.stringify(resGrupo.data.examenes[0]));
  const resEst = await api('GET', '/resumen/estudiante/' + idEst1, undefined, A);
  prueba('Resumen por estudiante (asistencia y notas)',
    resEst.status === 200 && resEst.data.asistencia.presente >= 1 && resEst.data.notas.some(n => Number(n.calificacion) === 4.5),
    'status=' + resEst.status);
  prueba('Estudiante no genera resúmenes ajenos', (await api('GET', '/resumen/estudiante/' + idEst1, undefined, E)).status === 403);

  // ---------- Horas trabajadas ----------
  const horasOk = await api('POST', '/horas', { id_grupo: idGrupo, id_horario: idHorario2, fecha: '2026-09-14' }, P);
  prueba('Profesor registra horas con grupo y horario (horas calculadas del horario)', horasOk.status === 201 && Number(horasOk.data.horas) === 2, 'status=' + horasOk.status);
  const horasAdmin = await api('GET', '/horas', undefined, A);
  prueba('Administrativo ve el resumen de horas (todas)', horasAdmin.status === 200 && horasAdmin.data.some(h => h.grupo === 'TmpGrupoEditado'), 'status=' + horasAdmin.status);
  prueba('Administrativo NO registra horas', (await api('POST', '/horas', { id_grupo: idGrupo, id_horario: idHorario2, fecha: '2026-09-14', horas: 2 }, A)).status === 403);
  prueba('Estudiante no ve horas', (await api('GET', '/horas', undefined, E)).status === 403);
  const idHora = horasAdmin.data.find(h => h.grupo === 'TmpGrupoEditado').id_hora;
  prueba('Profesor elimina su registro', (await api('DELETE', '/horas/' + idHora, undefined, P)).status === 200);

  // ---------- Limpieza ----------
  prueba('Eliminar sesión de prueba', (await api('DELETE', '/sesiones/' + idSesion, undefined, P)).status === 200);
  prueba('Eliminar examen de prueba', (await api('DELETE', '/examenes/' + idExamen, undefined, P)).status === 200);
  prueba('Eliminar grupo de prueba', (await api('DELETE', '/grupos/' + idGrupo, undefined, A)).status === 200);
  prueba('Desactivar usuarios de prueba', (await api('DELETE', '/usuarios/' + idUsr, undefined, A)).status === 200 && (await api('DELETE', '/usuarios/' + idPProfe, undefined, A)).status === 200);
  const tmpDesact = await login('tmpusu2', 'clave123');
  prueba('Usuario desactivado no inicia sesión (fuera de Redis -> 401)', tmpDesact.status === 401, 'status=' + tmpDesact.status);

  // ---------- Cierre de sesión (limpia las llaves michilingo:ses:* en Redis) ----------
  prueba('Logout Administrativo borra su sesión', (await api('POST', '/auth/logout', undefined, A)).status === 200);
  prueba('Logout Profesor borra su sesión', (await api('POST', '/auth/logout', undefined, P)).status === 200);
  prueba('Logout Estudiante borra su sesión', (await api('POST', '/auth/logout', undefined, E)).status === 200);

  // ---------- Rate limiting ----------
  let ultimo = null;
  for (let i = 0; i < 6; i++) ultimo = await login('travieso', 'incorrecta');
  prueba('Login bloqueado tras 5 intentos fallidos', ultimo.status === 429, 'status=' + ultimo.status);

  console.log(`\n====== ${aciertos}/${aciertos + fallas} pruebas superadas ======`);
  if (fallas > 0) {
    console.log('Fallaron:');
    for (const f of fracasos) console.log('  - ' + f);
  }
  process.exitCode = fallas > 0 ? 1 : 0;
})();