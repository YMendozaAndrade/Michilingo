require('dotenv').config();

module.exports = {
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'academia_idiomas',
    charset: 'utf8mb4'
  },
  server: {
    port: Number(process.env.PORT) || 3000
  },
  token: {
    secret: process.env.TOKEN_SECRET || 'academia-idiomas-secreto-curso',
    expiresIn: '8h'
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
  }
};