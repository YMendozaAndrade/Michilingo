// Cliente Redis - credenciales de autenticación (usuario + contraseña).
// Según parcial: en Redis SOLO están los usuarios ACTIVOS y aquí se valida
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

// Alta / actualización: registra o actualiza al usuario activo en Redis.
async function guardarCredencial(nombre_usuario, id_usuario, hashContrasena) {
  const c = await conectarRedis();
  await c.hSet(claveCred(nombre_usuario), { id_usuario: String(id_usuario), contrasena: hashContrasena });
}

// Baja: elimina al usuario de Redis (desactivado -> no puede autenticar).
async function eliminarCredencial(nombre_usuario) {
  const c = await conectarRedis();
  await c.del(claveCred(nombre_usuario));
}

// Renombre: mueve la credencial a la nueva clave.
async function renombrarCredencial(anterior, nuevo) {
  if (anterior === nuevo) return;
  const c = await conectarRedis();
  const datos = await c.hGetAll(claveCred(anterior));
  if (datos && datos.contrasena) {
    await c.hSet(claveCred(nuevo), datos);
  }
  await c.del(claveCred(anterior));
}

// Lectura para login: devuelve { id_usuario, contrasena } o null.
async function leerCredencial(nombre_usuario) {
  const c = await conectarRedis();
  const datos = await c.hGetAll(claveCred(nombre_usuario));
  return credencialAPlano(datos);
}

module.exports = {
  conectarRedis,
  guardarCredencial,
  eliminarCredencial,
  renombrarCredencial,
  leerCredencial,
  claveCred,
  PREFIX
};
