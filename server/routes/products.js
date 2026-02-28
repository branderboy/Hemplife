const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { requireAuth, requireAdmin, requireActiveMember } = require('../lib/auth');

// GET /api/products — members see active products, admin sees all
router.get('/', requireAuth, requireActiveMember, async (req, res) => {
  try {
    let query;
    if (req.isAdmin) {
      query = 'SELECT * FROM products ORDER BY display_order, created_at DESC';
    } else {
      query = "SELECT * FROM products WHERE status = 'active' AND farm_bill_compliant = TRUE ORDER BY display_order, created_at DESC";
    }
    const { rows } = await db.query(query);
    res.json(rows);
  } catch (err) {
    console.error('List products error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/products/public — limited info for non-members (featured only)
router.get('/public', async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT sku, product_name, product_type, product_category, cultivation_method, short_description, featured FROM products WHERE status = 'active' AND featured = TRUE AND farm_bill_compliant = TRUE ORDER BY display_order"
    );
    // No pricing for non-members
    res.json(rows);
  } catch (err) {
    console.error('Public products error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/products/:id
router.get('/:id', requireAuth, requireActiveMember, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Get product error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/products — admin create
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const p = req.body;
    if (!p.sku || !p.product_name) return res.status(400).json({ error: 'SKU and product name required' });
    if (parseFloat(p.delta9_thc_pct) > 0.3) return res.status(400).json({ error: 'COMPLIANCE: Delta-9 THC cannot exceed 0.3%' });

    const result = await db.query(
      `INSERT INTO products (sku, product_name, product_type, product_category, status, cultivation_method,
        cultivation_location, delta9_thc_pct, thca_pct, cbd_pct, price_per_lb, price_5lb, price_10lb,
        inventory_lbs, featured, short_description, long_description, product_image_url,
        restricted_states, farm_bill_compliant, compliance_statement)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING *`,
      [p.sku, p.product_name, p.product_type, p.product_category, p.status || 'active',
       p.cultivation_method, p.cultivation_location, p.delta9_thc_pct, p.thca_pct, p.cbd_pct,
       p.price_per_lb, p.price_5lb, p.price_10lb, p.inventory_lbs,
       p.featured || false, p.short_description, p.long_description, p.product_image_url,
       p.restricted_states, p.farm_bill_compliant !== false,
       p.compliance_statement || 'All Hemp Life Farmers products are derived from hemp and contain ≤0.3% Δ9-THC on a dry-weight basis in compliance with the 2018 Farm Bill.']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create product error:', err);
    if (err.code === '23505') return res.status(409).json({ error: 'SKU already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/products/:id — admin update
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const p = req.body;
    if (parseFloat(p.delta9_thc_pct) > 0.3) return res.status(400).json({ error: 'COMPLIANCE: Delta-9 THC cannot exceed 0.3%' });

    const result = await db.query(
      `UPDATE products SET
        sku = COALESCE($1, sku), product_name = COALESCE($2, product_name),
        product_type = COALESCE($3, product_type), product_category = COALESCE($4, product_category),
        status = COALESCE($5, status), price_per_lb = COALESCE($6, price_per_lb),
        price_5lb = COALESCE($7, price_5lb), price_10lb = COALESCE($8, price_10lb),
        inventory_lbs = COALESCE($9, inventory_lbs), featured = COALESCE($10, featured),
        short_description = COALESCE($11, short_description), long_description = COALESCE($12, long_description),
        product_image_url = COALESCE($13, product_image_url), delta9_thc_pct = COALESCE($14, delta9_thc_pct),
        thca_pct = COALESCE($15, thca_pct), cbd_pct = COALESCE($16, cbd_pct),
        restricted_states = COALESCE($17, restricted_states),
        updated_at = NOW()
       WHERE id = $18 RETURNING *`,
      [p.sku, p.product_name, p.product_type, p.product_category, p.status,
       p.price_per_lb, p.price_5lb, p.price_10lb, p.inventory_lbs, p.featured,
       p.short_description, p.long_description, p.product_image_url,
       p.delta9_thc_pct, p.thca_pct, p.cbd_pct, p.restricted_states, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/products/:id — admin delete
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
