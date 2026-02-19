const express = require('express');
const router = express.Router();
const db = require('../database');
const { verifyToken, isAdmin } = require('../middleware/auth');

// Create Review
router.post('/', verifyToken, (req, res) => {
    const { business_id, rating, comment } = req.body;
    const user_id = req.user.id;

    if (!business_id || !rating) {
        return res.status(400).json({ error: 'Business ID and rating are required' });
    }

    if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    // Check if user already reviewed this business
    db.get('SELECT id FROM reviews WHERE user_id = ? AND business_id = ?', [user_id, business_id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) return res.status(400).json({ error: 'You have already reviewed this business' });

        const sql = `INSERT INTO reviews (user_id, business_id, rating, comment) VALUES (?, ?, ?, ?)`;
        db.run(sql, [user_id, business_id, rating, comment], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({
                id: this.lastID,
                user_id,
                business_id,
                rating,
                comment,
                created_at: new Date().toISOString()
            });
        });
    });
});

// Get Reviews for a Business
router.get('/business/:business_id', (req, res) => {
    const sql = `
        SELECT r.*, u.name as user_name 
        FROM reviews r
        JOIN users u ON r.user_id = u.id
        WHERE r.business_id = ?
        ORDER BY r.created_at DESC
    `;
    db.all(sql, [req.params.business_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get Review Stats for a Business
router.get('/stats/:business_id', (req, res) => {
    const sql = `
        SELECT 
            AVG(rating) as average_rating, 
            COUNT(*) as total_reviews 
        FROM reviews 
        WHERE business_id = ?
    `;
    db.get(sql, [req.params.business_id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({
            business_id: req.params.business_id,
            average_rating: row.average_rating ? parseFloat(row.average_rating.toFixed(1)) : 0,
            total_reviews: row.total_reviews || 0
        });
    });
});

// Update Review
router.put('/:id', verifyToken, (req, res) => {
    const { rating, comment } = req.body;
    const user_id = req.user.id;

    if (!rating) return res.status(400).json({ error: 'Rating is required' });
    if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5' });

    // Check ownership
    db.get('SELECT user_id FROM reviews WHERE id = ?', [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Review not found' });
        if (row.user_id !== user_id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const sql = `UPDATE reviews SET rating = ?, comment = ? WHERE id = ?`;
        db.run(sql, [rating, comment, req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Review updated successfully' });
        });
    });
});

// Delete Review
router.delete('/:id', verifyToken, (req, res) => {
    const user_id = req.user.id;

    // Check ownership or admin
    db.get('SELECT user_id FROM reviews WHERE id = ?', [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Review not found' });

        if (row.user_id !== user_id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        db.run('DELETE FROM reviews WHERE id = ?', [req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Review deleted successfully' });
        });
    });
});

module.exports = router;
