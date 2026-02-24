const express = require('express');
const router = express.Router();
const db = require('../database');
const jwt = require('jsonwebtoken');
const admin = require('./firebase'); // <- Importante para las notificaciones push
const { verifyToken } = require('../middleware/auth');

// --- RUTAS QUE FALTABAN ---

// GET /api/notifications - Obtener todas las notificaciones del usuario
router.get('/', verifyToken, (req, res) => {
    const sql = `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`;
    db.all(sql, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// GET /api/notifications/unread-count - Contar notificaciones no leídas
router.get('/unread-count', verifyToken, (req, res) => {
    const sql = `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0`;
    db.get(sql, [req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ count: row.count });
    });
});

// PUT /api/notifications/:id/read - Marcar una como leída
router.put('/:id/read', verifyToken, (req, res) => {
    const sql = `UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`;
    db.run(sql, [req.params.id, req.user.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Marked as read' });
    });
});

// PUT /api/notifications/read-all - Marcar todas como leídas
router.put('/read-all', verifyToken, (req, res) => {
    const sql = `UPDATE notifications SET read = 1 WHERE user_id = ?`;
    db.run(sql, [req.user.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'All notifications marked as read', count: this.changes });
    });
});

// GET /api/notifications/preferences - Obtener preferencias
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
        const result = defaultPrefs.map(p => ({ ...p, enabled: prefsMap.hasOwnProperty(p.type) ? prefsMap[p.type] : 1 }));
        res.json(result);
    });
});

// PUT /api/notifications/preferences - Actualizar preferencias
router.put('/preferences', verifyToken, (req, res) => {
    const { type, enabled } = req.body;
    const sql = `REPLACE INTO user_notification_preferences (user_id, pref_type, enabled) VALUES (?, ?, ?)`;
    db.run(sql, [req.user.id, type, enabled ? 1 : 0], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Preference updated' });
    });
});


// --- FUNCIÓN MEJORADA CON NOTIFICACIONES PUSH ---

async function createNotification(userId, type, title, message, referenceId = null) {
    return new Promise((resolve, reject) => {
        let prefType = type;
        if (['order_ready', 'order_update'].includes(type)) prefType = 'order_updates';

        db.get(`SELECT enabled FROM user_notification_preferences WHERE user_id = ? AND pref_type = ?`, [userId, prefType], (err, row) => {
            if (row && row.enabled === 0) {
                return resolve(null); 
            }

            const sql = `INSERT INTO notifications (user_id, type, title, message, reference_id) VALUES (?, ?, ?, ?, ?)`;
            db.run(sql, [userId, type, title, message, referenceId], function (err) {
                if (err) {
                    console.error('Error creating notification:', err.message);
                    reject(err);
                } else {
                    const notificationId = this.lastID;

                    // Lógica para enviar la notificación PUSH
                    db.get(`SELECT push_token FROM users WHERE id = ?`, [userId], (err, user) => {
                        if (!err && user && user.push_token) {
                            const messagePayload = {
                                notification: { title, body: message },
                                data: {
                                    notificationId: notificationId.toString(),
                                    referenceId: referenceId ? referenceId.toString() : ""
                                },
                                token: user.push_token
                            };
                            
                            admin.messaging().send(messagePayload)
                                .then(response => console.log('Push enviado con éxito:', response))
                                .catch(error => console.log('Error enviando Push:', error));
                        }
                    });
                    
                    resolve(notificationId);
                }
            });
        });
    });
}

// Exportar el router y la función
module.exports = router;
module.exports.createNotification = createNotification;