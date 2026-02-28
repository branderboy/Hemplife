const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { hashPassword, requireAuth, requireAdmin } = require('../lib/auth');
const email = require('../lib/email');

// POST /api/members/apply — public
router.post('/apply', async (req, res) => {
  try {
    const { full_name, business_name, business_type, license_number, ein, email: memberEmail,
            phone, street, city, state, zip, ship_street, ship_city, ship_state, ship_zip,
            invite_code, invited_by, how_heard, password } = req.body;

    // Validate required fields
    if (!full_name || !business_name || !memberEmail || !phone || !street || !city || !state || !zip || !invite_code || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check restricted state
    const stateCheck = await db.query('SELECT state_code FROM restricted_states WHERE state_code = $1', [state.toUpperCase()]);
    if (stateCheck.rows.length > 0) {
      return res.status(403).json({ error: `Applications from ${state} are not accepted. State-level restrictions prevent us from doing business there.` });
    }

    // Validate invite code
    const codeCheck = await db.query('SELECT * FROM invite_codes WHERE code = $1 AND status = $2', [invite_code.toUpperCase(), 'available']);
    if (codeCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or already used invitation code' });
    }

    // Check duplicate email
    const existing = await db.query('SELECT id FROM members WHERE email = $1', [memberEmail.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Generate personal referral code
    const refCode = 'HLF-INV-' + Math.floor(1000 + Math.random() * 9000);

    // Insert member
    const result = await db.query(
      `INSERT INTO members (full_name, business_name, business_type, license_number, ein, email, phone,
        street, city, state, zip, ship_street, ship_city, ship_state, ship_zip,
        invite_code_used, invited_by, how_heard, password_hash, personal_ref_code, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'pending')
       RETURNING id, full_name, business_name, email, state, invite_code_used, app_fee_paid`,
      [full_name, business_name, business_type, license_number, ein, memberEmail.toLowerCase(), phone,
       street, city, state.toUpperCase(), zip, ship_street, ship_city, ship_state, ship_zip,
       invite_code.toUpperCase(), invited_by, how_heard, passwordHash, refCode]
    );

    const member = result.rows[0];

    // Mark invite code as used
    await db.query('UPDATE invite_codes SET status = $1, used_by = $2, used_at = NOW() WHERE code = $3',
      ['used', member.id, invite_code.toUpperCase()]);

    // Email admin
    await email.notifyAdminNewApplication(member).catch(err => console.error('Email error:', err));

    res.status(201).json({
      success: true,
      message: 'Application submitted. You will be notified when reviewed.',
      memberId: member.id
    });
  } catch (err) {
    console.error('Apply error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/members — admin only
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = 'SELECT id, full_name, business_name, email, state, invite_code_used, status, app_fee_paid, monthly_active, applied_at, approved_at FROM members';
    const params = [];
    const conditions = [];

    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      conditions.push(`(full_name ILIKE $${idx} OR email ILIKE $${idx} OR business_name ILIKE $${idx})`);
    }
    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY applied_at DESC';

    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('List members error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/members/:id/status — admin approve/deny/suspend/reactivate
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    const validStatuses = ['active', 'suspended', 'denied', 'canceled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const updates = ['status = $1', 'updated_at = NOW()'];
    const params = [status, id];

    if (status === 'active') {
      updates.push('approved_at = NOW()', 'monthly_active = TRUE');
    }
    if (status === 'suspended' || status === 'canceled') {
      updates.push('monthly_active = FALSE');
    }

    await db.query(`UPDATE members SET ${updates.join(', ')} WHERE id = $2`, params);

    // Get member for email
    const { rows } = await db.query('SELECT * FROM members WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Member not found' });

    const member = rows[0];

    // Send emails
    if (status === 'active') {
      await email.notifyMemberApproved(member).catch(err => console.error('Email error:', err));
    } else if (status === 'denied') {
      await email.notifyMemberDenied(member, reason).catch(err => console.error('Email error:', err));
    }

    res.json({ success: true, member });
  } catch (err) {
    console.error('Update member status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/members/:id — admin remove
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM members WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete member error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
