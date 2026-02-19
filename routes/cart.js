const express = require('express');
const router = express.Router();
const db = require('../database');
const { verifyToken } = require('../middleware/auth');

// Get cart items for the logged-in user
router.get('/', verifyToken, (req, res) => {
    const userId = req.user.id;
    const query = `
        SELECT ci.*, p.name, p.price, p.image_url, p.business_id, p.description, p.category
        FROM cart_items ci
        JOIN products p ON ci.product_id = p.id
        WHERE ci.user_id = ?
    `;
    db.all(query, [userId], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        const cartItems = rows.map(row => ({
            product: {
                id: row.product_id,
                name: row.name,
                price: row.price,
                image_url: row.image_url,
                business_id: row.business_id,
                description: row.description,
                category: row.category
            },
            quantity: row.quantity
        }));
        res.json(cartItems);
    });
});

// Add or update an item in the cart
router.post('/', verifyToken, (req, res) => {
    const userId = req.user.id;
    const { productId, quantity } = req.body;

    if (!productId || quantity === undefined) {
        return res.status(400).json({ error: 'Product ID and quantity are required' });
    }

    // Check if item already exists
    db.get('SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?', [userId, productId], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (row) {
            // Update quantity
            db.run('UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?', [quantity, userId, productId], (err) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.json({ message: 'Cart item updated' });
            });
        } else {
            // Insert new item
            db.run('INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)', [userId, productId, quantity], (err) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.status(201).json({ message: 'Added to cart' });
            });
        }
    });
});

// Replace entire cart (useful for syncing from localStorage after login)
router.put('/sync', verifyToken, (req, res) => {
    const userId = req.user.id;
    const { items } = req.body; // Array of { productId, quantity }

    if (!Array.isArray(items)) {
        return res.status(400).json({ error: 'Items must be an array' });
    }

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run('DELETE FROM cart_items WHERE user_id = ?', [userId]);

        const stmt = db.prepare('INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)');
        items.forEach(item => {
            stmt.run(userId, item.productId, item.quantity);
        });
        stmt.finalize();

        db.run('COMMIT', (err) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'Cart synced successfully' });
        });
    });
});

// Remove an item from the cart
router.delete('/:productId', verifyToken, (req, res) => {
    const userId = req.user.id;
    const productId = req.params.productId;

    db.run('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?', [userId, productId], (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Item removed from cart' });
    });
});

// Clear the cart
router.delete('/', verifyToken, (req, res) => {
    const userId = req.user.id;

    db.run('DELETE FROM cart_items WHERE user_id = ?', [userId], (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Cart cleared' });
    });
});

module.exports = router;
