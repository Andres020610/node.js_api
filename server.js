
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./database');
require('dotenv').config();

const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" }
});
const PORT = process.env.PORT || 3000;

const authRoutes = require('./routes/auth');
const businessRoutes = require('./routes/businesses');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const notificationRoutes = require('./routes/notifications');
const jobRoutes = require('./routes/jobs');
const userRoutes = require('./routes/users');
const promotionRoutes = require('./routes/promotions');
const adminRoutes = require('./routes/admin');
const reviewRoutes = require('./routes/reviews');
const categoryRoutes = require('./routes/categories');
const cartRoutes = require('./routes/cart');

app.use(cors({
    origin: [
        '*',
        'capacitor://localhost',
        'http://localhost',
        'http://localhost:4200',
        'http://localhost:8100'
    ],
    credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/businesses', businessRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/users', userRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/cart', cartRoutes);

app.get('/api/chat/history/:user1/:user2', (req, res) => {
    const { user1, user2 } = req.params;
    const { orderId } = req.query;

    let sql = `
        SELECT m.*, u.name as sender_name, u.role as sender_role 
        FROM messages m
        JOIN users u ON m.sender_id = u.id
    `;
    let params = [];

    if (orderId) {
        // If orderId is provided, get all messages related to this order 
        // regardless of specific sender/receiver (group chat for the order)
        sql += ` WHERE m.order_id = ?`;
        params.push(orderId);
    } else {
        // Private chat between two users
        sql += ` WHERE ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))`;
        params.push(user1, user2, user2, user1);
    }

    sql += ` ORDER BY m.created_at ASC`;

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/chat/unread/:userId', (req, res) => {
    const sql = `SELECT sender_id, COUNT(*) as count FROM messages 
                 WHERE receiver_id = ? AND read = 0 GROUP BY sender_id`;
    db.all(sql, [req.params.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.patch('/api/chat/read', (req, res) => {
    const { userId, otherId, orderId } = req.body;
    let sql = `UPDATE messages SET read = 1 WHERE receiver_id = ? AND sender_id = ?`;
    let params = [userId, otherId];
    if (orderId) {
        sql += ` AND order_id = ?`;
        params.push(orderId);
    }
    db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.get('/', (req, res) => {
    res.json({ message: 'Welcome to Delyra API' });
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-chat', ({ userId, otherId, orderId }) => {
        const room = orderId ? `order_${orderId}` : [userId, otherId].sort().join('_');
        socket.join(room);
        console.log(`User ${userId} joined room: ${room}`);
    });

    socket.on('send-message', (data) => {
        const { sender_id, receiver_id, message, order_id } = data;
        const room = order_id ? `order_${order_id}` : [sender_id, receiver_id].sort().join('_');

        db.get(`SELECT name, role FROM users WHERE id = ?`, [sender_id], (err, user) => {
            if (err) return console.error(err);

            db.run(`INSERT INTO messages (sender_id, receiver_id, order_id, message) VALUES (?, ?, ?, ?)`,
                [sender_id, receiver_id, order_id || null, message],
                function (err) {
                    if (err) return console.error(err);

                    const messageObj = {
                        id: this.lastID,
                        ...data,
                        sender_name: user ? user.name : 'Unknown',
                        sender_role: user ? user.role : 'user',
                        created_at: new Date().toISOString()
                    };

                    io.to(room).emit('receive-message', messageObj);
                }
            );
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

const HOST = '0.0.0.0';

http.listen(PORT, HOST, () => {
console.log('Servidor corriendo en el puerto ' + PORT);
});

