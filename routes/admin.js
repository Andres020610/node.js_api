const express = require('express');
const router = express.Router();
const db = require('../database');
const { verifyToken, isAdmin } = require('../middleware/auth');

// Get global admin stats
router.get('/stats', verifyToken, isAdmin, async (req, res) => {
    try {
        const getCount = (sql) => {
            return new Promise((resolve, reject) => {
                db.get(sql, [], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        };

        const [pending, users, coupons, revenue, businesses] = await Promise.all([
            getCount("SELECT COUNT(*) as count FROM businesses WHERE status = 'pending'"),
            getCount("SELECT COUNT(*) as count FROM users"),
            getCount("SELECT COUNT(*) as count FROM coupons WHERE active = 1"),
            getCount("SELECT SUM(total_amount) as total FROM orders WHERE status = 'delivered'"),
            getCount("SELECT COUNT(*) as count FROM businesses WHERE status = 'approved'")
        ]);

        const stats = {
            pendingBusinesses: pending?.count || 0,
            totalUsers: users?.count || 0,
            activeCoupons: coupons?.count || 0,
            totalRevenue: revenue?.total || 0,
            totalBusinesses: businesses?.count || 0
        };

        console.log('Real-time Admin Stats:', stats);
        res.json(stats);
    } catch (err) {
        console.error('Error fetching admin stats:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get Sales Report (last 30 days)
router.get('/reports/sales', verifyToken, isAdmin, (req, res) => {
    const sql = `
        SELECT DATE(created_at) as date, SUM(total_amount) as amount, COUNT(*) as count 
        FROM orders 
        WHERE status = 'delivered' 
        AND created_at >= date('now', '-30 days')
        GROUP BY DATE(created_at)
        ORDER BY date ASC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get Top Businesses
router.get('/reports/top-businesses', verifyToken, isAdmin, (req, res) => {
    const sql = `
        SELECT b.name, SUM(o.total_amount) as total_sales, COUNT(o.id) as order_count
        FROM businesses b
        JOIN orders o ON b.id = o.business_id
        WHERE o.status = 'delivered'
        GROUP BY b.id
        ORDER BY total_sales DESC
        LIMIT 5
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get Activity Logs
router.get('/audit/logs', verifyToken, isAdmin, (req, res) => {
    const sql = `
        SELECT l.*, u.name as user_name, u.email as user_email
        FROM activity_logs l
        LEFT JOIN users u ON l.user_id = u.id
        ORDER BY l.created_at DESC
        LIMIT 50
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get Pending Delivery Drivers
router.get('/delivery/pending', verifyToken, isAdmin, (req, res) => {
    const sql = `SELECT id, name, email, phone, address, created_at FROM users WHERE role = 'delivery' AND status = 'pending'`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get Delivery Driver Documents
router.get('/delivery/:id/documents', verifyToken, isAdmin, (req, res) => {
    const sql = `SELECT * FROM delivery_documents WHERE user_id = ?`;
    db.all(sql, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Approve/Reject Delivery Driver
router.patch('/delivery/:id/status', verifyToken, isAdmin, (req, res) => {
    const { status } = req.body;
    if (!['active', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    const sql = `UPDATE users SET status = ? WHERE id = ? AND role = 'delivery'`;
    db.run(sql, [status, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Delivery driver ${status} successfully` });
    });
});

module.exports = router;
