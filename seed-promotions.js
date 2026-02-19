const db = require('./database');

async function seedPromotions() {
    console.log('--- Creando Promociones de Prueba ---');

    // 1. Create a 10% discount coupon
    db.run(`INSERT OR IGNORE INTO coupons (code, discount_type, discount_value, min_purchase, active) 
            VALUES ('DESC10', 'percentage', 10, 0, 1)`, (err) => {
        if (!err) console.log('✅ Cupón DESC10 creado (10%)');
    });

    // 2. Create a $5 fixed discount coupon
    db.run(`INSERT OR IGNORE INTO coupons (code, discount_type, discount_value, min_purchase, active) 
            VALUES ('BIENVENIDA', 'fixed', 500, 1000, 1)`, (err) => {
        if (!err) console.log('✅ Cupón BIENVENIDA creado ($500 off en total > 1000)');
    });

    // 3. Add some discount prices to random products
    db.run(`UPDATE products SET discount_price = price * 0.8 WHERE id IN (SELECT id FROM products ORDER BY RANDOM() LIMIT 3)`, (err) => {
        if (!err) console.log('✅ Descuentos aplicados a 3 productos aleatorios');
    });

    setTimeout(() => {
        process.exit();
    }, 2000);
}

seedPromotions();
