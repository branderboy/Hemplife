const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { requireAuth, requireAdmin } = require('../lib/auth');

// POST /api/invites/generate — admin generates codes
router.post('/generate', requireAuth, requireAdmin, async (req, res) => {
  try {
    const qty = Math.min(parseInt(req.body.quantity) || 1, 50); // max 50 at once
    const codes = [];

    for (let i = 0; i < qty; i++) {
      const code = 'HLF-INV-' + Math.floor(1000 + Math.random() * 9000);
      await db.query(
        'INSERT INTO invite_codes (code, created_by_admin) VALUES ($1, TRUE) ON CONFLICT (code) DO NOTHING',
        [code]
      );
      codes.push(code);
    }

    res.json({ success: true, codes });
  } catch (err) {
    console.error('Generate codes error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/invites/member-generate — member generates referral code
router.post('/member-generate', requireAuth, async (req, res) => {
  try {
    const code = 'HLF-INV-' + Math.floor(1000 + Math.random() * 9000);
    await db.query(
      'INSERT INTO invite_codes (code, created_by) VALUES ($1, $2)',
      [code, req.memberId]
    );
    res.json({ success: true, code });
  } catch (err) {
    console.error('Member generate code error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/invites — admin sees all, member sees own
router.get('/', requireAuth, async (req, res) => {
  try {
    let query, params;
    if (req.isAdmin) {
      query = `SELECT ic.*, m.full_name AS used_by_name
               FROM invite_codes ic
               LEFT JOIN members m ON ic.used_by = m.id
               ORDER BY ic.created_at DESC`;
      params = [];
    } else {
      query = `SELECT ic.*, m.full_name AS used_by_name
               FROM invite_codes ic
               LEFT JOIN members m ON ic.used_by = m.id
               WHERE ic.created_by = $1
               ORDER BY ic.created_at DESC`;
      params = [req.memberId];
    }
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('List invites error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/invites/validate/:code — public (used during application)
router.get('/validate/:code', async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT code, status FROM invite_codes WHERE code = $1",
      [req.params.code.toUpperCase()]
    );
    if (rows.length === 0) return res.json({ valid: false, error: 'Code not found' });
    if (rows[0].status !== 'available') return res.json({ valid: false, error: 'Code already used' });
    res.json({ valid: true, code: rows[0].code });
  } catch (err) {
    console.error('Validate code error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
