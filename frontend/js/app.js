const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

let usuario = null;
let categoriaActiva = 'Administrativo';
let gruposCache = [];
let usuariosCache = [];
let notasGrupo = null;
let notasEstudiantes = [];

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const CATEGORIAS = [
  { rol: 'Administrativo', icono: '👩‍💼', desc: 'Administración de usuarios y consulta de resúmenes' },
  { rol: 'Profesor', icono: '👨‍🏫', desc: 'Marca asistencia, registra horas y sube notas' },
  { rol: 'Estudiante', icono: '🎓', desc: 'Consulta su grupo, su asistencia y sus notas' }
];
const NOTA_MINIMA = 3.5;

function esAdmin() { return (usuario.roles || []).includes('Administrativo'); }
function esProfe() { return (usuario.roles || []).includes('Profesor'); }
function esEstudianteSolo() { return (usuario.roles || []).includes('Estudiante') && !esAdmin() && !esProfe(); }

function escaparHTML(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}
const txt = escaparHTML;

function hoyISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function fmtFecha(f) {
  if (!f) return '—';
  const d = new Date(f);
  if (isNaN(d.getTime())) return f;
  return d.toLocaleDateString('es-ES');
}

function estadoActivo(v) {
  return v ? '<span class="modo modo-ok">Activo</span>' : '<span class="modo modo-error">Inactivo</span>';
}

function chipAsistencia(e) {
  if (e === 'Presente') return '<span class="modo modo-ok">Presente</span>';
  if (e === 'Ausente') return '<span class="modo modo-error">Ausente</span>';
  if (e === 'Excusa') return '<span class="modo modo-advertencia">Excusado</span>';
  return '—';
}

function notaHTML(c) {
  if (c == null) return '—';
  return '<span class="' + (Number(c) >= NOTA_MINIMA ? 'nota-buena' : 'nota-mala') + '">' + txt(Number(c).toFixed(1)) + '</span>';
}

// ---------------------------------------------------------------------
// Inicialización
// ---------------------------------------------------------------------
async function init() {
  if (!getToken()) { location.href = 'index.html'; return; }
  try {
    const data = await apiRequest('/auth/me');
    usuario = data.usuario;
  } catch (e) {
    if (getToken()) cerrarSesion();
    return;
  }
  $('usuarioActual').textContent = '👤 ' + (usuario.nombre_usuario || 'usuario');
  $('panelEtiqueta').textContent = esAdmin() ? 'Perfil Administrativo' : esProfe() ? 'Perfil Profesor' : 'Perfil Estudiante';
  $('barraNombre').textContent = usuario.nombre_usuario || 'usuario';
  $('barraRol').textContent = (usuario.roles || []).join(' · ') || 'sin rol';
  $('barraAvatar').textContent = (usuario.nombre_usuario || '?').trim().charAt(0).toUpperCase();
  construirMenu();

  $('btnCerrarSesion').addEventListener('click', cerrarSesion);
  $('btnNuevoUsuario').addEventListener('click', () => abrirModalUsuario(null));
  $('btnVolverCategorias').addEventListener('click', volverCategorias);
  $('btnCerrarModal').addEventListener('click', cerrarModalUsuario);
  $('btnCancelarModal').addEventListener('click', cerrarModalUsuario);
  $('formUsuario').addEventListener('submit', guardarUsuario);

  $('btnNuevoGrupo').addEventListener('click', () => abrirModalGrupo(null));
  $('btnCerrarModalGrupo').addEventListener('click', cerrarModalGrupo);
  $('btnCancelarModalGrupo').addEventListener('click', cerrarModalGrupo);
  $('formGrupo').addEventListener('submit', guardarGrupo);
  $('btnAgregarHorario').addEventListener('click', () => agregarFilaHorario(null));

  $('btnCerrarModalExamen').addEventListener('click', cerrarModalExamen);
  $('btnCancelarModalExamen').addEventListener('click', cerrarModalExamen);
  $('formExamen').addEventListener('submit', guardarExamen);

  $('btnCerrarModalSesion').addEventListener('click', cerrarModalSesion);
  $('btnCancelarModalSesion').addEventListener('click', cerrarModalSesion);
  $('formSesion').addEventListener('submit', guardarSesion);

  $('btnCerrarModalRol').addEventListener('click', cerrarModalRol);
  $('btnCancelarModalRol').addEventListener('click', cerrarModalRol);
  $('formRol').addEventListener('submit', guardarRol);

  const destino = esAdmin() ? 'usuarios' : esProfe() ? 'grupos' : 'asistencia';
  mostrarSeccion(destino);
}

function construirMenu() {
  const nav = $('menuNav');
  nav.innerHTML = '';

  // Cada opción del menú exige su permiso de ACCIÓN (ver). La evidencia
  // detallada está en cada sección (barra 🔑) + Roles y Mi perfil.
  const items = [
    { clave: 'usuarios', permiso: 'usuarios.ver', etiqueta: '👥 Usuarios' },
    { clave: 'roles', permiso: 'roles.ver', etiqueta: '🔐 Roles y permisos' },
    { clave: 'grupos', permiso: 'grupos.ver', etiqueta: '🏫 Grupos' },
    { clave: 'sesiones', permiso: 'sesiones.ver', etiqueta: '📚 Sesiones' },
    { clave: 'asistencia', permiso: 'asistencia.ver', etiqueta: '✅ Asistencia' },
    { clave: 'horas', permiso: 'horas.ver', etiqueta: '⏰ Horas' },
    { clave: 'notas', etiqueta: '📝 Notas',
      condicion: () => usuario.permisos.includes('notas.ver') && (esProfe() || esEstudianteSolo() || esAdmin()) },
    { clave: 'perfil', etiqueta: '👤 Mi perfil' }
  ];

  for (const it of items) {
    if (it.permiso && !usuario.permisos.includes(it.permiso)) continue;
    if (it.condicion && !it.condicion()) continue;
    const b = document.createElement('button');
    b.dataset.seccion = it.clave;
    b.innerHTML = `<span class="menu-etiqueta">${txt(it.etiqueta)}</span>`;
    b.addEventListener('click', () => mostrarSeccion(it.clave));
    nav.appendChild(b);
  }
}

const PERMISOS_POR_MODULO = {
  Usuarios: ['usuarios.ver', 'usuarios.crear', 'usuarios.editar', 'usuarios.eliminar'],
  Roles: ['roles.ver', 'roles.gestionar'],
  Grupos: ['grupos.ver', 'grupos.gestionar'],
  Sesiones: ['sesiones.ver', 'sesiones.gestionar'],
  Asistencia: ['asistencia.ver', 'asistencia.marcar'],
  Horas: ['horas.ver', 'horas.registrar'],
  Notas: ['notas.ver', 'notas.gestionar']
};

function chipPermiso(nombre, tengo) {
  const accion = nombre.split('.')[1] || nombre;
  return `<span class="perm ${tengo ? 'ok' : 'no'}" title="${tengo ? 'Concedido: ' + nombre : 'No concedido: ' + nombre}">${tengo ? '✓ ' : ''}${txt(accion)}</span>`;
}

function barraPermisos(lista) {
  const tengo = (p) => usuario.permisos.includes(p);
  const concedidos = lista.filter(tengo).length;
  return `<div class="aviso-auto">🔑 Permisos en este módulo (${concedidos}/${lista.length})<div class="perms">` +
    lista.map(p => chipPermiso(p, tengo(p))).join('') + `</div></div>`;
}

function resumenPermisosPerfil() {
  return `<div class="perm-resumen">` + Object.keys(PERMISOS_POR_MODULO).map(mod => {
    const lista = PERMISOS_POR_MODULO[mod];
    const n = lista.filter(p => (usuario.permisos || []).includes(p)).length;
    return `<div class="perm-grupo"><h4>${txt(mod)} · ${n}/${lista.length}</h4><div class="perms">` +
      lista.map(p => chipPermiso(p, (usuario.permisos || []).includes(p))).join('') + `</div></div>`;
  }).join('') + `</div>`;
}

function mostrarSeccion(clave) {
  const secciones = ['usuarios', 'roles', 'grupos', 'sesiones', 'asistencia', 'horas', 'notas', 'perfil'];
  secciones.forEach(s => $('seccion-' + s).classList.add('hidden'));
  $$('#menuNav button').forEach(b => b.classList.toggle('activo', b.dataset.seccion === clave));
  $('seccion-' + clave).classList.remove('hidden');

  const titulos = {
    usuarios: 'Administración de usuarios',
    roles: 'Roles y permisos (autenticación)',
    grupos: 'Grupos académicos',
    sesiones: 'Sesiones de clase (Temas)',
    asistencia: 'Asistencia de estudiantes',
    horas: 'Horas trabajadas',
    notas: 'Notas de exámenes',
    perfil: 'Mi perfil'
  };
  $('tituloSeccion').textContent = titulos[clave] || 'Panel';

  if (clave === 'usuarios') cargarCategorias();
  if (clave === 'roles') loadRoles();
  if (clave === 'grupos') loadGrupos();
  if (clave === 'sesiones') loadSesiones();
  if (clave === 'asistencia') loadAsistencia();
  if (clave === 'horas') loadHoras();
  if (clave === 'notas') loadNotas();
  if (clave === 'perfil') loadPerfil();
}

// ---------------------------------------------------------------------
// USUARIOS: 3 categorías (Administrativo / Profesores / Estudiantes)
// ---------------------------------------------------------------------
async function cargarCategorias() {
  const cont = $('contenedorCategorias');
  cont.innerHTML = '<p>Cargando…</p>';
  $('vistaCategorias').classList.remove('hidden');
  $('vistaLista').classList.add('hidden');
  try {
    const usuarios = await apiRequest('/usuarios');
    usuariosCache = usuarios;
    const esDeCategoria = (u, cat) => (u.roles || []).some(r => r.nombre === cat || String(r.nombre).startsWith(cat + ' ['));
    const conteos = {};
    for (const cat of CATEGORIAS) {
      conteos[cat.rol] = usuarios.filter(u => esDeCategoria(u, cat.rol) && u.activo).length;
    }
    cont.innerHTML = '';
    for (const cat of CATEGORIAS) {
      const card = document.createElement('div');
      card.className = 'cat-card cat-' + cat.rol.toLowerCase() + 's';
      card.innerHTML = `
        <div class="cat-avatar">${cat.icono}</div>
        <b>${txt(cat.rol)}s</b>
        <p>${txt(cat.desc)}</p>
        <div class="cat-contador">${conteos[cat.rol] || 0}</div>`;
      card.addEventListener('click', () => abrirCategoria(cat.rol));
      cont.appendChild(card);
    }
  } catch (e) {
    cont.innerHTML = `<p class="error">${txt(e.message)}</p>`;
  }
}

function abrirCategoria(categoria) {
  categoriaActiva = categoria;
  $('vistaCategorias').classList.add('hidden');
  $('vistaLista').classList.remove('hidden');
  $('tituloListaUsuarios').textContent = 'Usuarios — ' + categoria + 's';
  $('btnNuevoUsuario').textContent = '+ Nuevo ' + categoria.toLowerCase();
  loadUsuarios(categoria);
}

function volverCategorias() {
  cargarCategorias();
}

async function loadUsuarios(categoria) {
  const tbody = $('tablaUsuarios');
  tbody.innerHTML = '<tr><td colspan="7">Cargando…</td></tr>';
  const puedeEditar = usuario.permisos.includes('usuarios.editar');
  const puedeEliminar = usuario.permisos.includes('usuarios.eliminar');
  try {
    if (usuariosCache.length === 0) usuariosCache = await apiRequest('/usuarios');
    const esDeCategoria = (u) => (u.roles || []).some(r => r.nombre === categoria || String(r.nombre).startsWith(categoria + ' ['));
    const lista = usuariosCache.filter(esDeCategoria);
    if (lista.length === 0) { tbody.innerHTML = '<tr><td colspan="7">No hay usuarios en esta categoría.</td></tr>'; return; }

    tbody.innerHTML = '';
    for (const u of lista) {
      const tr = document.createElement('tr');
      let acciones = '';
      if (puedeEditar) {
        acciones += `<button class="btn btn-secundario" data-accion="editar" data-id="${u.id_usuario}">Editar</button>`;
      }
      if (u.id_usuario !== usuario.id_usuario) {
        if (u.activo && puedeEliminar) {
          acciones += `<button class="btn btn-peligro" data-accion="desactivar" data-id="${u.id_usuario}">Desactivar</button>`;
        }
        if (!u.activo && puedeEditar) {
          acciones += `<button class="btn btn-exito" data-accion="reactivar" data-id="${u.id_usuario}">Reactivar</button>`;
        }
      }
      tr.innerHTML = `
        <td>${u.id_usuario}</td>
        <td><strong>${txt(u.nombre_usuario)}</strong></td>
        <td>${txt(u.nombres || '—')} ${txt(u.apellidos || '')}</td>
        <td>${txt(u.correo || '—')}</td>
        <td>${estadoActivo(u.activo)}</td>
        <td>${fmtFecha(u.ultimo_acceso)}</td>
        <td><div class="acciones">${acciones || '—'}</div></td>`;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll('[data-accion]').forEach(b => {
      b.addEventListener('click', async () => {
        const id = Number(b.dataset.id);
        if (b.dataset.accion === 'editar') abrirModalUsuario(lista.find(x => x.id_usuario === id));
        if (b.dataset.accion === 'desactivar') {
          if (!confirm('¿Desactivar este usuario? No podrá iniciar sesión.')) return;
          try { await apiRequest('/usuarios/' + id, 'DELETE'); usuariosCache = []; cargarCategorias(); }
          catch (e) { alert(e.message); }
        }
        if (b.dataset.accion === 'reactivar') {
          if (!confirm('¿Reactivar este usuario? Volverá a poder iniciar sesión.')) return;
          try { await apiRequest('/usuarios/' + id, 'PUT', { activo: true }); usuariosCache = []; cargarCategorias(); }
          catch (e) { alert(e.message); }
        }
      });
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7">${txt(e.message)}</td></tr>`;
  }
}

function abrirModalUsuario(u) {
  $('modalTitulo').textContent = u ? `Editar usuario #${u.id_usuario}` : 'Nuevo usuario';
  $('uCategoria').value = categoriaActiva;
  $('uId').value = u ? u.id_usuario : '';
  $('uNombres').value = u && u.nombres ? u.nombres : '';
  $('uApellidos').value = u && u.apellidos ? u.apellidos : '';
  $('uCorreo').value = u && u.correo ? u.correo : '';
  $('uUsuario').value = u ? u.nombre_usuario : '';
  $('uContrasena').value = '';
  $('uContrasena').placeholder = u ? 'Dejar vacío para no cambiar' : 'Contraseña (mín. 6)';
  $('uActivo').checked = u ? !!u.activo : true;
  $('modalError').classList.add('hidden');
  pintarPreviewPermisosPerfil(categoriaActiva, u);
  $('modalUsuario').classList.remove('hidden');
  // Si el usuario tiene rol personalizado "Base [usuario]", refleja sus
  // permisos reales desmarcando los que no tiene.
  if (u && u.roles && u.roles[0] && String(u.roles[0].nombre).includes('[')) {
    apiRequest('/roles').then(roles => {
      const rol = roles.find(r => r.nombre === u.roles[0].nombre);
      if (!rol) return;
      const tiene = new Set();
      for (const mod of Object.keys(rol.permisos || {})) {
        for (const p of rol.permisos[mod]) tiene.add(p.nombre);
      }
      document.querySelectorAll('#uPermisosPreview [data-perm]').forEach(b => {
        const on = tiene.has(b.dataset.perm);
        b.classList.toggle('ok', on);
        b.classList.toggle('no', !on);
        b.innerHTML = (on ? '✓ ' : '') + txt(b.dataset.perm.split('.')[1]);
      });
      const sel = permisosSeleccionados().length;
      const base = (PERMISOS_POR_PERFIL[categoriaActiva] || []).length;
      const t = $('permTitulo');
      if (t) t.innerHTML = `Permisos personalizados de <strong>${txt(u.nombre_usuario)}</strong>: <strong>${sel}/${base}</strong>`;
    }).catch(() => {});
  }
}

const PERMISOS_POR_PERFIL = {
  Administrativo: ['usuarios.ver', 'usuarios.crear', 'usuarios.editar', 'usuarios.eliminar',
    'roles.ver', 'roles.gestionar', 'grupos.ver', 'grupos.gestionar',
    'asistencia.ver', 'horas.ver', 'notas.ver', 'sesiones.ver'],
  Profesor: ['grupos.ver', 'sesiones.ver', 'sesiones.gestionar',
    'asistencia.ver', 'asistencia.marcar', 'horas.ver', 'horas.registrar',
    'notas.ver', 'notas.gestionar'],
  Estudiante: ['grupos.ver', 'sesiones.ver', 'asistencia.ver', 'notas.ver']
};

function pintarPreviewPermisosPerfil(categoria, u) {
  const div = $('uPermisosPreview');
  if (!div) return;
  const lista = PERMISOS_POR_PERFIL[categoria] || [];
  // Si edita, parte de los permisos efectivos del usuario si ya tiene rol personalizado;
  // si no, del base. Para nuevo, todo el base activado.
  let iniciales = new Set(lista);
  if (u && u.roles && u.roles.length === 1 && u.roles[0].nombre !== categoria) {
    iniciales = new Set(lista); // rol custom previo: se muestra base y el admin ajusta
  }
  const accesos = ACCESOS_POR_PERFIL[categoria] || [];
  const esPropio = u && u.id_usuario === usuario.id_usuario;
  div.innerHTML = `<p class="aviso-auto" style="margin-bottom:8px">🔑 <span id="permTitulo"></span>
      <button type="button" id="btnPermReset" class="btn btn-secundario" style="margin-left:8px;padding:4px 10px;font-size:.75rem">Restablecer</button></p>
    <div class="perm-resumen">` + Object.keys(PERMISOS_POR_MODULO).map(mod => {
      const delMod = PERMISOS_POR_MODULO[mod].filter(p => lista.includes(p));
      if (delMod.length === 0) return '';
      return `<div class="perm-grupo"><h4>${txt(mod)} · ${delMod.length}</h4><div class="perms">` +
        delMod.map(p => `<button type="button" class="perm ok" data-perm="${p}" title="Clic para activar/desactivar ${p}">✓ ${txt(p.split('.')[1])}</button>`).join('') + `</div></div>`;
    }).join('') + `</div>
    <p class="aviso-auto" style="margin:8px 0">📌 Verá en el menú: <strong>${accesos.map(txt).join(' · ')}</strong></p>
    <p class="aviso-auto" style="margin:0">⚡ Estado: ${checkboxActivoTexto(esPropio)}</p>`;
  const actualizarTitulo = () => {
    const sel = permisosSeleccionados().length;
    const t = $('permTitulo');
    if (t) t.innerHTML = (u ? `Permisos para este usuario (perfil base <strong>${txt(categoria)}</strong>): ` : `Al crear como <strong>${txt(categoria)}</strong> se le habilitará: `) +
      `<strong>${sel}/${lista.length}</strong>` + (sel !== lista.length ? ' — se creará un rol personalizado' : '');
  };
  div.querySelectorAll('[data-perm]').forEach(b => {
    b.addEventListener('click', () => {
      const activa = b.classList.contains('ok');
      b.classList.toggle('ok', !activa);
      b.classList.toggle('no', activa);
      b.innerHTML = (!activa ? '✓ ' : '') + txt(b.dataset.perm.split('.')[1]);
      actualizarTitulo();
    });
  });
  $('btnPermReset').addEventListener('click', () => pintarPreviewPermisosPerfil(categoria, u));
  actualizarTitulo();
  const chk = $('uActivo');
  if (chk) chk.onchange = () => {
    const p = div.querySelector('.estado-explica');
    if (p) p.innerHTML = checkboxActivoTexto(esPropio, chk.checked);
  };
}

function permisosSeleccionados() {
  return Array.from(document.querySelectorAll('#uPermisosPreview [data-perm].ok')).map(b => b.dataset.perm);
}

const ACCESOS_POR_PERFIL = {
  Administrativo: ['Usuarios', 'Roles y permisos', 'Grupos', 'Sesiones', 'Asistencia (resumen)', 'Horas (resumen)', 'Notas'],
  Profesor: ['Grupos (suyos)', 'Sesiones (gestionar)', 'Asistencia (marcar)', 'Horas (registrar)', 'Notas (gestionar)'],
  Estudiante: ['Grupos (suyo)', 'Sesiones (ver)', 'Asistencia (ver)', 'Notas (ver)']
};

function checkboxActivoTexto(esPropio, checked) {
  const activo = checked === undefined ? $('uActivo').checked : checked;
  let t = activo
    ? '<span class="modo modo-ok">Activo</span> Podrá iniciar sesión y usar lo habilitado arriba.'
    : '<span class="modo modo-error">Inactivo</span> NO podrá iniciar sesión (login responde 403). Se conserva su historial.';
  if (esPropio) t += ' <strong>No puedes desactivarte a ti mismo.</strong>';
  return `<span class="estado-explica">${t}</span>`;
}

function cerrarModalUsuario() {
  $('modalUsuario').classList.add('hidden');
}

async function guardarUsuario(e) {
  e.preventDefault();
  const id = $('uId').value;
  const nombres = $('uNombres').value.trim();
  const apellidos = $('uApellidos').value.trim();
  const correo = $('uCorreo').value.trim();
  if (!nombres || !apellidos || !correo) {
    mostrarErrorModal('Nombres, apellidos y correo son obligatorios (integridad de datos).');
    return;
  }
  const usuarioVal = $('uUsuario').value.trim();
  if (!usuarioVal) { mostrarErrorModal('El nombre de usuario es obligatorio.'); return; }
  // Permisos activados con los interruptores. Si difieren del base, se crea
  // un rol personalizado (RBAC) en vez de asignar el base.
  const base = PERMISOS_POR_PERFIL[categoriaActiva] || [];
  const sel = permisosSeleccionados();
  if (sel.length === 0) { mostrarErrorModal('Activa al menos 1 permiso.'); return; }
  const igualBase = sel.length === base.length && base.every(p => sel.includes(p));
  let rolAsignar = categoriaActiva;
  const cuerpo = {
    activo: $('uActivo').checked,
    nombres, apellidos, correo
  };
  const contrasena = $('uContrasena').value;

  try {
    if (!igualBase) {
      const nombreCustom = `${categoriaActiva} [${usuarioVal}]`;
      const payload = { nombre: nombreCustom, descripcion: `Rol personalizado desde ${categoriaActiva} para ${usuarioVal}.`, permisos: sel };
      try {
        await apiRequest('/roles', 'POST', payload);
      } catch (errRol) {
        // Si ya existe (reintento), lo actualiza en vez de fallar
        const roles = await apiRequest('/roles');
        const ex = roles.find(r => r.nombre === nombreCustom);
        if (!ex) throw errRol;
        await apiRequest('/roles/' + ex.id_rol, 'PUT', payload);
      }
      rolAsignar = nombreCustom;
    }
    cuerpo.roles = [rolAsignar];
    if (id) {
      cuerpo.nombre_usuario = usuarioVal;
      if (contrasena) cuerpo.contrasena = contrasena;
      await apiRequest('/usuarios/' + id, 'PUT', cuerpo);
    } else {
      cuerpo.usuario = usuarioVal;
      if (!contrasena) { mostrarErrorModal('La contraseña es obligatoria.'); return; }
      cuerpo.contrasena = contrasena;
      await apiRequest('/usuarios', 'POST', cuerpo);
    }
  } catch (err) {
    mostrarErrorModal(err.message);
    return;
  }
  cerrarModalUsuario();
  cargarCategorias();
}

function mostrarErrorModal(msg) {
  const el = $('modalError');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ---------------------------------------------------------------------
// GRUPOS ACADÉMICOS (admin gestiona; profesor y estudiante consultan)
// ---------------------------------------------------------------------
async function loadGrupos() {
  const cont = $('contenedorGrupos');
  cont.innerHTML = '<p>Cargando…</p>';
  const puedeGestionar = usuario.permisos.includes('grupos.gestionar');
  $('btnNuevoGrupo').classList.toggle('hidden', !puedeGestionar);
  try {
    const grupos = await apiRequest('/grupos');
    gruposCache = grupos;
    if (grupos.length === 0) { cont.innerHTML = '<p>No hay grupos.</p>'; return; }
    cont.innerHTML = '';
    for (const g of grupos) {
      const card = document.createElement('div');
      card.className = 'rol-card';
      const cab = document.createElement('div');
      cab.className = 'rol-card-cabecera';
      cab.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap';
      cab.innerHTML = `<strong>${txt(g.nombre)}</strong>
        <span>Profesor: <span class="chip">${txt(g.profesor || '—')}</span> · ${g.estudiantes.length} estudiante(s)</span>`;
      if (puedeGestionar) {
        const act = document.createElement('div');
        act.className = 'acciones';
        act.innerHTML = `<button class="btn btn-secundario" data-editar-grupo="${g.id_grupo}">Editar</button>
          <button class="btn btn-peligro" data-eliminar-grupo="${g.id_grupo}">Eliminar</button>`;
        cab.appendChild(act);
      }
      card.appendChild(cab);

      const body = document.createElement('div');
      body.className = 'rol-permisos';
      const mod = document.createElement('div');
      mod.className = 'modulo';
      mod.innerHTML = '<h4>Horarios</h4>';
      const ul = document.createElement('ul');
      for (const h of (g.horarios || [])) {
        const li = document.createElement('li');
        li.innerHTML = `${txt(h.dia_semana)} — ${txt(h.hora_inicio)} a ${txt(h.hora_fin)}`;
        ul.appendChild(li);
      }
      ul.innerHTML = ul.innerHTML || '<li>Sin horarios</li>';
      mod.appendChild(ul);
      body.appendChild(mod);
      const mod2 = document.createElement('div');
      mod2.className = 'modulo';
      mod2.innerHTML = '<h4>Estudiantes</h4><div class="acciones">' + (g.estudiantes || []).map(s => `<span class="chip">${txt(s.nombres || '')} ${txt(s.apellidos || '')}</span>`).join('') + '</div>';
      body.appendChild(mod2);
      card.appendChild(body);
      cont.appendChild(card);
    }

    cont.querySelectorAll('[data-editar-grupo]').forEach(b => {
      b.addEventListener('click', () => abrirModalGrupo(gruposCache.find(x => x.id_grupo === Number(b.dataset.editarGrupo))));
    });
    cont.querySelectorAll('[data-eliminar-grupo]').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este grupo?')) return;
        try { await apiRequest('/grupos/' + b.dataset.eliminarGrupo, 'DELETE'); loadGrupos(); }
        catch (e) { alert(e.message); }
      });
    });
  } catch (e) {
    cont.innerHTML = `<p class="error">${txt(e.message)}</p>`;
  }
}

function agregarFilaHorario(h) {
  const cont = $('gHorarios');
  const fila = document.createElement('div');
  fila.className = 'fila';
  fila.style.marginBottom = '6px';
  fila.innerHTML = `
    <div class="campo">
      <label>Día</label>
      <select class="h-dia">${DIAS.map(d => `<option ${h && h.dia_semana === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
    </div>
    <div class="campo">
      <label>Inicio</label>
      <input type="time" class="h-inicio" value="${h ? h.hora_inicio : '18:00'}">
    </div>
    <div class="campo">
      <label>Fin</label>
      <input type="time" class="h-fin" value="${h ? h.hora_fin : '20:00'}">
    </div>
    <div class="campo">
      <label>&nbsp;</label>
      <button type="button" class="btn btn-peligro btn-quitar-horario">&times;</button>
    </div>`;
  fila.querySelector('.btn-quitar-horario').addEventListener('click', () => fila.remove());
  cont.appendChild(fila);
}

async function abrirModalGrupo(g) {
  $('modalGrupoTitulo').textContent = g ? `Editar grupo #${g.id_grupo}` : 'Nuevo grupo';
  $('gId').value = g ? g.id_grupo : '';
  $('gNombre').value = g ? g.nombre : '';
  $('gError').classList.add('hidden');

  const profSel = $('gProfesor');
  const estCont = $('gEstudiantes');
  profSel.innerHTML = '<option value="">Sin profesor</option>';
  estCont.innerHTML = '<p>Cargando usuarios…</p>';
  try {
    const usuarios = await apiRequest('/usuarios');
    estCont.innerHTML = '';
    for (const u of usuarios) {
      const nombresRol = (u.roles || []).map(r => r.nombre);
      if (nombresRol.includes('Profesor')) {
        const op = document.createElement('option');
        op.value = u.id_usuario;
        op.textContent = `${u.nombres} ${u.apellidos} (${u.nombre_usuario})`;
        if (g && g.id_profesor === u.id_usuario) op.selected = true;
        profSel.appendChild(op);
      }
      if (nombresRol.includes('Estudiante')) {
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = u.id_usuario;
        if (g && g.estudiantes.some(s => s.id_estudiante === u.id_usuario)) cb.checked = true;
        label.appendChild(cb);
        label.appendChild(document.createTextNode(`${u.nombres} ${u.apellidos} (${u.nombre_usuario})`));
        estCont.appendChild(label);
      }
    }
    if (!profSel.options[1]) profSel.innerHTML += '<option disabled>No hay profesores aún</option>';
    if (estCont.children.length === 0) estCont.innerHTML = '<p>No hay estudiantes aún</p>';
  } catch (e) {
    estCont.innerHTML = `<p class="error">${txt(e.message)}</p>`;
  }

  const horCont = $('gHorarios');
  horCont.innerHTML = '';
  const horarios = (g && g.horarios) || [];
  if (horarios.length === 0) agregarFilaHorario(null);
  else horarios.forEach(h => agregarFilaHorario(h));

  $('modalGrupo').classList.remove('hidden');
}

function cerrarModalGrupo() {
  $('modalGrupo').classList.add('hidden');
}

async function guardarGrupo(e) {
  e.preventDefault();
  const id = $('gId').value;
  const nombre = $('gNombre').value.trim();
  if (!nombre) { const el = $('gError'); el.textContent = 'Ingrese el nombre del grupo.'; el.classList.remove('hidden'); return; }
  if (!$('gProfesor').value) { const el = $('gError'); el.textContent = 'El profesor a cargo es obligatorio.'; el.classList.remove('hidden'); return; }
  const horarios = [];
  $$('#gHorarios .fila').forEach(f => {
    horarios.push({ dia_semana: f.querySelector('.h-dia').value, hora_inicio: f.querySelector('.h-inicio').value, hora_fin: f.querySelector('.h-fin').value });
  });
  const estudiantes = Array.from($$('#gEstudiantes input[type=checkbox]:checked')).map(c => Number(c.value));
  const body = { nombre, id_profesor: Number($('gProfesor').value), horarios, estudiantes };
  try {
    if (id) await apiRequest('/grupos/' + id, 'PUT', body);
    else await apiRequest('/grupos', 'POST', body);
  } catch (err) {
    const el = $('gError');
    el.textContent = err.message;
    el.classList.remove('hidden');
    return;
  }
  cerrarModalGrupo();
  loadGrupos();
}

// ---------------------------------------------------------------------
// ASISTENCIA
// ---------------------------------------------------------------------
async function loadAsistencia() {
  const cont = $('contenedorAsistencia');
  if (esEstudianteSolo()) return resumenAsistenciaEstudiante(cont);
  if (esAdmin()) return resumenAsistenciaAdmin(cont);
  marcarAsistencia(cont);
}

// --- Estudiante: resumen de su asistencia ---
async function resumenAsistenciaEstudiante(cont) {
  cont.innerHTML = '<p>Cargando…</p>';
  try {
    const rows = await apiRequest('/asistencia/mi');
    const presentes = rows.filter(r => r.estado === 'Presente').length;
    const ausentes = rows.filter(r => r.estado === 'Ausente').length;
    const excusas = rows.filter(r => r.estado === 'Excusa').length;
    cont.innerHTML = `
      <div class="kpis">
        <div class="kpi kpi-presente"><b>${presentes}</b><span>Presentes</span></div>
        <div class="kpi kpi-ausente"><b>${ausentes}</b><span>Ausencias</span></div>
        <div class="kpi kpi-excusa"><b>${excusas}</b><span>Excusas</span></div>
      </div>
      ${rows.length ? `<table class="tabla"><thead><tr><th>Fecha</th><th>Grupo</th><th>Estado</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td>${fmtFecha(r.fecha)}</td><td>${txt(r.grupo)}</td><td>${chipAsistencia(r.estado)}</td></tr>`).join('')}</tbody></table>`
        : '<p>No hay registros de asistencia todavía.</p>'}`;
  } catch (e) {
    cont.innerHTML = `<p class="error">${txt(e.message)}</p>`;
  }
}

// --- Profesor: marcar con 3 cuadros de color ---
async function marcarAsistencia(cont) {
  try {
    if (gruposCache.length === 0) gruposCache = await apiRequest('/grupos');
  } catch (e) { gruposCache = []; }

  cont.innerHTML = `
    <p class="aviso-auto">La lista se actualiza automáticamente al cambiar de grupo o fecha.</p>
    <div class="fila" style="align-items:flex-end">
      <div class="campo">
        <label>Grupo</label>
        <select id="asGrupo">${gruposCache.map(g => `<option value="${g.id_grupo}">${txt(g.nombre)}</option>`).join('')}</select>
      </div>
      <div class="campo">
        <label>Fecha</label>
        <input type="date" id="asFecha" value="${hoyISO()}">
      </div>
    </div>
    <div class="leyenda-notas" style="margin-top:-6px">
      <span><span class="dot dot-ok"></span>Presente</span>
      <span><span class="dot dot-mal"></span>Ausente</span>
      <span><span class="dot" style="background:#eab308"></span>Excusado</span>
    </div>
    <div id="asGrid"></div>`;

  $('asGrupo').addEventListener('change', cargarAsistenciaGrid);
  $('asFecha').addEventListener('change', cargarAsistenciaGrid);
  if (gruposCache.length > 0) cargarAsistenciaGrid();
}

async function cargarAsistenciaGrid() {
  const grid = $('asGrid');
  const idGrupo = $('asGrupo').value;
  const fecha = $('asFecha').value;
  if (!idGrupo || !fecha) { grid.innerHTML = '<p class="error">Seleccione grupo y fecha.</p>'; return; }
  grid.innerHTML = '<p>Cargando…</p>';
  try {
    const data = await apiRequest(`/asistencia?grupo=${idGrupo}&fecha=${fecha}`);
    const estudiantes = data.estudiantes || [];
    if (estudiantes.length === 0) { grid.innerHTML = '<p>Este grupo no tiene estudiantes asignados.</p>'; return; }

    grid.innerHTML = `
      <table class="tabla">
        <thead><tr><th>Estudiante</th><th>Marca de asistencia</th></tr></thead>
        <tbody>${estudiantes.map(ex => `
          <tr data-est="${ex.id_estudiante}">
            <td>${txt(ex.nombres || '')} ${txt(ex.apellidos || '')}</td>
            <td>${htmlMarcas(ex.estado)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <button type="button" class="btn btn-primario" id="btnGuardarAsistencia" style="margin-top:12px">Guardar asistencia</button>`;

    grid.querySelectorAll('.marcas .marca input').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) {
          const fila = cb.closest('tr');
          fila.querySelectorAll('.marcas input').forEach(o => { if (o !== cb) o.checked = false; });
        }
      });
    });

    $('btnGuardarAsistencia').addEventListener('click', async () => {
      const registros = [];
      grid.querySelectorAll('tbody tr').forEach(tr => {
        const marcado = tr.querySelector('.marcas input:checked');
        if (marcado) {
          registros.push({ id_estudiante: Number(tr.dataset.est), estado: marcado.dataset.estado });
        }
      });
      if (registros.length === 0) { alert('Marque al menos un estudiante.'); return; }
      try {
        await apiRequest('/asistencia', 'POST', { id_grupo: Number(idGrupo), fecha, registros });
        alert('Asistencia guardada.');
        await cargarAsistenciaGrid();
        const nuevo = $('asGrid');
        nuevo.querySelectorAll('.marcas input').forEach(i => i.checked = false);
      } catch (e) {
        alert(e.message);
      }
    });
  } catch (e) {
    grid.innerHTML = `<p class="error">${txt(e.message)}</p>`;
  }
}

function htmlMarcas(estado) {
  const opciones = [
    ['Presente', 'presente', 'Presente'],
    ['Ausente', 'ausente', 'Ausente'],
    ['Excusado', 'excusado', 'Excusa']
  ];
  return `<div class="marcas">${opciones.map(([label, cls, val]) => `
    <label class="marca">
      <input type="checkbox" data-estado="${val}" ${estado === val ? 'checked' : ''}>
      <span class="cuadro ${cls}"></span>${label}
    </label>`).join('')}</div>`;
}

// --- Administrativo: resumen de información (por grupo o por estudiante) ---
async function resumenAsistenciaAdmin(cont) {
  try {
    if (gruposCache.length === 0) gruposCache = await apiRequest('/grupos');
    if (usuariosCache.length === 0) usuariosCache = await apiRequest('/usuarios');
  } catch (e) { }

  cont.innerHTML = `
    <div class="resumen-encabezado">
      <span class="pestana ${'activo'}" data-modo="grupo">Por grupo</span>
      <span class="pestana" data-modo="estudiante">Por estudiante</span>
    </div>
    <div id="resumenFiltros"></div>
    <div id="resumenCuerpo"><p>Seleccione un grupo para ver el resumen.</p></div>`;

  cont.querySelectorAll('.pestana').forEach(p => {
    p.addEventListener('click', () => {
      cont.querySelectorAll('.pestana').forEach(x => x.classList.remove('activo'));
      p.classList.add('activo');
      if (p.dataset.modo === 'grupo') renderFiltroGrupo();
      else renderFiltroEstudiante();
    });
  });

  renderFiltroGrupo();
}

function renderFiltroGrupo() {
  const filtro = $('resumenFiltros');
  const cuerpo = $('resumenCuerpo');
  filtro.innerHTML = `
    <div class="fila" style="align-items:flex-end">
      <div class="campo">
        <label>Grupo</label>
        <select id="resGrupo">${gruposCache.map(g => `<option value="${g.id_grupo}">${txt(g.nombre)}</option>`).join('')}</select>
      </div>
      <div class="campo">
        <button type="button" class="btn btn-primario" id="btnResumenGrupo">Ver resumen</button>
      </div>
    </div>`;
  cuerpo.innerHTML = '<p>Seleccione un grupo y presione "Ver resumen".</p>';
  $('btnResumenGrupo').addEventListener('click', async () => {
    cuerpo.innerHTML = '<p>Cargando…</p>';
    try {
      const data = await apiRequest('/resumen/grupo/' + $('resGrupo').value);
      const estudiantes = data.estudiantes || [];
      cuerpo.innerHTML = `
        <h3 style="margin:12px 0 6px">Asistencia — ${txt(data.grupo.nombre)}</h3>
        ${estudiantes.length === 0 ? '<p>Sin estudiantes asignados.</p>' : `
        <table class="tabla">
          <thead><tr><th>Estudiante</th><th>Presentes</th><th>Ausencias</th><th>Excusas</th><th>Asistencia</th></tr></thead>
          <tbody>${estudiantes.map(s => {
            const total = s.presentes + s.ausentes + s.excusas;
            const pct = total ? Math.round((s.presentes / total) * 100) : null;
            return `<tr><td>${txt(s.nombres || '')} ${txt(s.apellidos || '')}</td>
              <td style="color:var(--exito);font-weight:600">${s.presentes}</td>
              <td style="color:var(--peligro);font-weight:600">${s.ausentes}</td>
              <td>${s.excusas}</td>
              <td>${pct == null ? '—' : pct + '%'}</td></tr>`;
          }).join('')}</tbody>
        </table>`}
        <h3 style="margin:16px 0 6px">Sesiones de clase (Temas vistos) — ${(data.sesiones || []).length}</h3>
        ${(data.sesiones || []).length === 0 ? '<p>Sin sesiones de clase registradas para este grupo.</p>' : `
        <table class="tabla">
          <thead><tr><th>Fecha</th><th>Tema</th><th>Profesor</th></tr></thead>
          <tbody>${data.sesiones.map(s => `<tr>
            <td>${fmtFecha(s.fecha)}</td>
            <td><strong>${txt(s.tema)}</strong><br><small>${txt(s.descripcion || '')}</small></td>
            <td>${txt(s.profesor)}</td>
          </tr>`).join('')}</tbody>
        </table>`}
        <h3 style="margin:16px 0 6px">Temas y notas (exámenes)</h3>
        ${(data.examenes || []).length === 0 ? '<p>Sin exámenes registrados para este grupo.</p>' : `
        <table class="tabla">
          <thead><tr><th>Examen (tema)</th><th>Fecha</th><th>Alumnos con nota</th><th>Promedio</th></tr></thead>
          <tbody>${data.examenes.map(ex => `<tr>
            <td>${txt(ex.nombre)}</td>
            <td>${fmtFecha(ex.fecha)}</td>
            <td>${ex.alumnos}</td>
            <td>${notaHTML(ex.promedio)}</td>
          </tr>`).join('')}</tbody>
        </table>`}
        <div class="leyenda-notas">
          <span><span class="dot dot-ok"></span>Aprueba (≥ ${NOTA_MINIMA.toFixed(1)})</span>
          <span><span class="dot dot-mal"></span>Por debajo de ${NOTA_MINIMA.toFixed(1)}</span>
        </div>`;
    } catch (e) {
      cuerpo.innerHTML = `<p class="error">${txt(e.message)}</p>`;
    }
  });
}

function renderFiltroEstudiante() {
  const filtro = $('resumenFiltros');
  const cuerpo = $('resumenCuerpo');
  const estudiantes = usuariosCache.filter(u => (u.roles || []).some(r => r.nombre === 'Estudiante'));
  filtro.innerHTML = `
    <div class="fila" style="align-items:flex-end">
      <div class="campo">
        <label>Estudiante</label>
        <select id="resEstudiante">${estudiantes.map(u => `<option value="${u.id_usuario}">${txt(u.nombres || u.nombre_usuario)} ${txt(u.apellidos || '')}</option>`).join('') || '<option value="">Sin estudiantes</option>'}</select>
      </div>
      <div class="campo">
        <button type="button" class="btn btn-primario" id="btnResumenEstudiante">Ver resumen</button>
      </div>
    </div>`;
  cuerpo.innerHTML = '<p>Seleccione un estudiante y presione "Ver resumen".</p>';
  const btn = $('btnResumenEstudiante');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    cuerpo.innerHTML = '<p>Cargando…</p>';
    const id = $('resEstudiante').value;
    try {
      const data = await apiRequest('/resumen/estudiante/' + id);
      cuerpo.innerHTML = `
        <h3 style="margin:10px 0">Resumen de ${txt(data.estudiante.nombres || '')} ${txt(data.estudiante.apellidos || '')}</h3>
        <div class="kpis">
          <div class="kpi kpi-presente"><b>${data.asistencia.presente}</b><span>Presentes</span></div>
          <div class="kpi kpi-ausente"><b>${data.asistencia.ausente}</b><span>Ausencias</span></div>
          <div class="kpi kpi-excusa"><b>${data.asistencia.excusa}</b><span>Excusas</span></div>
          <div class="kpi"><b>${data.asistencia.total}</b><span>Registros</span></div>
        </div>
        ${data.registros.length ? `<h4 style="margin:10px 0 6px">Asistencia</h4>
        <table class="tabla"><thead><tr><th>Fecha</th><th>Grupo</th><th>Estado</th></tr></thead>
          <tbody>${data.registros.map(r => `<tr><td>${fmtFecha(r.fecha)}</td><td>${txt(r.grupo)}</td><td>${chipAsistencia(r.estado)}</td></tr>`).join('')}</tbody></table>`
        : '<p>Sin registros de asistencia.</p>'}
        <h4 style="margin:14px 0 6px">Notas de exámenes</h4>
        ${data.notas.length ? `<table class="tabla"><thead><tr><th>Examen (tema)</th><th>Fecha</th><th>Grupo</th><th>Nota</th></tr></thead>
          <tbody>${data.notas.map(n => `<tr><td>${txt(n.nombre)}</td><td>${fmtFecha(n.fecha)}</td><td>${txt(n.grupo)}</td><td>${notaHTML(n.calificacion)}</td></tr>`).join('')}</tbody></table>`
        : '<p>Sin notas registradas.</p>'}`;
    } catch (e) {
      cuerpo.innerHTML = `<p class="error">${txt(e.message)}</p>`;
    }
  });
}

// ---------------------------------------------------------------------
// NOTAS DE EXÁMENES
// ---------------------------------------------------------------------
async function loadNotas() {
  const cont = $('contenedorNotas');
  if (esEstudianteSolo()) return notasEstudiante(cont);
  notasProfesor(cont);
}

async function notasEstudiante(cont) {
  cont.innerHTML = '<p>Cargando…</p>';
  try {
    const rows = await apiRequest('/examenes/mis');
    if (rows.length === 0) { cont.innerHTML = '<p>Aún no tiene notas de exámenes.</p>'; return; }
    cont.innerHTML = `
      <div class="leyenda-notas" style="margin-bottom:10px">
        <span><span class="dot dot-ok"></span>Aprueba (≥ ${NOTA_MINIMA.toFixed(1)})</span>
        <span><span class="dot dot-mal"></span>Por debajo de ${NOTA_MINIMA.toFixed(1)}</span>
      </div>
      <table class="tabla">
        <thead><tr><th>Examen (tema)</th><th>Fecha</th><th>Grupo</th><th>Nota</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td>${txt(r.nombre)}</td><td>${fmtFecha(r.fecha)}</td><td>${txt(r.grupo)}</td><td>${notaHTML(r.calificacion)}</td></tr>`).join('')}</tbody>
      </table>`;
  } catch (e) {
    cont.innerHTML = `<p class="error">${txt(e.message)}</p>`;
  }
}

async function notasProfesor(cont) {
  try {
    if (gruposCache.length === 0) gruposCache = await apiRequest('/grupos');
  } catch (e) { gruposCache = []; }

  cont.innerHTML = `
    <p class="aviso-auto">Los exámenes y sus notas se actualizan automáticamente al cambiar de grupo.</p>
    <div class="fila" style="align-items:flex-end">
      <div class="campo">
        <label>Grupo</label>
        <select id="ntGrupo">${gruposCache.map(g => `<option value="${g.id_grupo}">${txt(g.nombre)}</option>`).join('')}</select>
      </div>
    </div>
    <div id="cuerpoNotas"><p>Seleccione un grupo para ver sus exámenes.</p></div>`;

  $('ntGrupo').addEventListener('change', () => cargoExamenesPorGrupo());
  if (gruposCache.length > 0) cargoExamenesPorGrupo();
}

function notaClase(cal) { return Number(cal) >= 3.5 ? 'nota-buena' : 'nota-mala'; }

async function cargoExamenesPorGrupo() {
  const cuerpo = $('cuerpoNotas');
  const idGrupo = Number($('ntGrupo').value);
  if (!idGrupo) { cuerpo.innerHTML = '<p>No hay grupos disponibles.</p>'; return; }
  cuerpo.innerHTML = '<p>Cargando…</p>';
  try {
    const data = await apiRequest('/examenes?grupo=' + idGrupo);
    notasGrupo = idGrupo;
    notasEstudiantes = data.estudiantes || [];
    const examenes = data.examenes || [];
    const filaEstudiante = s => `${txt(s.nombres || '')} ${txt(s.apellidos || '')}`.trim() || `Estudiante #${s.id_estudiante}`;
    cuerpo.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin:12px 0">
        <strong>Exámenes de ${txt(data.grupo.nombre)}</strong>
        <button type="button" class="btn btn-primario" id="btnNuevoExamen">+ Nuevo examen</button>
      </div>
      ${examenes.length === 0 ? '<p>Este grupo aún no tiene exámenes.</p>' : examenes.map(ex => `
        <div class="rol-card" style="margin-bottom:12px">
          <div class="rol-card-cabecera" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
            <span>${txt(ex.nombre)}
              <span class="modo-notas">${fmtFecha(ex.fecha)}</span>
              <span class="modo-notas">${ex.notas.length} calificación(es) · Promedio ${ex.notas.length ? Number((ex.notas.reduce((s, n) => s + Number(n.calificacion), 0) / ex.notas.length)).toFixed(1) : '—'}</span>
            </span>
            <span class="acciones">
              <button class="btn btn-secundario" data-editar-examen="${ex.id_examen}">Editar</button>
              <button class="btn btn-peligro" data-eliminar-examen="${ex.id_examen}">Eliminar</button>
            </span>
          </div>
          <table class="tabla">
            <thead><tr><th>Estudiante</th><th>Nota (0.0 a 5.0)</th></tr></thead>
            <tbody>${notasEstudiantes.map(s => {
              const nota = ex.notas.find(n => n.id_estudiante === s.id_estudiante);
              return `<tr><td>${filaEstudiante(s)}</td>
                <td>${nota ? `<span class="${notaClase(nota.calificacion)}">${Number(nota.calificacion).toFixed(1)}</span>` : '<span style="color:var(--texto-suave)">—</span>'}</td></tr>`;
            }).join('')}</tbody>
          </table>
        </div>`).join('')}`;

    $('btnNuevoExamen').addEventListener('click', () => abrirModalExamen(null));
    cuerpo.querySelectorAll('[data-editar-examen]').forEach(b => {
      b.addEventListener('click', () => abrirModalExamen(examenes.find(x => x.id_examen === Number(b.dataset.editarExamen))));
    });
    cuerpo.querySelectorAll('[data-eliminar-examen]').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este examen y sus notas?')) return;
        try { await apiRequest('/examenes/' + b.dataset.eliminarExamen, 'DELETE'); cargoExamenesPorGrupo(); }
        catch (e) { alert(e.message); }
      });
    });
  } catch (e) {
    cuerpo.innerHTML = `<p class="error">${txt(e.message)}</p>`;
  }
}

function abrirModalExamen(ex) {
  $('modalExamenTitulo').textContent = ex ? `Editar examen #${ex.id_examen}` : 'Nuevo examen';
  $('exId').value = ex ? ex.id_examen : '';
  $('exNombre').value = ex ? ex.nombre : '';
  $('exFecha').value = ex && ex.fecha ? String(ex.fecha).slice(0, 10) : hoyISO();
  $('exError').classList.add('hidden');

  const contenedor = $('exNotas');
  contenedor.innerHTML = notasEstudiantes.length === 0
    ? '<p style="padding:10px;color:var(--texto-suave)">Este grupo no tiene estudiantes.</p>'
    : `<table class="tabla">
        <thead><tr><th>Estudiante</th><th>Nota (0.0 a 5.0)</th></tr></thead>
        <tbody>${notasEstudiantes.map(s => {
          const nota = ex ? ex.notas.find(n => n.id_estudiante === s.id_estudiante) : null;
          const nombre = `${txt(s.nombres || '')} ${txt(s.apellidos || '')}`.trim() || `Estudiante #${s.id_estudiante}`;
          return `<tr><td>${nombre}</td>
            <td><input type="number" class="nota-input" data-est="${s.id_estudiante}" min="0" max="5" step="0.1" value="${nota ? nota.calificacion : ''}"></td></tr>`;
        }).join('')}</tbody>
      </table>`;
  $('modalExamen').classList.remove('hidden');
}

function cerrarModalExamen() {
  $('modalExamen').classList.add('hidden');
}

async function guardarExamen(e) {
  e.preventDefault();
  const id = $('exId').value;
  const nombre = $('exNombre').value.trim();
  if (!nombre) { const el = $('exError'); el.textContent = 'Ingrese el nombre del examen.'; el.classList.remove('hidden'); return; }
  const body = { nombre, fecha: $('exFecha').value || null };
  const notas = [];
  let ok = true;
  $('exNotas').querySelectorAll('.nota-input').forEach(inp => {
    if (inp.value === '') return;
    const cal = Number(inp.value);
    if (cal < 0 || cal > 5) { ok = false; return; }
    notas.push({ id_estudiante: Number(inp.dataset.est), calificacion: cal });
  });
  if (!ok) { const el = $('exError'); el.textContent = 'Las notas deben estar entre 0.0 y 5.0.'; el.classList.remove('hidden'); return; }
  try {
    let idExamen = id ? Number(id) : null;
    if (idExamen) await apiRequest('/examenes/' + idExamen, 'PUT', body);
    else idExamen = (await apiRequest('/examenes', 'POST', Object.assign({ id_grupo: notasGrupo }, body))).id_examen;
    if (notas.length > 0) await apiRequest('/examenes/notas', 'POST', { id_examen: idExamen, notas });
  } catch (err) {
    const el = $('exError');
    el.textContent = err.message;
    el.classList.remove('hidden');
    return;
  }
  cerrarModalExamen();
  cargoExamenesPorGrupo();
}

// ---------------------------------------------------------------------
// HORAS TRABAJADAS (Profesor registra; Administrativo solo resume)
// ---------------------------------------------------------------------
async function loadHoras() {
  const cont = $('contenedorHoras');
  if (esAdmin()) return resumenHorasAdmin(cont);
  horasProfesor(cont);
}

async function resumenHorasAdmin(cont) {
  cont.innerHTML = '<p>Cargando…</p>';
  try {
    const rows = await apiRequest('/horas');
    if (rows.length === 0) { cont.innerHTML = '<p>No hay horas registradas por los profesores.</p>'; return; }
    const porProfe = {};
    for (const r of rows) {
      const clave = r.id_profesor;
      if (!porProfe[clave]) porProfe[clave] = { profesor: r.profesor || r.id_profesor, total: 0 };
      porProfe[clave].total += Number(r.horas);
    }
    cont.innerHTML = `
      <h3 style="margin:6px 0 10px">Total de horas por profesor</h3>
      <table class="tabla">
        <thead><tr><th>Profesor</th><th>Total de horas</th></tr></thead>
        <tbody>${Object.values(porProfe).map(p => `<tr><td>${txt(p.profesor)}</td><td style="font-weight:700">${p.total}</td></tr>`).join('')}</tbody>
      </table>
      <h3 style="margin:16px 0 10px">Detalle de horas registradas</h3>
      <table class="tabla">
        <thead><tr><th>Fecha</th><th>Profesor</th><th>Grupo</th><th>Horario</th><th>Horas</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td>${fmtFecha(r.fecha)}</td><td>${txt(r.profesor)}</td><td>${txt(r.grupo)}</td><td>${txt(r.dia_semana)} — ${txt(r.hora_inicio)} a ${txt(r.hora_fin)}</td><td>${r.horas}</td></tr>`).join('')}</tbody>
      </table>`;
  } catch (e) {
    cont.innerHTML = `<p class="error">${txt(e.message)}</p>`;
  }
}

async function horasProfesor(cont) {
  try {
    if (gruposCache.length === 0) gruposCache = await apiRequest('/grupos');
  } catch (e) { gruposCache = []; }

  const opcionesGrupos = gruposCache.map(g => `<option value="${g.id_grupo}">${txt(g.nombre)}</option>`).join('');
  cont.innerHTML = `
    <div class="kpis">
      <div class="kpi kpi-presente"><b id="hhMesTotal">0</b><span id="hhMesLabel">Horas trabajadas en el mes</span></div>
    </div>
    <form id="formHoras" class="fila" style="align-items:flex-end;flex-wrap:wrap">
      <div class="campo">
        <label>Fecha</label>
        <input type="date" id="hhFecha" value="${hoyISO()}" required>
      </div>
      <div class="campo">
        <label>Grupo</label>
        <select id="hhGrupo" required>${opcionesGrupos || '<option value="">Sin grupos</option>'}</select>
      </div>
      <div class="campo">
        <label>Horario</label>
        <select id="hhHorario" required></select>
      </div>
      <div class="campo">
        <label>Horas (según el horario)</label>
        <div id="hhAutoHoras" class="hh-auto">—</div>
      </div>
      <div class="campo">
        <button type="submit" class="btn btn-primario">Registrar horas</button>
      </div>
    </form>
    <div id="cuerpoHoras" style="margin-top:14px"><p>Cargando…</p></div>`;

  $('hhGrupo').addEventListener('change', llenarHorariosSelect);
  $('hhHorario').addEventListener('change', actualizarHorasAuto);
  $('formHoras').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const body = {
      id_grupo: Number($('hhGrupo').value),
      id_horario: Number($('hhHorario').value),
      fecha: $('hhFecha').value
    };
    try {
      await apiRequest('/horas', 'POST', body);
      alert('Horas registradas.');
      cargarTablaHoras();
    } catch (e) {
      alert(e.message);
    }
  });
  llenarHorariosSelect();
  cargarTablaHoras();
}

function duracionHorario(h) {
  const conv = (t) => {
    const [hh, mm] = String(t).split(':').map(Number);
    return (hh * 60 + (mm || 0)) / 60;
  };
  return Math.round((conv(h.hora_fin) - conv(h.hora_inicio)) * 10) / 10;
}

function llenarHorariosSelect() {
  const sel = $('hhHorario');
  const g = gruposCache.find(x => x.id_grupo === Number($('hhGrupo').value));
  sel.innerHTML = (g && g.horarios ? g.horarios : []).map(h =>
    `<option value="${h.id_horario}">${txt(h.dia_semana)} — ${txt(h.hora_inicio)} a ${txt(h.hora_fin)}</option>`).join('');
  actualizarHorasAuto();
}

function actualizarHorasAuto() {
  const g = gruposCache.find(x => x.id_grupo === Number($('hhGrupo').value));
  const h = g && g.horarios ? g.horarios.find(x => x.id_horario === Number($('hhHorario').value)) : null;
  $('hhAutoHoras').textContent = h ? duracionHorario(h) + ' horas' : '—';
}

async function cargarTablaHoras() {
  const cuerpo = $('cuerpoHoras');
  cuerpo.innerHTML = '<p>Cargando…</p>';
  try {
    const rows = await apiRequest('/horas');
    const ahora = new Date();
    const claveMes = ahora.getFullYear() + '-' + String(ahora.getMonth() + 1).padStart(2, '0');
    const totalMes = rows.reduce((suma, r) => {
      const d = new Date(r.fecha);
      if (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') === claveMes) {
        return suma + Number(r.horas);
      }
      return suma;
    }, 0);
    const mesNombre = ahora.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    $('hhMesTotal').textContent = totalMes;
    $('hhMesLabel').textContent = 'Horas trabajadas en ' + mesNombre;

    if (rows.length === 0) { cuerpo.innerHTML = '<p>Sin registros de horas.</p>'; return; }
    cuerpo.innerHTML = `<table class="tabla">
      <thead><tr><th>Fecha</th><th>Grupo</th><th>Horario</th><th>Horas</th><th>Acciones</th></tr></thead>
      <tbody>${rows.map(r => `
        <tr>
          <td>${fmtFecha(r.fecha)}</td>
          <td>${txt(r.grupo)}</td>
          <td>${txt(r.dia_semana)} — ${txt(r.hora_inicio)} a ${txt(r.hora_fin)}</td>
          <td>${r.horas}</td>
          <td><div class="acciones">
            ${(esAdmin() || r.id_profesor === usuario.id_usuario) ? `<button class="btn btn-peligro" data-del-hora="${r.id_hora}">Eliminar</button>` : '—'}
          </div></td>
        </tr>`).join('')}
      </tbody></table>`;
    cuerpo.querySelectorAll('[data-del-hora]').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este registro?')) return;
        try { await apiRequest('/horas/' + b.dataset.delHora, 'DELETE'); cargarTablaHoras(); }
        catch (e) { alert(e.message); }
      });
    });
  } catch (e) {
    cuerpo.innerHTML = `<p class="error">${txt(e.message)}</p>`;
  }
}

// ---------------------------------------------------------------------
// SESIONES DE CLASE (Temas vistos) - evidencia MR-3FN
// ---------------------------------------------------------------------
let sesionesGrupo = null;
let sesionesHorarios = [];

async function loadSesiones() {
  const cont = $('contenedorSesiones');
  if (esEstudianteSolo()) return sesionesEstudiante(cont);
  sesionesGrupoProfe(cont);
}

async function sesionesEstudiante(cont) {
  cont.innerHTML = barraPermisos(['sesiones.ver']) + '<p>Cargando…</p>';
  try {
    const rows = await apiRequest('/sesiones/mis');
    if (rows.length === 0) { cont.innerHTML += '<p>Aún no hay sesiones de clase registradas.</p>'; return; }
    cont.innerHTML += `<table class="tabla">
      <thead><tr><th>Fecha</th><th>Grupo</th><th>Tema visto</th><th>Descripción</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${fmtFecha(r.fecha)}</td><td>${txt(r.grupo)}</td><td><strong>${txt(r.tema)}</strong></td><td>${txt(r.descripcion || '—')}</td></tr>`).join('')}</tbody></table>`;
  } catch (e) {
    cont.innerHTML += `<p class="error">${txt(e.message)}</p>`;
  }
}

async function sesionesGrupoProfe(cont) {
  try {
    if (gruposCache.length === 0) gruposCache = await apiRequest('/grupos');
  } catch (e) { gruposCache = []; }
  const puedeGestionar = usuario.permisos.includes('sesiones.gestionar');
  cont.innerHTML = barraPermisos(['sesiones.ver', 'sesiones.gestionar']) + `
    <div class="fila" style="align-items:flex-end">
      <div class="campo"><label>Grupo</label>
        <select id="sesGrupo">${gruposCache.map(g => `<option value="${g.id_grupo}">${txt(g.nombre)}</option>`).join('')}</select>
      </div>
      <div class="campo">${puedeGestionar ? '<button type="button" class="btn btn-primario" id="btnNuevaSesion">+ Nueva sesión</button>' : ''}</div>
    </div>
    <div id="cuerpoSesiones"><p>Seleccione un grupo.</p></div>`;
  const sel = $('sesGrupo');
  if (sel) sel.addEventListener('change', cargarSesionesPorGrupo);
  const btn = $('btnNuevaSesion');
  if (btn) btn.addEventListener('click', () => abrirModalSesion(null));
  if (gruposCache.length > 0) cargarSesionesPorGrupo();
}

async function cargarSesionesPorGrupo() {
  const cuerpo = $('cuerpoSesiones');
  const idGrupo = Number($('sesGrupo').value);
  if (!idGrupo) return;
  sesionesGrupo = idGrupo;
  cuerpo.innerHTML = '<p>Cargando…</p>';
  try {
    const data = await apiRequest('/sesiones?grupo=' + idGrupo);
    const g = gruposCache.find(x => x.id_grupo === idGrupo);
    sesionesHorarios = (g && g.horarios) || [];
    const sesiones = data.sesiones || [];
    const puedeGestionar = usuario.permisos.includes('sesiones.gestionar');
    if (sesiones.length === 0) { cuerpo.innerHTML = '<p>Este grupo aún no tiene sesiones de clase (temas).</p>'; return; }
    cuerpo.innerHTML = `<table class="tabla">
      <thead><tr><th>Fecha</th><th>Tema visto</th><th>Descripción</th><th>Profesor</th>${puedeGestionar ? '<th>Acciones</th>' : ''}</tr></thead>
      <tbody>${sesiones.map(s => `<tr><td>${fmtFecha(s.fecha)}</td><td><strong>${txt(s.tema)}</strong></td>
        <td>${txt(s.descripcion || '—')}</td><td>${txt(s.profesor || '—')}</td>
        ${puedeGestionar ? `<td><div class="acciones">
          <button class="btn btn-secundario" data-editar-sesion="${s.id_sesion}">Editar</button>
          <button class="btn btn-peligro" data-eliminar-sesion="${s.id_sesion}">Eliminar</button>
        </div></td>` : ''}</tr>`).join('')}</tbody></table>`;
    cuerpo.querySelectorAll('[data-editar-sesion]').forEach(b => {
      b.addEventListener('click', () => abrirModalSesion(sesiones.find(x => x.id_sesion === Number(b.dataset.editarSesion))));
    });
    cuerpo.querySelectorAll('[data-eliminar-sesion]').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('¿Eliminar esta sesión?')) return;
        try { await apiRequest('/sesiones/' + b.dataset.eliminarSesion, 'DELETE'); cargarSesionesPorGrupo(); }
        catch (e) { alert(e.message); }
      });
    });
  } catch (e) {
    cuerpo.innerHTML = `<p class="error">${txt(e.message)}</p>`;
  }
}

function abrirModalSesion(s) {
  $('modalSesionTitulo').textContent = s ? `Editar sesión #${s.id_sesion}` : 'Nueva sesión de clase';
  $('sesId').value = s ? s.id_sesion : '';
  $('sesFecha').value = s && s.fecha ? String(s.fecha).slice(0, 10) : hoyISO();
  $('sesTema').value = s ? s.tema : '';
  $('sesDescripcion').value = s && s.descripcion ? s.descripcion : '';
  const sel = $('sesHorario');
  sel.innerHTML = '<option value="">Sin horario</option>' + sesionesHorarios.map(h =>
    `<option value="${h.id_horario}" ${s && s.id_horario === h.id_horario ? 'selected' : ''}>${txt(h.dia_semana)} — ${txt(h.hora_inicio)} a ${txt(h.hora_fin)}</option>`).join('');
  $('sesError').classList.add('hidden');
  $('modalSesion').classList.remove('hidden');
}

function cerrarModalSesion() { $('modalSesion').classList.add('hidden'); }

async function guardarSesion(e) {
  e.preventDefault();
  const id = $('sesId').value;
  const body = {
    id_grupo: sesionesGrupo,
    fecha: $('sesFecha').value,
    tema: $('sesTema').value.trim(),
    descripcion: $('sesDescripcion').value.trim() || null,
    id_horario: $('sesHorario').value || null
  };
  if (!body.tema) { const el = $('sesError'); el.textContent = 'El tema es obligatorio.'; el.classList.remove('hidden'); return; }
  try {
    if (id) await apiRequest('/sesiones/' + id, 'PUT', body);
    else await apiRequest('/sesiones', 'POST', body);
  } catch (err) {
    const el = $('sesError'); el.textContent = err.message; el.classList.remove('hidden'); return;
  }
  cerrarModalSesion();
  cargarSesionesPorGrupo();
}

// ---------------------------------------------------------------------
// ROLES Y PERMISOS - administración del módulo de autenticación
// ---------------------------------------------------------------------
async function loadRoles() {
  const cont = $('contenedorRoles');
  const barra = barraPermisos(['roles.ver', 'roles.gestionar', 'usuarios.ver', 'usuarios.crear', 'usuarios.editar', 'usuarios.eliminar']);
  cont.innerHTML = barra + '<p>Cargando roles y permisos…</p>';
  const puedeGestionar = usuario.permisos.includes('roles.gestionar');
  try {
    const roles = await apiRequest('/roles');
    const modulos = {};
    for (const r of roles) {
      for (const mod of Object.keys(r.permisos || {})) {
        if (!modulos[mod]) modulos[mod] = true;
      }
    }
    cont.innerHTML = barra + `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin:10px 0">
        <strong>${roles.length} roles · ${Object.keys(modulos).length} módulos · 16 permisos de acción</strong>
        ${puedeGestionar ? '<button type="button" class="btn btn-primario" id="btnNuevoRol">+ Nuevo rol</button>' : ''}
      </div>
      ${matrizMenuPermisos(roles)}
      ${roles.map(r => {
        const total = Object.values(r.permisos || {}).reduce((a, b) => a + b.length, 0);
        return `<div class="rol-card">
        <div class="rol-card-cabecera" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <span>${txt(r.nombre)} <small>— ${txt(r.descripcion || '')} · ${total} permisos</small></span>
          ${puedeGestionar ? `<span class="acciones">
            <button class="btn btn-secundario" data-editar-rol="${r.id_rol}">Editar permisos</button>
          </span>` : ''}
        </div>
        <div class="rol-permisos">${Object.keys(r.permisos || {}).map(mod => `
          <div class="modulo"><h4>${txt(mod)}</h4><ul>
            ${(r.permisos[mod] || []).map(p => `<li>✓ ${txt(p.nombre)} <span style="opacity:.65">— ${txt(p.descripcion || '')}</span></li>`).join('')}
          </ul></div>`).join('') || '<p>Sin permisos</p>'}</div>
      </div>`;
      }).join('')}
      <h3 style="margin:14px 0 8px">Usuarios, roles asignados y último acceso</h3>
      <div id="rolesUsuarios"><p>Cargando usuarios…</p></div>`;
    const btnN = $('btnNuevoRol');
    if (btnN) btnN.addEventListener('click', () => abrirModalRol(null));
    cont.querySelectorAll('[data-editar-rol]').forEach(b => {
      b.addEventListener('click', () => abrirModalRol(roles.find(x => x.id_rol === Number(b.dataset.editarRol))));
    });
    await cargarRolesUsuarios();
  } catch (e) {
    cont.innerHTML = barra + `<p class="error">No se pudo cargar Roles y permisos: ${txt(e.message)}. Verifica que la API esté corriendo y vuelve a iniciar sesión.</p>`;
  }
}

function matrizMenuPermisos(roles) {
  const MENU = [
    { menu: '👥 Usuarios', acceso: 'usuarios.ver', acciones: ['usuarios.ver', 'usuarios.crear', 'usuarios.editar', 'usuarios.eliminar'] },
    { menu: '🔐 Roles y permisos', acceso: 'roles.ver', acciones: ['roles.ver', 'roles.gestionar'] },
    { menu: '🏫 Grupos', acceso: 'grupos.ver', acciones: ['grupos.ver', 'grupos.gestionar'] },
    { menu: '📚 Sesiones', acceso: 'sesiones.ver', acciones: ['sesiones.ver', 'sesiones.gestionar'] },
    { menu: '✅ Asistencia', acceso: 'asistencia.ver', acciones: ['asistencia.ver', 'asistencia.marcar'] },
    { menu: '⏰ Horas', acceso: 'horas.ver', acciones: ['horas.ver', 'horas.registrar'] },
    { menu: '📝 Notas', acceso: 'notas.ver', acciones: ['notas.ver', 'notas.gestionar'] }
  ];
  const base = roles.filter(r => ['Administrativo', 'Profesor', 'Estudiante'].includes(r.nombre));
  const setDe = (r) => {
    const s = new Set();
    for (const mod of Object.keys(r.permisos || {})) for (const p of r.permisos[mod]) s.add(p.nombre);
    return s;
  };
  const sets = {};
  for (const r of base) sets[r.nombre] = setDe(r);
  return `<h3 style="margin:12px 0 8px">Qué permiso abre cada opción del menú</h3>
  <p class="aviso-auto">Columna “Abre con” = permiso que muestra el botón en el menú. “Acciones” = permisos disponibles dentro de cada módulo.</p>
  <div class="tabla-scroll"><table class="tabla">
    <thead><tr><th>Opción del menú</th><th>Abre con</th><th>Acciones dentro</th><th>Administrativo</th><th>Profesor</th><th>Estudiante</th></tr></thead>
    <tbody>${MENU.map(m => `<tr>
      <td><strong>${txt(m.menu)}</strong></td>
      <td><span class="perm ok">${txt(m.acceso.split('.')[1])}</span><br><small style="color:var(--texto-suave)">${txt(m.acceso)}</small></td>
      <td>${m.acciones.map(a => `<span class="perm ok" style="margin:1px">${txt(a.split('.')[1])}</span>`).join(' ')}</td>
      ${['Administrativo', 'Profesor', 'Estudiante'].map(rol => {
        const s = sets[rol] || new Set();
        return `<td>${m.acciones.map(a => {
          const accion = a.split('.')[1];
          return s.has(a)
            ? `<span class="perm ok" style="margin:1px">✓ ${txt(accion)}</span>`
            : `<span class="perm no" style="margin:1px">— ${txt(accion)}</span>`;
        }).join(' ')}</td>`;
      }).join('')}
    </tr>`).join('')}</tbody></table></div>`;
}

async function cargarRolesUsuarios() {  const div = $('rolesUsuarios');
  try {
    const usuarios = await apiRequest('/usuarios');
    div.innerHTML = `<table class="tabla"><thead><tr>
      <th>ID</th><th>Usuario</th><th>Roles (perfiles)</th><th>Estado</th><th>Último acceso</th></tr></thead>
      <tbody>${usuarios.map(u => `<tr><td>${u.id_usuario}</td><td><strong>${txt(u.nombre_usuario)}</strong><br><small>${txt(u.correo || '')}</small></td>
        <td>${(u.roles || []).map(r => `<span class="chip">${txt(r.nombre)}</span>`).join(' ')}</td>
        <td>${estadoActivo(u.activo)}</td><td>${fmtFecha(u.ultimo_acceso)}</td></tr>`).join('')}</tbody></table>`;
  } catch (e) {
    div.innerHTML = `<p class="error">${txt(e.message)}</p>`;
  }
}

async function abrirModalRol(r) {
  const ROLES_BASE = ['Administrativo', 'Profesor', 'Estudiante'];
  const esBase = r && ROLES_BASE.includes(r.nombre);
  $('modalRolTitulo').textContent = r ? `Editar permisos de ${r.nombre} #${r.id_rol}` : 'Nuevo rol';
  $('rolId').value = r ? r.id_rol : '';
  $('rolNombre').value = r ? r.nombre : '';
  $('rolNombre').readOnly = !!esBase;
  $('rolNombre').title = esBase ? 'Los roles base no se renombran (el sistema valida por nombre), pero sí sus permisos.' : '';
  $('rolDescripcion').value = r && r.descripcion ? r.descripcion : '';
  const cont = $('rolPermisos');
  cont.innerHTML = '<p>Cargando permisos…</p>';
  const errEl = $('rolError');
  errEl.classList.add('hidden');
  errEl.textContent = '';
  if (!document.getElementById('rolAviso')) {
    const aviso = document.createElement('p');
    aviso.id = 'rolAviso';
    aviso.className = 'aviso-auto';
    aviso.innerHTML = '✓ marca / desmarca los permisos y Guarda. Los roles base no se eliminan ni renombran, pero sí se les cambian permisos. El cambio aplica al próximo inicio de sesión.';
    cont.parentElement.insertBefore(aviso, cont);
  }
  $('modalRol').classList.remove('hidden');
  try {
    const modulos = await apiRequest('/roles/permisos');
    const actuales = new Set();
    if (r) {
      for (const mod of Object.keys(r.permisos || {})) {
        for (const p of r.permisos[mod]) actuales.add(p.nombre);
      }
    }
    cont.innerHTML = '';
    for (const mod of Object.keys(modulos)) {
      const h = document.createElement('h4');
      h.textContent = mod;
      h.style.cssText = 'width:100%;color:var(--primario);font-size:.8rem;text-transform:uppercase;margin-top:8px';
      cont.appendChild(h);
      for (const p of modulos[mod]) {
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.value = p.nombre;
        if (actuales.has(p.nombre)) cb.checked = true;
        label.appendChild(cb);
        label.appendChild(document.createTextNode(`${p.nombre}`));
        label.title = p.descripcion || '';
        cont.appendChild(label);
      }
    }
  } catch (e) {
    cont.innerHTML = `<p class="error">${txt(e.message)}</p>`;
  }
}

function cerrarModalRol() { $('modalRol').classList.add('hidden'); }

async function guardarRol(e) {
  e.preventDefault();
  const id = $('rolId').value;
  const permisos = Array.from($$('#rolPermisos input[type=checkbox]:checked')).map(c => c.value);
  const body = { nombre: $('rolNombre').value.trim(), descripcion: $('rolDescripcion').value.trim() || null, permisos };
  try {
    if (id) await apiRequest('/roles/' + id, 'PUT', body);
    else await apiRequest('/roles', 'POST', body);
  } catch (err) {
    const el = $('rolError'); el.textContent = err.message; el.classList.remove('hidden'); return;
  }
  cerrarModalRol();
  loadRoles();
}

// ---------------------------------------------------------------------
// PERFIL
// ---------------------------------------------------------------------
function loadPerfil() {
  const cont = $('contenedorPerfil');
  const roles = (usuario.roles || []).map(r => `<span class="chip">${txt(r)}</span>`).join('');
  cont.innerHTML = `
    <div class="perfil-info">
      <p><b>Usuario</b> ${txt(usuario.nombre_usuario)}</p>
      <p><b>Nombre</b> ${txt(usuario.nombres || '—')} ${txt(usuario.apellidos || '')}</p>
      <p><b>Correo</b> ${txt(usuario.correo || '—')}</p>
      <p><b>Roles</b> ${roles || '—'}</p>
      <p><b>Último acceso</b> ${fmtFecha(usuario.ultimo_acceso)}</p>
      <p><b>Estado</b> ${usuario.activo ? 'Activo' : 'Inactivo'}</p>
    </div>
    <h3 style="margin:14px 0 8px">Mis permisos de acción</h3>
    ${resumenPermisosPerfil()}
    <p class="aviso-auto" style="margin-top:8px">✓ concedido · en gris no concedido. Cada botón del sistema vuelve a validar el permiso en el backend.</p>
    <form id="formCambiarClave" style="margin-top:18px;padding-top:14px;border-top:1px solid var(--borde, #ddd);max-width:420px">
      <b>Cambiar contraseña</b>
      <input type="password" id="pfActual" placeholder="Contraseña actual" required>
      <input type="password" id="pfNueva" placeholder="Nueva contraseña (mín. 6)" required>
      <input type="password" id="pfConfirma" placeholder="Confirmar nueva contraseña" required>
      <button type="submit" class="btn">Guardar contraseña</button>
      <span id="msgPerfil"></span>
    </form>`;
  document.getElementById('formCambiarClave').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const msg = document.getElementById('msgPerfil');
    const nueva = document.getElementById('pfNueva').value;
    if (nueva !== document.getElementById('pfConfirma').value) {
      msg.textContent = 'Las contraseñas no coinciden.'; msg.style.color = 'var(--peligro, #c00)'; return;
    }
    try {
      await apiRequest('/auth/cambiar-contrasena', 'POST', {
        contrasena_actual: document.getElementById('pfActual').value,
        contrasena_nueva: nueva
      });
      msg.textContent = 'Contraseña actualizada.'; msg.style.color = 'var(--exito, #080)';
      ev.target.reset();
    } catch (e) {
      msg.textContent = e.message; msg.style.color = 'var(--peligro, #c00)';
    }
  });
}

init();