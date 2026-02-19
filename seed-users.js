const bcrypt = require('bcryptjs');
const db = require('./database');

const users = [
    { name: 'Admin Delyra', email: 'admin@delyra.com', password: 'password123', role: 'admin' },
    { name: 'Cliente de Prueba', email: 'cliente@test.com', password: 'password123', role: 'client' },
    { name: 'Comerciante de Prueba', email: 'comerciante@test.com', password: 'password123', role: 'merchant' },
    { name: 'Domiciliario de Prueba', email: 'domi@test.com', password: 'password123', role: 'delivery' }
];

async function seed() {
    console.log('--- Iniciando creación de usuarios de prueba ---');

    for (const user of users) {
        const hash = bcrypt.hashSync(user.password, 8);

        await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET password=excluded.password, role=excluded.role',
                [user.name, user.email, hash, user.role],
                function (err) {
                    if (err) {
                        console.error(`Error creando ${user.role}:`, err.message);
                    } else {
                        console.log(`✅ Usuario ${user.role} listo: ${user.email}`);
                    }
                    resolve();
                }
            );
        });
    }

    console.log('--- Proceso terminado ---');
    process.exit();
}

seed();
