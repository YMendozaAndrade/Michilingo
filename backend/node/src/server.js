const express = require('express');
const path = require('path');
const config = require('./config');
const { conectarRedis } = require('./redis');

const app = express();
app.use(express.json());

// Log de peticiones estilo dev: GET /api/roles 200 in 12ms (con color por estado).
app.use((req, res, next) => {
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    const c = res.statusCode >= 500 ? '\x1b[31m' : res.statusCode >= 400 ? '\x1b[33m' : '\x1b[32m';
    console.log(`${req.method} ${req.originalUrl} ${c}${res.statusCode}\x1b[0m in ${ms.toFixed(0)}ms`);
  });
  next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/roles', require('./routes/roles'));
app.use('/api/grupos', require('./routes/grupos'));
app.use('/api/asistencia', require('./routes/asistencia'));
app.use('/api/horas', require('./routes/horas'));
app.use('/api/examenes', require('./routes/examenes'));
app.use('/api/sesiones', require('./routes/sesiones'));
app.use('/api/resumen', require('./routes/resumen'));

const frontendDir = path.join(__dirname, '..', '..', '..', 'frontend');
app.use(express.static(frontendDir));

app.get('/api/health', (req, res) => res.json({ ok: true, servicio: 'michilingo-api' }));

app.listen(config.server.port, async () => {
  console.log(`API Node.js escuchando en http://localhost:${config.server.port}`);
  console.log(`Frontend servido desde ${frontendDir}`);
  try {
    const { pool } = require('./db');
    const redis = await conectarRedis();
    // Auto-reparación: si Redis arrancó vacío (reinicio sin persistir),
    // se recargan los usuarios activos de MySQL. En Redis solo hay activos:
    // se crean los que falten y se borran claves de inactivos/eliminados.
    const [activos] = await pool.execute(
      'SELECT id_usuario, nombre_usuario, contrasena FROM usuarios WHERE activo = 1');
    const dbActivos = new Map(activos.map(u => ['michilingo:cred:' + u.nombre_usuario, u]));
    for (const u of activos) {
      await redis.hSet('michilingo:cred:' + u.nombre_usuario,
        { id_usuario: String(u.id_usuario), contrasena: u.contrasena });
    }
    const claves = await redis.keys('michilingo:cred:*');
    let limpiadas = 0;
    for (const k of claves) {
      if (!dbActivos.has(k)) { await redis.del(k); limpiadas++; }
    }
    console.log(`[redis] sincronizados ${activos.length} activos, limpiadas ${limpiadas} claves obsoletas.`);
  } catch (e) {
    console.error('[redis] no disponible al arrancar:', e.message);
    console.error('[redis] el login responderá 503 hasta que Redis esté arriba.');
  }
});