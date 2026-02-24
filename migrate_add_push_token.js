// Script para agregar la columna push_token a la tabla users
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'delyra.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run('ALTER TABLE users ADD COLUMN push_token TEXT', (err) => {
    if (err && !err.message.includes('duplicate')) {
      console.error('Error al agregar columna push_token:', err.message);
    } else {
      console.log('Columna push_token agregada (o ya existía)');
    }
  });
});

db.close();
