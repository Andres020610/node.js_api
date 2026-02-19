const jwt = require('jsonwebtoken');
const SECRET_KEY = 'supersecretkey_change_in_production';

function verifyToken(req, res, next) {
    let token = req.headers['authorization'];

    if (!token) {
        return res.status(403).json({ error: 'No token provided' });
    }

    // Handle 'Bearer <token>' prefix if present
    if (token.startsWith('Bearer ')) {
        token = token.slice(7, token.length);
    }

    if (!token || token === 'null' || token === 'undefined') {
        return res.status(403).json({ error: 'No token provided' });
    }

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Unauthorized: Failed to authenticate token' });
        }
        req.user = decoded;
        next();
    });
}

function isAdmin(req, res, next) {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Require Admin Role' });
    }
}

function optionalAuth(req, res, next) {
    let token = req.headers['authorization'];
    if (!token) {
        req.user = null;
        return next();
    }

    if (token.startsWith('Bearer ')) {
        token = token.slice(7, token.length);
    }

    if (!token || token === 'null' || token === 'undefined') {
        req.user = null;
        return next();
    }

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        req.user = err ? null : decoded;
        next();
    });
}

module.exports = {
    verifyToken,
    isAdmin,
    optionalAuth,
    SECRET_KEY
};
