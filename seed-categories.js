const db = require('./database');

const categories = [
    // Business Categories
    { name: 'Restaurantes', type: 'business' },
    { name: 'Farmacias', type: 'business' },
    { name: 'Supermercados', type: 'business' },
    { name: 'Ferreterías', type: 'business' },
    { name: 'Mascotas', type: 'business' },
    { name: 'Tecnología', type: 'business' },

    // Product Categories
    { name: 'Comida Rápida', type: 'product' },
    { name: 'Bebidas', type: 'product' },
    { name: 'Medicamentos', type: 'product' },
    { name: 'Cuidado Personal', type: 'product' },
    { name: 'Hogar', type: 'product' },
    { name: 'Electrónica', type: 'product' }
];

db.serialize(() => {
    const stmt = db.prepare("INSERT INTO categories (name, type) VALUES (?, ?)");
    categories.forEach(cat => {
        stmt.run(cat.name, cat.type);
    });
    stmt.finalize();
    console.log('Categories seeded successfully');
});
