const express = require('express');
const router = express.Router();
const db = require('../database');
const { verifyToken, isAdmin } = require('../middleware/auth');

// Get all users
router.get('/', verifyToken, isAdmin, (req, res) => {
    console.log('Admin Users request - User info:', req.user);
    const sql = `SELECT id, name, email, role, phone, address, status, created_at FROM users`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Database error in users route:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Update user role
router.patch('/:id/role', verifyToken, isAdmin, (req, res) => {
    const { role } = req.body;
    if (!['admin', 'client', 'merchant', 'delivery'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
    }

    const sql = `UPDATE users SET role = ? WHERE id = ?`;
    db.run(sql, [role, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'User role updated successfully' });
    });
});

// Delete user
router.delete('/:id', verifyToken, isAdmin, (req, res) => {
    if (req.user.id == req.params.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const sql = `DELETE FROM users WHERE id = ?`;
    db.run(sql, [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'User deleted successfully' });
    });
});

// Update user status (Activate/Deactivate/Suspend)
router.patch('/:id/status', verifyToken, isAdmin, (req, res) => {
    const { status } = req.body;
    if (!['active', 'pending', 'suspended', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    if (req.user.id == req.params.id && status !== 'active') {
        return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const sql = `UPDATE users SET status = ? WHERE id = ?`;
    db.run(sql, [status, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ message: `User status updated to ${status}` });
    });
});

// Update own profile
router.put('/profile', verifyToken, (req, res) => {
    const { name, phone, address } = req.body;
    const userId = req.user.id;

    if (!name) return res.status(400).json({ error: 'Name is required' });

    const sql = `UPDATE users SET name = ?, phone = ?, address = ? WHERE id = ?`;
    db.run(sql, [name, phone, address, userId], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Profile updated successfully' });
    });
});

// Get own profile
router.get('/profile', verifyToken, (req, res) => {
    const userId = req.user.id;
    const sql = `SELECT id, name, email, role, phone, address, status, created_at FROM users WHERE id = ?`;
    db.get(sql, [userId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'User not found' });
        res.json(row);
    });
});

module.exports = router;
