const express = require('express');
const router = express.Router();
const db = require('../database');
const { verifyToken, isAdmin } = require('../middleware/auth');

const { sendPushNotification } = require('../utils/push');
// Guardar token FCM
router.post('/fcm-token', verifyToken, (req, res) => {
    const userId = req.user.id;
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ error: 'FCM token is required' });
    const sql = `UPDATE users SET fcm_token = ? WHERE id = ?`;
    db.run(sql, [fcmToken, userId], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'FCM token saved successfully' });
    });
});

// Endpoint de prueba para enviar notificación push a un usuario
router.post('/send-test-notification', verifyToken, async (req, res) => {
    const userId = req.user.id;
    db.get('SELECT fcm_token FROM users WHERE id = ?', [userId], async (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row || !row.fcm_token) return res.status(400).json({ error: 'No FCM token found for user' });
        try {
            const result = await sendPushNotification(row.fcm_token, '¡Notificación de prueba!', 'Esto es un mensaje de prueba desde el backend.');
            res.json({ message: 'Notificación enviada', result });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
});

// Guardar el token push del usuario autenticado
router.post('/push-token', verifyToken, (req, res) => {
    const userId = req.user.id;
    const { push_token } = req.body;
    if (!push_token) return res.status(400).json({ error: 'push_token es requerido' });
    const sql = `UPDATE users SET push_token = ? WHERE id = ?`;
    db.run(sql, [push_token, userId], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Push token guardado correctamente' });
    });
});

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
