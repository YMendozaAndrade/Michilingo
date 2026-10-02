// Migración inicial: sube a Redis los usuarios ACTIVOS de MySQL.
// Uso: node scripts/migrar_redis.js  (requiere API detenida o no, solo lee MySQL)
const mysql = require('C:\\Users\\andra\\OneDrive\\Documents\\Ingenieria_Informatica\\Sexto semestre\\BD II\\MichiLingo\\backend\\node\\node_modules\\mysql2\\promise');
const { createClient } = require('C:\\Users\\andra\\OneDrive\\Documents\\Ingenieria_Informatica\\Sexto semestre\\BD II\\MichiLingo\\backend\\node\\node_modules\\redis');
require('dotenv').config({ path: 'C:\\Users\\andra\\OneDrive\\Documents\\Ingenieria_Informatica\\Sexto semestre\\BD II\\MichiLingo\\backend\\node\\.env' });

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'Yessica',
    password: process.env.DB_PASSWORD || '2077',
    database: process.env.DB_NAME || 'academia_idiomas',
    charset: 'utf8mb4'
  });
  const redis = createClient({ url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' });
  await redis.connect();
  const [rows] = await db.execute('SELECT id_usuario, nombre_usuario, contrasena FROM usuarios WHERE activo = 1');
  let n = 0;
  for (const u of rows) {
    await redis.hSet('michilingo:cred:' + u.nombre_usuario, { id_usuario: String(u.id_usuario), contrasena: u.contrasena });
    console.log('OK', u.nombre_usuario);
    n++;
  }
  const keys = await redis.keys('michilingo:cred:*');
  console.log(`Migrados ${n}. Claves en Redis:`, keys);
  await redis.quit();
  await db.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
