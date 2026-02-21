const express = require('express');
const router = express.Router();
const db = require('../database');
const jwt = require('jsonwebtoken');
const upload = require('../middleware/upload');

const { verifyToken } = require('../middleware/auth');

// Get Products (Public) - Optional filter by business
router.get('/', (req, res) => {
    const { business_id, category, search, minPrice, maxPrice, sort } = req.query;
    let sql = `SELECT * FROM products WHERE available = 1`;
    let params = [];

    if (search) {
        sql += ` AND (name LIKE ? OR description LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
    }
    if (business_id) {
        sql += ` AND business_id = ?`;
        params.push(business_id);
    }
    if (category) {
        sql += ` AND category = ?`;
        params.push(category);
    }
    if (minPrice) {
        sql += ` AND price >= ?`;
        params.push(parseFloat(minPrice));
    }
    if (maxPrice) {
        sql += ` AND price <= ?`;
        params.push(parseFloat(maxPrice));
    }

    // Sorting
    switch (sort) {
        case 'price_asc':
            sql += ` ORDER BY price ASC`;
            break;
        case 'price_desc':
            sql += ` ORDER BY price DESC`;
            break;
        case 'name_asc':
            sql += ` ORDER BY name ASC`;
            break;
        case 'name_desc':
            sql += ` ORDER BY name DESC`;
            break;
        default:
            sql += ` ORDER BY id DESC`; // Newest first
    }

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Create Product (Merchant)
router.post('/', verifyToken, upload.single('image'), (req, res) => {
    if (req.user.role !== 'merchant') return res.status(403).json({ error: 'Access denied' });

    let { name, description, price, image_url, category, stock, available } = req.body;

    // Parse values to ensure they are correct for SQLite
    const parsedPrice = parseFloat(price);
    const parsedStock = parseInt(stock) || 0;
    const parsedAvailable = (available === '0' || available === 0 || available === 'false' || available === false) ? 0 : 1;

    // If a file was uploaded, use the local path
    let finalImageUrl = image_url;
    if (req.file) {
        finalImageUrl = `https://node-js-api-k4a8.onrender.com/uploads/${req.file.filename}`;
    }

    // Get Merchant's Business ID first
    db.get('SELECT id FROM businesses WHERE owner_id = ?', [req.user.id], (err, business) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!business) return res.status(404).json({ error: 'No business found for this merchant' });

        const sql = `INSERT INTO products (business_id, name, description, price, image_url, category, stock, available) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        db.run(sql, [business.id, name, description, parsedPrice, finalImageUrl, category, parsedStock, parsedAvailable], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Product created successfully', productId: this.lastID, image_url: finalImageUrl });
        });
    });
});

// Update Product (Merchant)
router.put('/:id', verifyToken, upload.single('image'), (req, res) => {
    const productId = parseInt(req.params.id);
    const userId = req.user.id;

    console.log(`Update Product - ID: ${productId}, User: ${userId}`);
    console.log('Update Product - Data:', req.body);

    let { name, description, price, image_url, category, available, stock } = req.body;

    if (req.file) {
        image_url = `https://node-js-api-k4a8.onrender.com/uploads/${req.file.filename}`;
    }

    // Parse values to ensure they are correct for SQLite
    const parsedPrice = parseFloat(price) || 0;
    const parsedStock = parseInt(stock) || 0;
    // available can be boolean or string '0'/'1' or 'true'/'false'
    const parsedAvailable = (available === '1' || available === 1 || available === 'true' || available === true || available === undefined) ? 1 : 0;

    // Verify ownership via Business ID
    const sqlCheck = `SELECT p.id, p.image_url as current_image_url FROM products p 
                      JOIN businesses b ON p.business_id = b.id 
                      WHERE p.id = ? AND b.owner_id = ?`;

    db.get(sqlCheck, [productId, userId], (err, row) => {
        if (err) {
            console.error('Database error on check:', err);
            return res.status(500).json({ error: err.message });
        }
        if (!row) {
            console.warn(`Product ${productId} not found or access denied for user ${userId}`);
            return res.status(403).json({ error: 'Access denied or product not found' });
        }

        const finalImageUrl = image_url || row.current_image_url;

        const sqlUpdate = `UPDATE products SET name=?, description=?, price=?, image_url=?, category=?, available=?, stock=? 
                           WHERE id=?`;
        db.run(sqlUpdate, [name, description, parsedPrice, finalImageUrl, category, parsedAvailable, parsedStock, productId], function (err) {
            if (err) {
                console.error('Database error on update:', err);
                return res.status(500).json({ error: err.message });
            }
            console.log(`Product ${productId} updated successfully`);
            res.json({ message: 'Product updated successfully', image_url: finalImageUrl });
        });
    });
});

// Delete Product (Merchant)
router.delete('/:id', verifyToken, (req, res) => {
    // Verify ownership
    const sqlCheck = `SELECT p.id FROM products p 
                      JOIN businesses b ON p.business_id = b.id 
                      WHERE p.id = ? AND b.owner_id = ?`;

    db.get(sqlCheck, [req.params.id, req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(403).json({ error: 'Access denied or product not found' });

        db.run(`DELETE FROM products WHERE id=?`, [req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Product deleted successfully' });
        });
    });
});

module.exports = router;
