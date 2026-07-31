'use strict';

/**
 * saasAuthService.js
 * Native JWT token generator/verifier & password hashing using embedded bcryptjs.
 */

const crypto = require('crypto');
const config = require('../config');
const bcrypt = require('../lib/bcrypt');

const JWT_SECRET = config.SAAS_JWT_SECRET || 'cafezip-fallback-secret-2026';

function base64urlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Generates a signed JWT access token for a user.
 * Payload format: { id, cafeId, email, role, iat, exp }
 */
function generateToken(user) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    id: user.id,
    cafeId: user.cafeId,
    email: user.email,
    role: user.role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 Hours Expiry
  };

  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(signatureInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${signatureInput}.${signature}`;
}

/**
 * Verifies a JWT access token.
 * Returns payload if valid, otherwise null.
 */
function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const expectedSignature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(signatureInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  // Time-safe comparison to prevent timing attacks
  try {
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
  } catch (_) {
    return null;
  }

  try {
    const payload = JSON.parse(base64urlDecode(encodedPayload));
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return null; // Expired
    }
    return payload;
  } catch (err) {
    return null;
  }
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function comparePassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

module.exports = {
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword,
};
