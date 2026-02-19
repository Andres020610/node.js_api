const express = require('express');
const router = express.Router();
const db = require('../database');
const jwt = require('jsonwebtoken');

const { verifyToken } = require('../middleware/auth');

// Get user's notifications
router.get('/', verifyToken, (req, res) => {
    const sql = `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`;
    db.all(sql, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get unread count
router.get('/unread-count', verifyToken, (req, res) => {
    const sql = `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0`;
    db.get(sql, [req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ count: row.count });
    });
});

// Mark single notification as read
router.put('/:id/read', verifyToken, (req, res) => {
    const sql = `UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`;
    db.run(sql, [req.params.id, req.user.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Marked as read' });
    });
});

// Mark all as read
router.put('/read-all', verifyToken, (req, res) => {
    const sql = `UPDATE notifications SET read = 1 WHERE user_id = ?`;
    db.run(sql, [req.user.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'All notifications marked as read', count: this.changes });
    });
});

// Get Notification Preferences
router.get('/preferences', verifyToken, (req, res) => {
    const defaultPrefs = [
        { type: 'order_updates', label: 'Actualizaciones de Pedidos', enabled: 1 },
        { type: 'chat_messages', label: 'Mensajes de Chat', enabled: 1 },
        { type: 'promotions', label: 'Promociones y Ofertas', enabled: 1 },
        { type: 'new_order', label: 'Nuevos Pedidos (Comerciantes)', enabled: 1 }
    ];

    db.all(`SELECT pref_type, enabled FROM user_notification_preferences WHERE user_id = ?`, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const prefsMap = {};
        rows.forEach(r => prefsMap[r.pref_type] = r.enabled);

        const result = defaultPrefs.map(p => ({
            ...p,
            enabled: prefsMap.hasOwnProperty(p.type) ? prefsMap[p.type] : 1 // Default to enabled
        }));

        res.json(result);
    });
});

// Update Notification Preferences
router.put('/preferences', verifyToken, (req, res) => {
    const { type, enabled } = req.body;

    // Use REPLACE INTO to insert or update
    const sql = `REPLACE INTO user_notification_preferences (user_id, pref_type, enabled) VALUES (?, ?, ?)`;
    db.run(sql, [req.user.id, type, enabled ? 1 : 0], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Preference updated' });
    });
});

// Helper function to create notification (exported for use in other routes)
async function createNotification(userId, type, title, message, referenceId = null) {
    return new Promise((resolve, reject) => {
        // FIRST: Check if user has disabled this notification type
        // Map types to simpler categories if needed, or use direct types
        let prefType = type;
        if (['order_ready', 'order_update'].includes(type)) prefType = 'order_updates';

        db.get(`SELECT enabled FROM user_notification_preferences WHERE user_id = ? AND pref_type = ?`, [userId, prefType], (err, row) => {
            // If row exists and enabled is 0, DO NOT create notification
            if (row && row.enabled === 0) {
                // specific preference found and disabled
                return resolve(null); // Silent skip
            }

            // Otherwise create it (default is enabled)
            const sql = `INSERT INTO notifications (user_id, type, title, message, reference_id) VALUES (?, ?, ?, ?, ?)`;
            db.run(sql, [userId, type, title, message, referenceId], function (err) {
                if (err) {
                    console.error('Error creating notification:', err.message);
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    });
}

// Export both router and helper function
module.exports = router;
module.exports.createNotification = createNotification;
