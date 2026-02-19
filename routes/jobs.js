const express = require('express');
const router = express.Router();
const db = require('../database');
const jwt = require('jsonwebtoken');
const { createNotification } = require('./notifications');

const { verifyToken, optionalAuth } = require('../middleware/auth');

// Get all active job offers (public)
router.get('/', optionalAuth, (req, res) => {
    const sql = `
        SELECT jo.*, b.name as business_name, b.image_url as business_image
        FROM job_offers jo
        JOIN businesses b ON jo.business_id = b.id
        WHERE jo.status = 'active' AND b.status = 'approved'
        ORDER BY jo.created_at DESC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get merchant's job offers
router.get('/my-offers', verifyToken, (req, res) => {
    if (req.user.role !== 'merchant') {
        return res.status(403).json({ error: 'Only merchants can access this' });
    }

    const sql = `
        SELECT jo.*, 
            (SELECT COUNT(*) FROM job_applications WHERE job_id = jo.id) as application_count
        FROM job_offers jo
        JOIN businesses b ON jo.business_id = b.id
        WHERE b.owner_id = ?
        ORDER BY jo.created_at DESC
    `;
    db.all(sql, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get single job offer
router.get('/:id', optionalAuth, (req, res) => {
    const sql = `
        SELECT jo.*, b.name as business_name, b.image_url as business_image, b.description as business_description
        FROM job_offers jo
        JOIN businesses b ON jo.business_id = b.id
        WHERE jo.id = ?
    `;
    db.get(sql, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Job offer not found' });
        res.json(row);
    });
});

// Create job offer (merchant)
router.post('/', verifyToken, (req, res) => {
    if (req.user.role !== 'merchant') {
        return res.status(403).json({ error: 'Only merchants can post job offers' });
    }

    const { title, description, requirements, salary_range, job_type } = req.body;

    // Get merchant's business
    db.get('SELECT id FROM businesses WHERE owner_id = ?', [req.user.id], (err, business) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!business) return res.status(400).json({ error: 'No business found for this merchant' });

        const sql = `INSERT INTO job_offers (business_id, title, description, requirements, salary_range, job_type) 
                     VALUES (?, ?, ?, ?, ?, ?)`;
        db.run(sql, [business.id, title, description, requirements, salary_range, job_type || 'full_time'], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ message: 'Job offer created', id: this.lastID });
        });
    });
});

// Update job offer (merchant)
router.put('/:id', verifyToken, (req, res) => {
    if (req.user.role !== 'merchant') {
        return res.status(403).json({ error: 'Only merchants can edit job offers' });
    }

    const { title, description, requirements, salary_range, job_type, status } = req.body;
    const sql = `UPDATE job_offers SET title = ?, description = ?, requirements = ?, salary_range = ?, job_type = ?, status = ?
                 WHERE id = ? AND business_id IN (SELECT id FROM businesses WHERE owner_id = ?)`;

    db.run(sql, [title, description, requirements, salary_range, job_type, status, req.params.id, req.user.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Job offer not found or not authorized' });
        res.json({ message: 'Job offer updated' });
    });
});

// Delete job offer (merchant)
router.delete('/:id', verifyToken, (req, res) => {
    if (req.user.role !== 'merchant') {
        return res.status(403).json({ error: 'Only merchants can delete job offers' });
    }

    const sql = `DELETE FROM job_offers 
                 WHERE id = ? AND business_id IN (SELECT id FROM businesses WHERE owner_id = ?)`;
    db.run(sql, [req.params.id, req.user.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Job offer not found or not authorized' });
        res.json({ message: 'Job offer deleted' });
    });
});

// Apply to job offer
router.post('/:id/apply', verifyToken, (req, res) => {
    const { message } = req.body;
    const jobId = req.params.id;

    // Check if already applied
    db.get('SELECT id FROM job_applications WHERE job_id = ? AND user_id = ?', [jobId, req.user.id], (err, existing) => {
        if (err) return res.status(500).json({ error: err.message });
        if (existing) return res.status(400).json({ error: 'Ya te postulaste a esta oferta' });

        const sql = `INSERT INTO job_applications (job_id, user_id, message) VALUES (?, ?, ?)`;
        db.run(sql, [jobId, req.user.id, message], function (err) {
            if (err) return res.status(500).json({ error: err.message });

            // Notify merchant
            db.get(`
                SELECT b.owner_id, jo.title 
                FROM job_offers jo 
                JOIN businesses b ON jo.business_id = b.id 
                WHERE jo.id = ?
            `, [jobId], (err, job) => {
                if (!err && job) {
                    createNotification(
                        job.owner_id,
                        'new_application',
                        'Nueva Postulación',
                        `Alguien se postuló a: ${job.title}`,
                        jobId
                    );
                }
            });

            res.status(201).json({ message: 'Postulación enviada', id: this.lastID });
        });
    });
});

// Get applications for a job offer (merchant)
router.get('/:id/applications', verifyToken, (req, res) => {
    if (req.user.role !== 'merchant') {
        return res.status(403).json({ error: 'Only merchants can view applications' });
    }

    const sql = `
        SELECT ja.*, u.name as applicant_name, u.email as applicant_email, u.phone as applicant_phone
        FROM job_applications ja
        JOIN users u ON ja.user_id = u.id
        JOIN job_offers jo ON ja.job_id = jo.id
        JOIN businesses b ON jo.business_id = b.id
        WHERE ja.job_id = ? AND b.owner_id = ?
        ORDER BY ja.created_at DESC
    `;
    db.all(sql, [req.params.id, req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Update application status (merchant)
router.put('/applications/:id/status', verifyToken, (req, res) => {
    if (req.user.role !== 'merchant') {
        return res.status(403).json({ error: 'Only merchants can update application status' });
    }

    const { status } = req.body;
    const sql = `
        UPDATE job_applications SET status = ? 
        WHERE id = ? AND job_id IN (
            SELECT jo.id FROM job_offers jo 
            JOIN businesses b ON jo.business_id = b.id 
            WHERE b.owner_id = ?
        )
    `;
    db.run(sql, [status, req.params.id, req.user.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Application not found or not authorized' });

        // Notify applicant
        db.get(`
            SELECT ja.user_id, jo.title 
            FROM job_applications ja 
            JOIN job_offers jo ON ja.job_id = jo.id 
            WHERE ja.id = ?
        `, [req.params.id], (err, app) => {
            if (!err && app) {
                const statusLabels = { 'reviewed': 'revisada', 'accepted': 'aceptada', 'rejected': 'rechazada' };
                createNotification(
                    app.user_id,
                    'application_update',
                    'Actualización de Postulación',
                    `Tu postulación a "${app.title}" fue ${statusLabels[status] || status}`,
                    req.params.id
                );
            }
        });

        res.json({ message: 'Application status updated' });
    });
});

// Get user's applications
router.get('/my-applications/list', verifyToken, (req, res) => {
    const sql = `
        SELECT ja.*, jo.title as job_title, b.name as business_name
        FROM job_applications ja
        JOIN job_offers jo ON ja.job_id = jo.id
        JOIN businesses b ON jo.business_id = b.id
        WHERE ja.user_id = ?
        ORDER BY ja.created_at DESC
    `;
    db.all(sql, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

module.exports = router;
