const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM || 'Hemp Life Farmers <noreply@hemplifefarmers.com>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@hemplifefarmers.com';

// ============================================================
// SEND HELPER
// ============================================================
async function send(to, subject, html) {
  try {
    const result = await resend.emails.send({ from: FROM, to, subject, html });
    console.log(`Email sent: "${subject}" → ${to}`, result.id);
    return result;
  } catch (err) {
    console.error(`Email failed: "${subject}" → ${to}`, err.message);
    throw err;
  }
}

// ============================================================
// 1. NEW APPLICATION — notify admin
// ============================================================
async function notifyAdminNewApplication(member) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#2d5016;color:#fff;padding:20px;text-align:center;">
        <h1 style="margin:0;">New Membership Application</h1>
      </div>
      <div style="padding:24px;background:#f9fafb;">
        <p>A new application has been submitted and requires your review.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px;font-weight:700;border-bottom:1px solid #e5e7eb;">Name</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${member.full_name}</td></tr>
          <tr><td style="padding:8px;font-weight:700;border-bottom:1px solid #e5e7eb;">Business</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${member.business_name}</td></tr>
          <tr><td style="padding:8px;font-weight:700;border-bottom:1px solid #e5e7eb;">Email</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${member.email}</td></tr>
          <tr><td style="padding:8px;font-weight:700;border-bottom:1px solid #e5e7eb;">State</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${member.state}</td></tr>
          <tr><td style="padding:8px;font-weight:700;border-bottom:1px solid #e5e7eb;">Invite Code</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${member.invite_code_used}</td></tr>
          <tr><td style="padding:8px;font-weight:700;">App Fee Paid</td><td style="padding:8px;">${member.app_fee_paid ? 'Yes' : 'Not yet'}</td></tr>
        </table>
        <p>Log in to the admin dashboard to approve or deny this application.</p>
      </div>
      <div style="padding:16px;text-align:center;font-size:12px;color:#9ca3af;">Hemp Life Farmers — Admin Alert</div>
    </div>
  `;
  return send(ADMIN_EMAIL, `New Application: ${member.full_name} (${member.business_name})`, html);
}

// ============================================================
// 2. APPLICATION APPROVED — notify member
// ============================================================
async function notifyMemberApproved(member) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#2d5016;color:#fff;padding:20px;text-align:center;">
        <h1 style="margin:0;">Application Approved!</h1>
      </div>
      <div style="padding:24px;background:#f9fafb;">
        <p>Hi ${member.full_name},</p>
        <p>Congratulations! Your Hemp Life Farmers membership application has been <strong style="color:#16a34a;">approved</strong>.</p>
        <div style="background:#dcfce7;border:1px solid #16a34a;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="margin:0;font-weight:700;color:#166534;">Your membership is now active.</p>
          <p style="margin:8px 0 0;">You can now log in and access the wholesale catalog to place orders.</p>
        </div>
        <p><strong>Next steps:</strong></p>
        <ul>
          <li>Your $50/month membership begins now</li>
          <li>Log in to browse the wholesale catalog</li>
          <li>Place your first order</li>
          <li>Your personal referral code: <strong>${member.personal_ref_code || 'Available in dashboard'}</strong></li>
        </ul>
        <p>Welcome to the club!</p>
      </div>
      <div style="padding:16px;text-align:center;font-size:12px;color:#9ca3af;">Hemp Life Farmers — All sales final. No refunds.</div>
    </div>
  `;
  return send(member.email, 'Your Hemp Life Farmers Membership is Approved!', html);
}

// ============================================================
// 3. APPLICATION DENIED — notify member
// ============================================================
async function notifyMemberDenied(member, reason) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#7f1d1d;color:#fff;padding:20px;text-align:center;">
        <h1 style="margin:0;">Application Update</h1>
      </div>
      <div style="padding:24px;background:#f9fafb;">
        <p>Hi ${member.full_name},</p>
        <p>Thank you for your interest in Hemp Life Farmers. After reviewing your application, we are unable to approve your membership at this time.</p>
        ${reason ? `<div style="background:#fee2e2;border:1px solid #b91c1c;border-radius:8px;padding:16px;margin:16px 0;"><p style="margin:0;"><strong>Reason:</strong> ${reason}</p></div>` : ''}
        <p>If you believe this was in error or have questions, please contact us.</p>
        <p><strong>Note:</strong> The $100 application fee is non-refundable per our terms of service.</p>
      </div>
      <div style="padding:16px;text-align:center;font-size:12px;color:#9ca3af;">Hemp Life Farmers</div>
    </div>
  `;
  return send(member.email, 'Hemp Life Farmers — Application Update', html);
}

// ============================================================
// 4. ORDER SUBMITTED — notify admin + member
// ============================================================
async function notifyOrderSubmitted(order, member, items) {
  const itemRows = items.map(it =>
    `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${it.product_name}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${it.quantity_lbs} lb</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">$${it.subtotal.toFixed(2)}</td></tr>`
  ).join('');

  const memberHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#2d5016;color:#fff;padding:20px;text-align:center;">
        <h1 style="margin:0;">Order Submitted</h1>
      </div>
      <div style="padding:24px;background:#f9fafb;">
        <p>Hi ${member.full_name},</p>
        <p>Your order <strong>${order.order_number}</strong> has been submitted for review.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <thead><tr style="background:#f3f4f6;"><th style="padding:8px;text-align:left;">Product</th><th style="padding:8px;text-align:left;">Qty</th><th style="padding:8px;text-align:left;">Subtotal</th></tr></thead>
          <tbody>${itemRows}</tbody>
          <tfoot><tr><td colspan="2" style="padding:8px;font-weight:700;">Total</td><td style="padding:8px;font-weight:700;">$${order.total.toFixed(2)}</td></tr></tfoot>
        </table>
        <div style="background:#fef9c3;border:1px solid #d97706;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="margin:0;"><strong>Status:</strong> Pending Review</p>
          <p style="margin:8px 0 0;">Payment method: ${order.payment_method}. You will receive payment instructions once approved.</p>
        </div>
        <p><strong>Reminder:</strong> All sales are final. No refunds, credits, or chargebacks.</p>
      </div>
      <div style="padding:16px;text-align:center;font-size:12px;color:#9ca3af;">Hemp Life Farmers — Order Confirmation</div>
    </div>
  `;

  const adminHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#2d5016;color:#fff;padding:20px;text-align:center;">
        <h1 style="margin:0;">New Order: ${order.order_number}</h1>
      </div>
      <div style="padding:24px;background:#f9fafb;">
        <p><strong>Member:</strong> ${member.full_name} (${member.business_name})</p>
        <p><strong>Email:</strong> ${member.email}</p>
        <p><strong>Payment:</strong> ${order.payment_method}</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <thead><tr style="background:#f3f4f6;"><th style="padding:8px;text-align:left;">Product</th><th style="padding:8px;">Qty</th><th style="padding:8px;">Subtotal</th></tr></thead>
          <tbody>${itemRows}</tbody>
          <tfoot><tr><td colspan="2" style="padding:8px;font-weight:700;">Total</td><td style="padding:8px;font-weight:700;">$${order.total.toFixed(2)}</td></tr></tfoot>
        </table>
        <p>Log in to the admin dashboard to approve or deny this order.</p>
      </div>
    </div>
  `;

  await Promise.all([
    send(member.email, `Order ${order.order_number} Submitted — Pending Review`, memberHtml),
    send(ADMIN_EMAIL, `New Order: ${order.order_number} — $${order.total.toFixed(2)}`, adminHtml)
  ]);
}

// ============================================================
// 5. ORDER STATUS UPDATE — notify member
// ============================================================
async function notifyOrderStatusChange(order, member, newStatus) {
  const statusMessages = {
    approved: { title: 'Order Approved', color: '#16a34a', msg: 'Your order has been approved. Payment instructions will follow.' },
    processing: { title: 'Order Processing', color: '#d97706', msg: 'Your order is being processed and prepared for shipment.' },
    shipped: { title: 'Order Shipped', color: '#2563eb', msg: 'Your order has been shipped! You will receive tracking information separately.' },
    delivered: { title: 'Order Delivered', color: '#16a34a', msg: 'Your order has been delivered. Thank you for your business!' },
    canceled: { title: 'Order Canceled', color: '#b91c1c', msg: 'Your order has been canceled.' }
  };

  const info = statusMessages[newStatus] || { title: 'Order Update', color: '#666', msg: `Your order status has been updated to: ${newStatus}` };

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:${info.color};color:#fff;padding:20px;text-align:center;">
        <h1 style="margin:0;">${info.title}</h1>
      </div>
      <div style="padding:24px;background:#f9fafb;">
        <p>Hi ${member.full_name},</p>
        <p>Order <strong>${order.order_number}</strong> — ${info.msg}</p>
        <p><strong>Total:</strong> $${order.total.toFixed(2)}</p>
        <p>Log in to your dashboard for full details.</p>
      </div>
      <div style="padding:16px;text-align:center;font-size:12px;color:#9ca3af;">Hemp Life Farmers</div>
    </div>
  `;
  return send(member.email, `${info.title} — ${order.order_number}`, html);
}

// ============================================================
// 6. PAYMENT REMINDER — monthly membership
// ============================================================
async function notifyPaymentReminder(member) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#d97706;color:#fff;padding:20px;text-align:center;">
        <h1 style="margin:0;">Payment Reminder</h1>
      </div>
      <div style="padding:24px;background:#f9fafb;">
        <p>Hi ${member.full_name},</p>
        <p>Your $50.00 monthly membership fee is due. Please submit payment to maintain your active wholesale access.</p>
        <div style="background:#fef9c3;border:1px solid #d97706;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="margin:0;"><strong>Amount:</strong> $50.00</p>
          <p style="margin:4px 0;"><strong>Method on file:</strong> ${member.payment_method || 'ACH'}</p>
        </div>
        <p><strong>Important:</strong> Late or missed payments will result in membership suspension. Reinstatement requires a new $100 application fee.</p>
      </div>
      <div style="padding:16px;text-align:center;font-size:12px;color:#9ca3af;">Hemp Life Farmers — All fees are non-refundable.</div>
    </div>
  `;
  return send(member.email, 'Hemp Life Farmers — Monthly Membership Payment Due', html);
}

// ============================================================
// 7. MEMBERSHIP RECEIPT — confirm monthly payment
// ============================================================
async function notifyPaymentReceived(member, payment) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#16a34a;color:#fff;padding:20px;text-align:center;">
        <h1 style="margin:0;">Payment Received</h1>
      </div>
      <div style="padding:24px;background:#f9fafb;">
        <p>Hi ${member.full_name},</p>
        <p>Your payment has been received and verified.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px;font-weight:700;border-bottom:1px solid #e5e7eb;">Type</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${payment.type === 'monthly_membership' ? 'Monthly Membership' : payment.type === 'application_fee' ? 'Application Fee' : 'Order Payment'}</td></tr>
          <tr><td style="padding:8px;font-weight:700;border-bottom:1px solid #e5e7eb;">Amount</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">$${payment.amount.toFixed(2)}</td></tr>
          <tr><td style="padding:8px;font-weight:700;border-bottom:1px solid #e5e7eb;">Method</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${payment.method}</td></tr>
          <tr><td style="padding:8px;font-weight:700;">Reference</td><td style="padding:8px;">${payment.reference || '—'}</td></tr>
        </table>
        <p><strong>Reminder:</strong> All fees are non-refundable.</p>
      </div>
      <div style="padding:16px;text-align:center;font-size:12px;color:#9ca3af;">Hemp Life Farmers — Payment Receipt</div>
    </div>
  `;
  return send(member.email, 'Hemp Life Farmers — Payment Received', html);
}

module.exports = {
  notifyAdminNewApplication,
  notifyMemberApproved,
  notifyMemberDenied,
  notifyOrderSubmitted,
  notifyOrderStatusChange,
  notifyPaymentReminder,
  notifyPaymentReceived
};
