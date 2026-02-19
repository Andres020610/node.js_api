const bcrypt = require('bcryptjs');
const db = require('./database');

const password = 'admin123';
const hash = bcrypt.hashSync(password, 8);

db.run(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
    ['Administrador', 'admin@delyra.com', hash, 'admin'],
    function (err) {
        if (err) {
            console.log('Error:', err.message);
        } else {
            console.log('Usuario admin creado exitosamente!');
            console.log('ID:', this.lastID);
            console.log('Email: admin@delyra.com');
            console.log('Password: admin123');
        }
        process.exit();
    }
);
