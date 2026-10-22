// Cliente Redis - credenciales de autenticación (usuario + contraseña).
// en Redis SOLO están los usuarios ACTIVOS y aquí se valida
// usuario/contraseña. Roles, permisos y menú siguen en MySQL.
// Clave por usuario: michilingo:cred:{nombre_usuario} -> hash { id_usuario, contrasena }
const { createClient } = require('redis');
const config = require('./config');

const PREFIX = 'michilingo:cred:';

const client = createClient({ url: config.redis.url });
client.on('error', (err) => console.error('[redis] error:', err.message));

let conectado = false;
async function conectarRedis() {
  if (conectado) return client;
  await client.connect();
  conectado = true;
  console.log('[redis] conectado a', config.redis.url);
  return client;
}

const claveCred = (nombre_usuario) => PREFIX + String(nombre_usuario);

function credencialAPlano(obj) {
  if (!obj || !obj.contrasena) return null;
  return {
    id_usuario: Number(obj.id_usuario),
    contrasena: String(obj.contrasena)
  };
}

// actualización: registra o actualiza al usuario activo en Redis.
async function guardarCredencial(nombre_usuario, id_usuario, hashContrasena) {
  const c = await conectarRedis();
  await c.hSet(claveCred(nombre_usuario), 
  {  
    id_usuario: String(id_usuario), 
    contrasena: hashContrasena 
  });
}

// elimina al usuario de Redis (desactivado -> no puede autenticar).
async function eliminarCredencial(nombre_usuario) {
  const c = await conectarRedis();
  await c.del(claveCred(nombre_usuario));
}

//  mueve la credencial a la nueva clave.
async function renombrarCredencial(anterior, nuevo) {
  if (anterior === nuevo) return;
  const c = await conectarRedis();
  const datos = await c.hGetAll(claveCred(anterior));
  if (datos && datos.contrasena) {
    await c.hSet(claveCred(nuevo), datos);
  }
  await c.del(claveCred(anterior));
}

// devuelve { id_usuario, contrasena } o null.
async function leerCredencial(nombre_usuario) {
  const c = await conectarRedis();
  const datos = await c.hGetAll(claveCred(nombre_usuario));
  return credencialAPlano(datos);
}

// ---------------------------------------------------------------------
// Sesiones vivas: la llave ES el usuario -> GET directo sin buscar nada:
//   GET michilingo:ses:admin  ->  {"id_usuario":1,"nombre_usuario":"admin",...}
// Una sesión por usuario (el nuevo login refresca la anterior). TTL 8h.
// ---------------------------------------------------------------------
const SES_PREFIX = 'michilingo:ses:';
const SES_TTL_SEG = 8 * 3600;

async function guardarSesion( id_usuario, nombre_usuario, roles, permisos) {
  const c = await conectarRedis();
  const datos = JSON.stringify({
    id_usuario: Number(id_usuario),
    nombre_usuario: String(nombre_usuario),
    roles: roles || [],
    permisos: permisos || [],
    inicio: new Date().toISOString()
  });
  await c.setEx(SES_PREFIX + String(nombre_usuario), SES_TTL_SEG, datos);
}

async function eliminarSesion(nombre_usuario) {
  if (!nombre_usuario) return;
  const c = await conectarRedis();
  await c.del(SES_PREFIX + String(nombre_usuario));
}

async function listarSesiones() {
  const c = await conectarRedis();
  const claves = await c.keys(SES_PREFIX + '*');
  const out = [];
  for (const k of claves) {
    const crudo = await c.get(k);
    if (!crudo) continue;
    let datos;
    try {
      datos = JSON.parse(crudo);
      if (typeof datos !== 'object') datos = { nombre_usuario: String(crudo) };
    } catch (e) {
      datos = { nombre_usuario: String(crudo) };
    }
    const ttl = await c.ttl(k);
    out.push({ ...datos, expira_en_seg: ttl });
  }
  return out;
}

module.exports = {
  conectarRedis,
  guardarCredencial,
  eliminarCredencial,
  renombrarCredencial,
  leerCredencial,
  claveCred,
  PREFIX,
  guardarSesion,
  eliminarSesion,
  listarSesiones
};
