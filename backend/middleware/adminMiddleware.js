const adminMiddleware = (req, res, next) => {
  // Check authentication
  if (!req.user) {
    return res.status(401).json({
      message: 'Authentication required.'
    });
  }

  // Check admin permission
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      message: 'Access denied. Admin privileges required.'
    });
  }

  next();
};

module.exports = adminMiddleware;