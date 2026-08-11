'use strict';

/**
 * authMiddleware.js
 * SaaS Authentication and authorization middleware.
 * Passes through transparently when Local Mode is active (SAAS_AUTH_ENABLED = false).
 */

const config = require('../config');
const saasAuthService = require('../services/saasAuthService');
const { getDefaultCafeId } = require('../lib/cafeContext');

function extractCafeIdFromReq(req) {
  const xCafeId = req.headers['x-cafe-id'];
  if (xCafeId && String(xCafeId).trim()) return String(xCafeId).trim();
  if (req.query && req.query.cafeId && String(req.query.cafeId).trim()) return String(req.query.cafeId).trim();
  return null;
}

/**
 * Verifies JWT token and attaches user information to the request.
 */
function authenticateToken(req, res, next) {
  const explicitCafeId = extractCafeIdFromReq(req);
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (token) {
    const decoded = saasAuthService.verifyToken(token);
    if (decoded) {
      req.user = decoded;
      const isSuperadmin = String(decoded.role || '').toUpperCase() === 'SUPERADMIN';
      if (explicitCafeId && !isSuperadmin && decoded.cafeId && explicitCafeId !== decoded.cafeId) {
        return res.status(403).json({ error: 'غير مصرح للوصول إلى بيانات كافيه آخر.' });
      }
      req.cafeId = (isSuperadmin && explicitCafeId) ? explicitCafeId : (decoded.cafeId || explicitCafeId || getDefaultCafeId());
      return next();
    }
  }

  if (!config.SAAS_AUTH_ENABLED) {
    req.cafeId = explicitCafeId || getDefaultCafeId();
    return next();
  }

  if (!token) {
    return res.status(401).json({ error: 'Access token required. Please log in.' });
  }

  return res.status(401).json({ error: 'Invalid or expired access token.' });
}

/**
 * Restricts access to specific user roles.
 * @param {string[]} roles Array of allowed roles (e.g., ['ADMIN', 'OWNER'])
 */
function requireRoles(roles) {
  return (req, res, next) => {
    if (!config.SAAS_AUTH_ENABLED) {
      return next();
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    const userRole = String(req.user.role || '').toUpperCase();
    const hasRole = roles.map(r => r.toUpperCase()).includes(userRole);

    if (!hasRole) {
      return res.status(403).json({ error: 'Forbidden. Insufficient permissions.' });
    }

    next();
  };
}

/**
 * Optionally parses JWT if present, but does not enforce authentication.
 */
function optionalToken(req, res, next) {
  const explicitCafeId = extractCafeIdFromReq(req);
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (token) {
    const decoded = saasAuthService.verifyToken(token);
    if (decoded) {
      req.user = decoded;
      const isSuperadmin = String(decoded.role || '').toUpperCase() === 'SUPERADMIN';
      if (explicitCafeId && !isSuperadmin && decoded.cafeId && explicitCafeId !== decoded.cafeId) {
        return res.status(403).json({ error: 'غير مصرح للوصول إلى بيانات كافيه آخر.' });
      }
      req.cafeId = (isSuperadmin && explicitCafeId) ? explicitCafeId : (decoded.cafeId || explicitCafeId || getDefaultCafeId());
      return next();
    }
  }

  if (explicitCafeId) {
    req.cafeId = explicitCafeId;
    return next();
  }

  req.cafeId = getDefaultCafeId();
  next();
}

module.exports = {
  authenticateToken,
  requireRoles,
  optionalToken,
};
