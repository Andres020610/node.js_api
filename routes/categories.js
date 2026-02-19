const express = require('express');
const router = express.Router();
const db = require('../database');
const { verifyToken, isAdmin } = require('../middleware/auth');

// Get all categories (Public)
router.get('/', (req, res) => {
    const { type } = req.query;
    let sql = `SELECT * FROM categories WHERE active = 1`;
    let params = [];

    if (type) {
        sql += ` AND type = ?`;
        params.push(type);
    }

    sql += ` ORDER BY name ASC`;

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Admin: Get all categories (including inactive)
router.get('/admin', verifyToken, isAdmin, (req, res) => {
    const sql = `SELECT * FROM categories ORDER BY type ASC, name ASC`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Admin: Create category
router.post('/', verifyToken, isAdmin, (req, res) => {
    const { name, type } = req.body;
    if (!name || !type) {
        return res.status(400).json({ error: 'Name and type are required' });
    }

    const sql = `INSERT INTO categories (name, type) VALUES (?, ?)`;
    db.run(sql, [name, type], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name, type, active: 1 });
    });
});

// Admin: Update category
router.put('/:id', verifyToken, isAdmin, (req, res) => {
    const { name, type, active } = req.body;
    const sql = `UPDATE categories SET name = ?, type = ?, active = ? WHERE id = ?`;
    db.run(sql, [name, type, active, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Category updated successfully' });
    });
});

// Admin: Delete category
router.delete('/:id', verifyToken, isAdmin, (req, res) => {
    const sql = `DELETE FROM categories WHERE id = ?`;
    db.run(sql, [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Category deleted successfully' });
    });
});

module.exports = router;
