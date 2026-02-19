const db = require('../database');

function logActivity(userId, action, details = null, req = null) {
    const ipAddress = req ? req.ip || req.headers['x-forwarded-for'] : null;
    const sql = `INSERT INTO activity_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)`;

    db.run(sql, [userId, action, details, ipAddress], (err) => {
        if (err) {
            console.error('Error recording activity log:', err);
        }
    });
}

module.exports = { logActivity };
