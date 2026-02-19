const express = require('express');
const router = express.Router();
const db = require('../database');
const jwt = require('jsonwebtoken');
const { createNotification } = require('./notifications');

const { verifyToken } = require('../middleware/auth');

// Get Orders (Role based)
router.get('/', verifyToken, (req, res) => {
    let sql = `SELECT o.*, b.name as business_name, b.owner_id as owner_id, 
               u.name as client_name, d.name as driver_name
               FROM orders o 
               JOIN businesses b ON o.business_id = b.id
               JOIN users u ON o.client_id = u.id
               LEFT JOIN users d ON o.delivery_driver_id = d.id `;
    let params = [];

    if (req.user.role === 'client') {
        sql += `WHERE o.client_id = ? ORDER BY o.created_at DESC`;
        params.push(req.user.id);
        executeOrderQuery(sql, params, res);
    } else if (req.user.role === 'delivery') {
        // Delivery driver sees their assigned orders OR unassigned orders that are ready/confirmed
        sql += `WHERE (o.delivery_driver_id = ? OR (o.delivery_driver_id IS NULL AND o.status IN ('confirmed', 'preparing', 'ready'))) ORDER BY o.created_at DESC`;
        params.push(req.user.id);
        executeOrderQuery(sql, params, res);
    } else if (req.user.role === 'merchant') {
        // Find merchant's business first
        db.get('SELECT id FROM businesses WHERE owner_id = ?', [req.user.id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.json([]); // No business, no orders

            sql += `WHERE o.business_id = ? ORDER BY o.created_at DESC`;
            params.push(row.id);
            executeOrderQuery(sql, params, res);
        });
    } else if (req.user.role === 'admin') {
        sql += `ORDER BY o.created_at DESC`;
        executeOrderQuery(sql, params, res);
    }
});

function executeOrderQuery(sql, params, res) {
    db.all(sql, params, (err, orders) => {
        if (err) return res.status(500).json({ error: err.message });

        // Populate items for each order? keeping it simple for now, maybe fetch items separately or aggregate 
        // For list view, usually just totals and status is enough.
        res.json(orders);
    });
}

// Get Order Details (Items)
router.get('/:id/items', verifyToken, (req, res) => {
    // Check permissions? For now open to auth users, ideally check if user involved in order
    const sql = `SELECT oi.*, p.name as product_name 
                 FROM order_items oi
                 JOIN products p ON oi.product_id = p.id
                 WHERE oi.order_id = ?`;

    db.all(sql, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Create Order (Client)
router.post('/', verifyToken, (req, res) => {
    if (req.user.role !== 'client') return res.status(403).json({ error: 'Only clients can place orders' });

    const { business_id, items, delivery_address, total_amount, coupon_id } = req.body;
    // items: [{ product_id, quantity, price }]

    if (!items || items.length === 0) return res.status(400).json({ error: 'No items in order' });

    // 1. Validate Stock first
    const productIds = items.map(i => i.product_id);
    const sqlCheckStock = `SELECT id, name, stock, available FROM products WHERE id IN (${productIds.map(() => '?').join(',')})`;

    db.all(sqlCheckStock, productIds, (err, products) => {
        if (err) return res.status(500).json({ error: err.message });

        for (const item of items) {
            const product = products.find(p => p.id === item.product_id);
            if (!product) return res.status(404).json({ error: `Product ${item.product_id} not found` });
            if (product.stock < item.quantity) {
                return res.status(400).json({ error: `Insufficient stock for ${product.name}. Available: ${product.stock}` });
            }
            if (!product.available) {
                return res.status(400).json({ error: `${product.name} is currently not available` });
            }
        }

        // 2. Create Order
        const sqlOrder = `INSERT INTO orders (client_id, business_id, total_amount, status, delivery_address) 
                          VALUES (?, ?, ?, 'placed', ?)`;

        db.run(sqlOrder, [req.user.id, business_id, total_amount, delivery_address], function (err) {
            if (err) return res.status(500).json({ error: err.message });

            const orderId = this.lastID;

            // If coupon used, record usage
            if (coupon_id) {
                db.run(`INSERT INTO coupon_usages (coupon_id, user_id, order_id) VALUES (?, ?, ?)`,
                    [coupon_id, req.user.id, orderId]);
            }

            const placeholders = items.map(() => '(?, ?, ?, ?)').join(',');
            const flatParams = [];
            items.forEach(item => {
                flatParams.push(orderId, item.product_id, item.quantity, item.price);
            });

            const sqlItems = `INSERT INTO order_items (order_id, product_id, quantity, price_at_time) VALUES ` + placeholders;

            db.run(sqlItems, flatParams, function (err) {
                if (err) return res.status(500).json({ error: err.message });

                // 3. Decrement Stock
                items.forEach(item => {
                    db.run(`UPDATE products SET stock = stock - ? WHERE id = ?`, [item.quantity, item.product_id]);
                });

                // Notify merchant of new order
                db.get('SELECT owner_id FROM businesses WHERE id = ?', [business_id], (err, business) => {
                    if (!err && business) {
                        createNotification(
                            business.owner_id,
                            'new_order',
                            'Nuevo Pedido',
                            `Tienes un nuevo pedido #${orderId}`,
                            orderId
                        );
                    }
                });

                res.status(201).json({ message: 'Order placed successfully', orderId: orderId });
            });
        });
    });
});

// Update Status (Merchant/Driver)
router.put('/:id/status', verifyToken, (req, res) => {
    const { status } = req.body;
    const validStatuses = ['placed', 'confirmed', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled'];

    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    // Role-based status change validation
    const driverStatuses = ['picked_up', 'delivered'];
    const merchantStatuses = ['confirmed', 'preparing', 'ready'];

    if (req.user.role === 'delivery' && !driverStatuses.includes(status)) {
        return res.status(403).json({ error: 'Delivery drivers can only set picked_up or delivered' });
    }

    const orderId = req.params.id;
    const sql = `UPDATE orders SET status = ? WHERE id = ?`;

    db.run(sql, [status, orderId], function (err) {
        if (err) return res.status(500).json({ error: err.message });

        // Get order details for notification
        db.get('SELECT client_id, delivery_driver_id FROM orders WHERE id = ?', [orderId], (err, order) => {
            if (!err && order) {
                const statusLabels = {
                    'confirmed': 'confirmado',
                    'preparing': 'en preparación',
                    'ready': 'listo para recoger',
                    'picked_up': 'en camino',
                    'delivered': 'entregado',
                    'cancelled': 'cancelado'
                };

                // Notify client on most status changes
                if (['confirmed', 'ready', 'picked_up', 'delivered', 'cancelled'].includes(status)) {
                    createNotification(
                        order.client_id,
                        'order_update',
                        'Actualización de Pedido',
                        `Tu pedido #${orderId} está ${statusLabels[status]}`,
                        orderId
                    );
                }

                // Notify driver when order is ready
                if (status === 'ready' && order.delivery_driver_id) {
                    createNotification(
                        order.delivery_driver_id,
                        'order_ready',
                        'Pedido Listo',
                        `El pedido #${orderId} está listo para recoger`,
                        orderId
                    );
                }
            }
        });

        res.json({ message: 'Order status updated to ' + status });
    });
});

// Assign Delivery Driver (Admin/Merchant)
router.put('/:id/assign-driver', verifyToken, (req, res) => {
    if (!['admin', 'merchant'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Only admin or merchant can assign drivers' });
    }

    const { driver_id } = req.body;
    if (!driver_id) return res.status(400).json({ error: 'driver_id is required' });

    // Verify the driver exists and has the delivery role
    db.get('SELECT id, name FROM users WHERE id = ? AND role = ?', [driver_id, 'delivery'], (err, driver) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!driver) return res.status(404).json({ error: 'Delivery driver not found' });

        const sql = `UPDATE orders SET delivery_driver_id = ? WHERE id = ?`;
        db.run(sql, [driver_id, req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: `Order assigned to ${driver.name}` });
        });
    });
});

// Get Available Delivery Drivers (Admin/Merchant)
router.get('/drivers/available', verifyToken, (req, res) => {
    if (!['admin', 'merchant'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const sql = `SELECT id, name, email, phone FROM users WHERE role = 'delivery'`;
    db.all(sql, [], (err, drivers) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(drivers);
    });
});

// Accept Order (Delivery Driver)
router.put('/:id/accept', verifyToken, (req, res) => {
    if (req.user.role !== 'delivery') {
        return res.status(403).json({ error: 'Solo los repartidores pueden aceptar pedidos' });
    }

    const orderId = req.params.id;

    // Ensure the order is not already assigned
    db.get('SELECT delivery_driver_id, status FROM orders WHERE id = ?', [orderId], (err, order) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
        if (order.delivery_driver_id) return res.status(400).json({ error: 'El pedido ya tiene un repartidor asignado' });

        const sql = `UPDATE orders SET delivery_driver_id = ? WHERE id = ? AND delivery_driver_id IS NULL`;
        db.run(sql, [req.user.id, orderId], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(400).json({ error: 'No se pudo aceptar el pedido (tal vez alguien lo tomó antes)' });

            // Notify merchant that driver accepted the order
            db.get('SELECT owner_id FROM businesses b JOIN orders o ON b.id = o.business_id WHERE o.id = ?', [orderId], (err, business) => {
                if (!err && business) {
                    createNotification(
                        business.owner_id,
                        'order_accepted',
                        'Pedido Aceptado',
                        `Un repartidor ha aceptado el pedido #${orderId}`,
                        orderId
                    );
                }
            });

            res.json({ message: 'Pedido aceptado correctamente' });
        });
    });
});

module.exports = router;
