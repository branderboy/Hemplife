const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { requireAuth, requireAdmin, requireActiveMember } = require('../lib/auth');
const email = require('../lib/email');

// POST /api/orders — member creates order
router.post('/', requireAuth, requireActiveMember, async (req, res) => {
  try {
    const { items, payment_method, ship_state, notes } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'At least one item required' });

    // Check member state is not restricted
    const stateCheck = await db.query('SELECT state_code FROM restricted_states WHERE state_code = $1', [ship_state]);
    if (stateCheck.rows.length > 0) {
      return res.status(403).json({ error: `Cannot ship to ${ship_state} — state restrictions apply` });
    }

    // Generate order number
    const countResult = await db.query('SELECT COUNT(*) FROM orders');
    const orderNum = 'HLF-' + String(parseInt(countResult.rows[0].count) + 1).padStart(4, '0');

    // Calculate totals
    let subtotal = 0;
    const orderItems = [];
    for (const item of items) {
      const productResult = await db.query('SELECT * FROM products WHERE id = $1 AND status = $2', [item.product_id, 'active']);
      if (productResult.rows.length === 0) {
        return res.status(400).json({ error: `Product ${item.product_id} not found or inactive` });
      }
      const product = productResult.rows[0];

      // Tiered pricing
      let price = parseFloat(product.price_per_lb);
      if (item.quantity_lbs >= 10 && product.price_10lb) price = parseFloat(product.price_10lb);
      else if (item.quantity_lbs >= 5 && product.price_5lb) price = parseFloat(product.price_5lb);

      const itemSubtotal = price * item.quantity_lbs;
      subtotal += itemSubtotal;
      orderItems.push({
        product_id: product.id,
        sku: product.sku,
        product_name: product.product_name,
        quantity_lbs: item.quantity_lbs,
        price_per_lb: price,
        subtotal: itemSubtotal
      });
    }

    // Create order
    const orderResult = await db.query(
      `INSERT INTO orders (order_number, member_id, payment_method, ship_state, notes, subtotal, total, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_review')
       RETURNING *`,
      [orderNum, req.memberId, payment_method, ship_state, notes, subtotal, subtotal]
    );
    const order = orderResult.rows[0];

    // Insert line items
    for (const item of orderItems) {
      await db.query(
        `INSERT INTO order_items (order_id, product_id, sku, product_name, quantity_lbs, price_per_lb, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [order.id, item.product_id, item.sku, item.product_name, item.quantity_lbs, item.price_per_lb, item.subtotal]
      );
    }

    // Get member info for email
    const memberResult = await db.query('SELECT * FROM members WHERE id = $1', [req.memberId]);
    const member = memberResult.rows[0];

    // Send emails
    await email.notifyOrderSubmitted(order, member, orderItems).catch(err => console.error('Email error:', err));

    res.status(201).json({ success: true, order: { ...order, items: orderItems } });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/orders — member sees own, admin sees all
router.get('/', requireAuth, async (req, res) => {
  try {
    let query, params;
    if (req.isAdmin) {
      const { status, search } = req.query;
      query = `SELECT o.*, m.full_name AS member_name, m.business_name
               FROM orders o JOIN members m ON o.member_id = m.id`;
      params = [];
      const conditions = [];
      if (status && status !== 'all') {
        params.push(status);
        conditions.push(`o.status = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        const idx = params.length;
        conditions.push(`(o.order_number ILIKE $${idx} OR m.full_name ILIKE $${idx})`);
      }
      if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
      query += ' ORDER BY o.created_at DESC';
    } else {
      query = `SELECT o.* FROM orders o WHERE o.member_id = $1 ORDER BY o.created_at DESC`;
      params = [req.memberId];
    }

    const { rows } = await db.query(query, params);

    // Get items for each order
    for (const order of rows) {
      const items = await db.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
      order.items = items.rows;
    }

    res.json(rows);
  } catch (err) {
    console.error('List orders error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/orders/:id/status — admin updates order status
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending_review', 'approved', 'processing', 'shipped', 'delivered', 'canceled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const updates = ['status = $1', 'updated_at = NOW()'];
    if (status === 'approved') updates.push('approved_at = NOW()');
    if (status === 'shipped') updates.push('shipped_at = NOW()');
    if (status === 'delivered') updates.push('delivered_at = NOW()');

    await db.query(`UPDATE orders SET ${updates.join(', ')} WHERE id = $2`, [status, req.params.id]);

    // Get order + member for email
    const orderResult = await db.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const order = orderResult.rows[0];

    const memberResult = await db.query('SELECT * FROM members WHERE id = $1', [order.member_id]);
    const member = memberResult.rows[0];

    // Email member
    await email.notifyOrderStatusChange(order, member, status).catch(err => console.error('Email error:', err));

    res.json({ success: true, order });
  } catch (err) {
    console.error('Update order status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/orders/:id/cancel — member cancels own pending order
router.patch('/:id/cancel', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      "UPDATE orders SET status = 'canceled', updated_at = NOW() WHERE id = $1 AND member_id = $2 AND status = 'pending_review' RETURNING *",
      [req.params.id, req.memberId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found or cannot be canceled' });
    res.json({ success: true, order: result.rows[0] });
  } catch (err) {
    console.error('Cancel order error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
