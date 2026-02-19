const express = require('express');
const router = express.Router();
const db = require('../database');
const jwt = require('jsonwebtoken');

const SECRET_KEY = 'supersecretkey_change_in_production';

const { verifyToken } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Get all businesses (Public)
router.get('/', (req, res) => {
    const { category, search } = req.query;
    let sql = `
        SELECT b.*, 
               AVG(r.rating) as average_rating, 
               COUNT(r.id) as total_reviews
        FROM businesses b
        LEFT JOIN reviews r ON b.id = r.business_id
        WHERE b.status = 'approved'
    `;
    let params = [];

    if (search) {
        sql += ` AND (b.name LIKE ? OR b.description LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
    }
    if (category) {
        sql += ` AND b.category = ?`;
        params.push(category);
    }

    sql += ` GROUP BY b.id ORDER BY b.name ASC`;

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Admin: Get pending businesses
router.get('/admin/pending', verifyToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });

    db.all(`SELECT b.*, u.name as owner_name FROM businesses b JOIN users u ON b.owner_id = u.id WHERE b.status = 'pending'`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get my business (Merchant)
router.get('/my-business', verifyToken, (req, res) => {
    if (req.user.role !== 'merchant') return res.status(403).json({ error: 'Access denied' });

    const sql = `SELECT * FROM businesses WHERE owner_id = ?`;
    db.get(sql, [req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Business not found' });
        res.json(row);
    });
});

// Create Business (Merchant)
router.post('/', verifyToken, upload.single('image'), (req, res) => {
    if (req.user.role !== 'merchant') return res.status(403).json({ error: 'Access denied' });

    let { name, description, category, address, phone, image_url } = req.body;

    if (req.file) {
        image_url = `http://localhost:3000/uploads/${req.file.filename}`;
    }

    const sql = `INSERT INTO businesses (owner_id, name, description, category, address, phone, image_url, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`;

    db.run(sql, [req.user.id, name, description, category, address, phone, image_url], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Business created, pending approval', businessId: this.lastID, image_url });
    });
});

// Update Business
router.put('/:id', verifyToken, upload.single('image'), (req, res) => {
    let { name, description, category, address, phone, image_url } = req.body;

    if (req.file) {
        image_url = `http://localhost:3000/uploads/${req.file.filename}`;
    }

    // Check ownership
    db.get(`SELECT owner_id FROM businesses WHERE id = ?`, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Business not found' });

        if (row.owner_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const sql = `UPDATE businesses SET name=?, description=?, category=?, address=?, phone=?, image_url=? WHERE id=?`;
        db.run(sql, [name, description, category, address, phone, image_url, req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Business updated successfully', image_url });
        });
    });
});

// Admin: Approve/Reject business
router.patch('/:id/status', verifyToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    db.run(`UPDATE businesses SET status = ? WHERE id = ?`, [status, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Business ${status} successfully` });
    });
});

module.exports = router;
