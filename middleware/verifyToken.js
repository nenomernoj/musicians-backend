const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    const authHeader = req.header('Authorization');
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Access Denied' });
    }

    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET); // Убедись, что это тот же ключ, что и в sign-in
        req.user = verified;
        next();
    } catch (err) {
        console.error('JWT Verification Error:', err);
        res.status(400).json({ message: 'Invalid Token' });
    }
};

module.exports = verifyToken;
