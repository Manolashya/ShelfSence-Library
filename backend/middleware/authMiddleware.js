
const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        message: 'Authentication required. Please log in.'
      });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      user_id: decoded.user_id,
      email: decoded.email,
      role: decoded.role || 'user'
    };

    next();

  } catch (error) {
    return res.status(401).json({
      message: 'Invalid or expired login session. Please log in again.'
    });
  }
};

module.exports = authMiddleware;
