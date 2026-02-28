const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { hashPassword, verifyPassword, createSession, destroySession, requireAuth } = require('../lib/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    // Check admin first
    const adminResult = await db.query('SELECT * FROM admins WHERE email = $1', [email.toLowerCase()]);
    if (adminResult.rows.length > 0) {
      const admin = adminResult.rows[0];
      const valid = await verifyPassword(password, admin.password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
      const session = await createSession(admin.id, true);
      return res.json({
        token: session.token,
        expiresAt: session.expiresAt,
        user: { id: admin.id, name: admin.name, email: admin.email, isAdmin: true }
      });
    }

    // Check member
    const memberResult = await db.query('SELECT * FROM members WHERE email = $1', [email.toLowerCase()]);
    if (memberResult.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const member = memberResult.rows[0];
    const valid = await verifyPassword(password, member.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    if (member.status === 'denied') return res.status(403).json({ error: 'Your application was denied' });
    if (member.status === 'pending') return res.status(403).json({ error: 'Your application is still under review' });

    const session = await createSession(member.id, false);
    res.json({
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: member.id,
        name: member.full_name,
        email: member.email,
        business: member.business_name,
        status: member.status,
        personalRefCode: member.personal_ref_code,
        memberSince: member.approved_at || member.applied_at,
        isAdmin: false
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  await destroySession(token);
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  if (req.isAdmin) {
    const { rows } = await db.query('SELECT id, name, email FROM admins WHERE id = $1', [req.memberId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Admin not found' });
    return res.json({ ...rows[0], isAdmin: true });
  }
  const { rows } = await db.query(
    'SELECT id, full_name, business_name, email, status, personal_ref_code, payment_method, applied_at, approved_at FROM members WHERE id = $1',
    [req.memberId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Member not found' });
  res.json({ ...rows[0], isAdmin: false });
});

module.exports = router;
