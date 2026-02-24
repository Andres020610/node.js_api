const express = require('express');
const router = express.Router();
const db = require('../database');
const jwt = require('jsonwebtoken');
const admin = require('./firebase'); // Asegúrate de haber creado este archivo con el paso anterior

const { verifyToken } = require('../middleware/auth');

// ... (Tus rutas GET y PUT se mantienen iguales) ...

// Helper function to create notification (MODIFICADA PARA PUSH)
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

                    // --- INICIO DE LÓGICA PUSH ---
                    // Buscamos si el usuario tiene un token de Firebase registrado
                    db.get(`SELECT push_token FROM users WHERE id = ?`, [userId], (err, user) => {
                        if (!err && user && user.push_token) {
                            const messagePayload = {
                                notification: {
                                    title: title,
                                    body: message
                                },
                                // Puedes enviar datos extra como el ID de la notificación o el pedido
                                data: {
                                    notificationId: notificationId.toString(),
                                    referenceId: referenceId ? referenceId.toString() : ""
                                },
                                token: user.push_token
                            };

                            // Enviar a Firebase
                            admin.messaging().send(messagePayload)
                                .then(response => console.log('Push enviado con éxito:', response))
                                .catch(error => console.log('Error enviando Push:', error));
                        }
                    });
                    // --- FIN DE LÓGICA PUSH ---

                    resolve(notificationId);
                }
            });
        });
    });
}

// Export both router and helper function
module.exports = router;
module.exports.createNotification = createNotification;