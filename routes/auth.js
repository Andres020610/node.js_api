
const express = require('express');
const router = express.Router();
const db = require('../database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { logActivity } = require('../utils/logger');
const uploadDocs = require('../middleware/uploadDocs');

const SECRET_KEY = 'supersecretkey_change_in_production';

router.post('/register', uploadDocs.array('documents', 5), (req, res) => {
    const { name, email, password, role, phone, address } = req.body;

    if (!name || !email || !password || !role) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const hashedPassword = bcrypt.hashSync(password, 8);

    const status = (role === 'delivery' || role === 'merchant') ? 'pending' : 'active';

    const sql = `INSERT INTO users (name, email, password, role, phone, address, status) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const params = [name, email, hashedPassword, role, phone, address, status];

    db.run(sql, params, function (err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: 'Email already exists' });
            }
            return res.status(500).json({ error: err.message });
        }

        const userId = this.lastID;

        if (role === 'delivery' && req.files && req.files.length > 0) {
            const docSql = `INSERT INTO delivery_documents (user_id, document_type, file_url) VALUES (?, ?, ?)`;

            req.files.forEach(file => {
                const fileUrl = `https://node-js-api-k4a8.onrender.com/uploads/${file.filename}`;
                const docType = file.originalname.split('.')[0] || 'Document';
                db.run(docSql, [userId, docType, fileUrl]);
            });
        }

        logActivity(userId, 'REGISTER', `User ${name} registered as ${role} (Status: ${status})`, req);
        res.status(201).json({
            message: role === 'delivery' ? 'Registro exitoso. Tu cuenta está en revisión.' : 'User created successfully',
            userId: userId
        });
    });
});

router.post('/login', (req, res) => {
    console.log('Login attempt:', req.body);
    const { email, password } = req.body;

    const sql = `SELECT * FROM users WHERE email = ?`;
    db.get(sql, [email], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const passwordIsValid = bcrypt.compareSync(password, user.password);
        if (!passwordIsValid) return res.status(401).json({ token: null, error: 'Invalid Password' });

        if (user.status !== 'active') {
            let errorMsg = 'Tu cuenta no está activa.';
            if (user.status === 'pending') errorMsg = 'Tu cuenta está pendiente de aprobación.';
            if (user.status === 'suspended') errorMsg = 'Tu cuenta ha sido suspendida.';
            if (user.status === 'rejected') errorMsg = 'Tu solicitud de registro ha sido rechazada.';

            return res.status(403).json({ error: errorMsg });
        }

        const token = jwt.sign({ id: user.id, role: user.role }, SECRET_KEY, {
            expiresIn: 86400
        });

        logActivity(user.id, 'LOGIN', `User logged in: ${user.email}`, req);
        res.status(200).json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            accessToken: token
        });
    });
});

router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email es requerido' });
    }

    const sql = `SELECT id, name, email FROM users WHERE email = ?`;
    db.get(sql, [email], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });

        if (!user) {
            return res.json({ message: 'Si el email existe, recibirás instrucciones de recuperación' });
        }

        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');

        const expiresAt = new Date(Date.now() + 3600000).toISOString();

        const insertSql = `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`;
        db.run(insertSql, [user.id, token, expiresAt], async function (err) {
            if (err) {
                console.error('Error saving reset token:', err);
                return res.status(500).json({ error: 'Error al procesar solicitud' });
            }

            try {
                const { sendPasswordResetEmail } = require('../utils/email');
                await sendPasswordResetEmail(user.email, token, user.name);

                logActivity(user.id, 'PASSWORD_RESET_REQUESTED', `Password reset requested for ${user.email}`, req);
                res.json({ message: 'Si el email existe, recibirás instrucciones de recuperación' });
            } catch (emailError) {
                console.error('Error sending email:', emailError);
                db.run(`DELETE FROM password_reset_tokens WHERE id = ?`, [this.lastID]);
                return res.status(500).json({ error: 'Error al enviar correo de recuperación' });
            }
        });
    });
});

router.post('/reset-password', (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token y nueva contraseña son requeridos' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const sql = `
        SELECT prt.*, u.email, u.name 
        FROM password_reset_tokens prt
        JOIN users u ON prt.user_id = u.id
        WHERE prt.token = ? AND prt.used = 0 AND prt.expires_at > datetime('now')
    `;

    db.get(sql, [token], (err, resetToken) => {
        if (err) return res.status(500).json({ error: err.message });

        if (!resetToken) {
            return res.status(400).json({ error: 'Token inválido o expirado' });
        }

        const hashedPassword = bcrypt.hashSync(newPassword, 8);

        const updateSql = `UPDATE users SET password = ? WHERE id = ?`;
        db.run(updateSql, [hashedPassword, resetToken.user_id], function (err) {
            if (err) return res.status(500).json({ error: err.message });

            db.run(`UPDATE password_reset_tokens SET used = 1 WHERE id = ?`, [resetToken.id]);

            logActivity(resetToken.user_id, 'PASSWORD_RESET', `Password reset completed for ${resetToken.email}`, req);
            res.json({ message: 'Contraseña actualizada exitosamente' });
        });
    });
});

module.exports = router;

