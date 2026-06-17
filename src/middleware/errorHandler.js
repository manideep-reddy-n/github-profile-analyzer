/**
 * Centralised error handler — must be registered last in Express
 */
function errorHandler(err, req, res, _next) {
  const status = err.statusCode || err.status || 500;
  const message = status < 500 ? err.message : 'Internal server error';

  if (status >= 500) {
    console.error('[ERROR]', err);
  }

  return res.status(status).json({ success: false, message });
}

/**
 * 404 handler for unmatched routes
 */
function notFound(req, res) {
  return res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
}

module.exports = { errorHandler, notFound };
