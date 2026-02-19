const express = require('express');
const router = express.Router();
const db = require('../database');
const { verifyToken, isAdmin } = require('../middleware/auth');

// Validate Coupon
router.post('/validate-coupon', verifyToken, (req, res) => {
    const { code, cartTotal } = req.body;

    if (!code) return res.status(400).json({ error: 'Código de cupón requerido' });

    const sql = `SELECT * FROM coupons WHERE code = ? AND active = 1`;
    db.get(sql, [code.toUpperCase()], (err, coupon) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!coupon) return res.status(404).json({ error: 'Cupón no válido' });

        const now = new Date();

        // Check start date
        if (coupon.start_date) {
            const startDate = new Date(coupon.start_date);
            if (now < startDate) {
                return res.status(400).json({ error: 'Este cupón aún no está vigente' });
            }
        }

        // Check end date
        if (coupon.end_date) {
            const endDate = new Date(coupon.end_date);
            endDate.setHours(23, 59, 59, 999);
            if (now > endDate) {
                return res.status(400).json({ error: 'El cupón ha expirado' });
            }
        }

        // Check min purchase
        if (cartTotal < coupon.min_purchase) {
            return res.status(400).json({ error: `Compra mínima requerida para este cupón: $${coupon.min_purchase}` });
        }

        // Check if user already used this coupon
        db.get(`SELECT id FROM coupon_usages WHERE coupon_id = ? AND user_id = ?`, [coupon.id, req.user.id], (err, usage) => {
            if (err) return res.status(500).json({ error: err.message });
            if (usage) return res.status(400).json({ error: 'Ya has utilizado este cupón' });

            res.json({
                message: 'Cupón validado correctamente',
                coupon: {
                    id: coupon.id,
                    code: coupon.code,
                    discount_type: coupon.discount_type,
                    discount_value: coupon.discount_value
                }
            });
        });
    });
});

// Admin: Get all coupons
router.get('/coupons', verifyToken, isAdmin, (req, res) => {
    db.all(`SELECT * FROM coupons ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Admin: Create coupon
router.post('/coupons', verifyToken, isAdmin, (req, res) => {
    const { code, discount_type, discount_value, min_purchase, start_date, end_date } = req.body;

    if (!code || !discount_type || !discount_value) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    const sql = `INSERT INTO coupons (code, discount_type, discount_value, min_purchase, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(sql, [code.toUpperCase(), discount_type, discount_value, min_purchase || 0, start_date, end_date], function (err) {
        if (err) {
            if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'El código de cupón ya existe' });
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ message: 'Cupón creado', id: this.lastID });
    });
});

// Admin: Toggle coupon status
router.put('/coupons/:id/toggle', verifyToken, isAdmin, (req, res) => {
    const { active } = req.body;
    const sql = `UPDATE coupons SET active = ? WHERE id = ?`;
    db.run(sql, [active ? 1 : 0, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Estado del cupón actualizado' });
    });
});

// Admin: Delete coupon
router.delete('/coupons/:id', verifyToken, isAdmin, (req, res) => {
    const sql = `DELETE FROM coupons WHERE id = ?`;
    db.run(sql, [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Cupón eliminado correctamente' });
    });
});

// Get recommended products (simple logic: random or based on discount_price)
router.get('/recommendations', (req, res) => {
    // Return products with discount or popular ones
    const sql = `
        SELECT p.*, b.name as business_name 
        FROM products p 
        JOIN businesses b ON p.business_id = b.id 
        WHERE p.available = 1 AND b.status = 'approved'
        ORDER BY (p.discount_price IS NOT NULL) DESC, RANDOM() 
        LIMIT 6
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

module.exports = router;
