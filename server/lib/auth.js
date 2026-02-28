const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

const SALT_ROUNDS = 12;

async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function generateToken() {
  return crypto.randomBytes(48).toString('hex');
}

async function createSession(memberId, isAdmin = false) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await db.query(
    'INSERT INTO sessions (member_id, token, is_admin, expires_at) VALUES ($1, $2, $3, $4)',
    [memberId, token, isAdmin, expiresAt]
  );
  return { token, expiresAt };
}

async function validateSession(token) {
  if (!token) return null;
  const { rows } = await db.query(
    'SELECT s.*, m.email, m.full_name, m.status AS member_status FROM sessions s LEFT JOIN members m ON s.member_id = m.id WHERE s.token = $1 AND s.expires_at > NOW()',
    [token]
  );
  if (rows.length === 0) {
    // Also check admin sessions
    const adminResult = await db.query(
      'SELECT s.*, a.email, a.name AS full_name FROM sessions s JOIN admins a ON s.member_id = a.id WHERE s.token = $1 AND s.expires_at > NOW() AND s.is_admin = TRUE',
      [token]
    );
    return adminResult.rows[0] || null;
  }
  return rows[0];
}

async function destroySession(token) {
  await db.query('DELETE FROM sessions WHERE token = $1', [token]);
}

// Express middleware
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  validateSession(token).then(session => {
    if (!session) return res.status(401).json({ error: 'Invalid or expired session' });
    req.session = session;
    req.memberId = session.member_id;
    req.isAdmin = session.is_admin;
    next();
  }).catch(() => res.status(500).json({ error: 'Auth error' }));
}

function requireAdmin(req, res, next) {
  if (!req.isAdmin) return res.status(403).json({ error: 'Admin access required' });
  next();
}

function requireActiveMember(req, res, next) {
  if (req.isAdmin) return next(); // admins bypass
  if (req.session.member_status !== 'active') {
    return res.status(403).json({ error: 'Active membership required' });
  }
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  destroySession,
  requireAuth,
  requireAdmin,
  requireActiveMember
};
