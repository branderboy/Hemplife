/**
 * Hemp Life Farmers — API Client
 * Drop-in module that connects the frontend to the Express/Neon backend.
 *
 * Usage:  Include this script AFTER the main <script> block in index.html.
 *         When the backend is running, all actions (login, orders, etc.)
 *         hit the real API.  When it's not available, the app falls back
 *         to the existing demo/sessionStorage behaviour.
 *
 *  <script src="api-client.js"></script>
 */

(function () {
  'use strict';

  var API_BASE = '/api';
  var token = localStorage.getItem('hlf_token') || null;

  // ──────────────────────────────────
  // HTTP helpers
  // ──────────────────────────────────
  function headers() {
    var h = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  }

  async function api(method, path, body) {
    var opts = { method: method, headers: headers() };
    if (body) opts.body = JSON.stringify(body);
    var res = await fetch(API_BASE + path, opts);
    var data = await res.json();
    if (!res.ok) throw { status: res.status, message: data.error || 'Request failed' };
    return data;
  }

  // ──────────────────────────────────
  // Check if backend is available
  // ──────────────────────────────────
  var backendAvailable = false;

  async function checkBackend() {
    try {
      await fetch(API_BASE + '/health', { method: 'GET' });
      backendAvailable = true;
      console.log('[HLF] Backend API connected');
    } catch (e) {
      backendAvailable = false;
      console.log('[HLF] Backend not available — using demo mode');
    }
  }

  // ──────────────────────────────────
  // Override: memberLogin
  // ──────────────────────────────────
  var _origLogin = window.memberLogin;
  window.memberLogin = async function () {
    if (!backendAvailable) return _origLogin();

    var emailEl = document.getElementById('login-email');
    var passEl = document.getElementById('login-password');
    if (!emailEl || !passEl) return;
    var e = emailEl.value.trim();
    var p = passEl.value;

    try {
      var data = await api('POST', '/auth/login', { email: e, password: p });
      token = data.token;
      localStorage.setItem('hlf_token', token);

      // Mirror into sessionStorage for existing UI code
      sessionStorage.setItem('memberLoggedIn', 'true');
      sessionStorage.setItem('memberName', data.user.name);
      sessionStorage.setItem('memberEmail', data.user.email);
      sessionStorage.setItem('memberStatus', data.user.status || 'active');
      sessionStorage.setItem('personalRefCode', data.user.personalRefCode || '');
      sessionStorage.setItem('memberSince', data.user.memberSince || '');

      if (data.user.isAdmin) {
        sessionStorage.setItem('isAdmin', 'true');
        updateNavForMember();
        navigate('admin');
      } else {
        sessionStorage.removeItem('isAdmin');
        updateNavForMember();
        navigate('dashboard');
      }
    } catch (err) {
      alert(err.message || 'Login failed');
    }
  };

  // ──────────────────────────────────
  // Override: memberLogout
  // ──────────────────────────────────
  var _origLogout = window.memberLogout;
  window.memberLogout = async function () {
    if (backendAvailable && token) {
      try { await api('POST', '/auth/logout'); } catch (e) { /* ignore */ }
    }
    token = null;
    localStorage.removeItem('hlf_token');
    _origLogout();
  };

  // ──────────────────────────────────
  // Override: submitApplication
  // ──────────────────────────────────
  var _origSubmitApp = window.submitApplication;
  window.submitApplication = async function () {
    if (!backendAvailable) return _origSubmitApp();

    // Gather form data
    var data = {
      full_name: (document.getElementById('app-name') || {}).value || '',
      business_name: (document.getElementById('app-business') || {}).value || '',
      business_type: (document.getElementById('app-biz-type') || {}).value || '',
      license_number: (document.getElementById('app-license') || {}).value || '',
      ein: (document.getElementById('app-ein') || {}).value || '',
      email: (document.getElementById('app-email') || {}).value || '',
      phone: (document.getElementById('app-phone') || {}).value || '',
      street: (document.getElementById('app-street') || {}).value || '',
      city: (document.getElementById('app-city') || {}).value || '',
      state: (document.getElementById('app-state') || {}).value || '',
      zip: (document.getElementById('app-zip') || {}).value || '',
      invite_code: (document.getElementById('app-invite-code') || {}).value || '',
      invited_by: (document.getElementById('app-invited-by') || {}).value || '',
      how_heard: (document.getElementById('app-how-heard') || {}).value || '',
      password: (document.getElementById('app-password') || {}).value || 'temp-' + Date.now()
    };

    // Client-side validation
    if (!data.full_name || !data.email || !data.invite_code) {
      alert('Please complete all required fields.');
      return;
    }

    // Check agreements
    var agreeIds = ['agree-age','agree-terms','agree-disclaimer','agree-privacy','agree-compliance','agree-app-fee','agree-monthly-fee','agree-no-refunds','agree-no-minors'];
    for (var i = 0; i < agreeIds.length; i++) {
      var cb = document.getElementById(agreeIds[i]);
      if (!cb || !cb.checked) {
        alert('You must agree to all terms before submitting.');
        return;
      }
    }

    try {
      var result = await api('POST', '/members/apply', data);
      // Show payment instructions
      var form = document.getElementById('application-form');
      var payment = document.getElementById('payment-instructions');
      if (form) form.style.display = 'none';
      if (payment) payment.style.display = 'block';
      window.scrollTo(0, 0);
    } catch (err) {
      alert(err.message || 'Application failed');
    }
  };

  // ──────────────────────────────────
  // Override: submitClientOrder
  // ──────────────────────────────────
  var _origSubmitOrder = window.submitClientOrder;
  window.submitClientOrder = async function () {
    if (!backendAvailable) return _origSubmitOrder();

    var rows = document.querySelectorAll('.order-product-row');
    var items = [];
    for (var i = 0; i < rows.length; i++) {
      var select = rows[i].querySelector('.order-product-select');
      var qtyInput = rows[i].querySelector('.order-qty-input');
      var prodIdx = parseInt(select.value);
      var qty = parseInt(qtyInput.value) || 0;
      if (isNaN(prodIdx) || qty < 1 || !productData[prodIdx]) continue;
      items.push({ product_id: productData[prodIdx].id, quantity_lbs: qty });
    }

    if (items.length === 0) { alert('Please select at least one product.'); return; }

    var agreeBox = document.getElementById('order-agree-terms');
    if (!agreeBox || !agreeBox.checked) { alert('You must agree to the order terms.'); return; }

    try {
      var result = await api('POST', '/orders', {
        items: items,
        payment_method: (document.getElementById('order-payment-method') || {}).value || 'ACH',
        ship_state: (document.getElementById('order-ship-state') || {}).value || 'MD',
        notes: (document.getElementById('order-notes') || {}).value || ''
      });

      hidePlaceOrderForm();
      document.getElementById('order-product-rows').innerHTML = '';
      alert('Order ' + result.order.order_number + ' submitted!\nYou will receive payment instructions once approved.');

      // Refresh orders list
      loadMemberOrders();
    } catch (err) {
      alert(err.message || 'Order submission failed');
    }
  };

  // ──────────────────────────────────
  // Load real data when backend is up
  // ──────────────────────────────────
  async function loadMemberOrders() {
    if (!backendAvailable || !token) return;
    try {
      var orders = await api('GET', '/orders');
      var tbody = document.getElementById('orders-tbody');
      if (!tbody) return;
      var html = '';
      var statusBadges = { pending_review: 'badge-blue', approved: 'badge-gold', processing: 'badge-gold', shipped: 'badge-green', delivered: 'badge-green', canceled: 'badge-red' };
      for (var i = 0; i < orders.length; i++) {
        var o = orders[i];
        var itemNames = (o.items || []).map(function(it) { return it.product_name; }).join(', ');
        var totalQty = (o.items || []).reduce(function(s, it) { return s + parseFloat(it.quantity_lbs); }, 0);
        html += '<tr>';
        html += '<td>' + o.order_number + '</td>';
        html += '<td>' + new Date(o.created_at).toLocaleDateString() + '</td>';
        html += '<td>' + itemNames + '</td>';
        html += '<td>' + totalQty + ' lb</td>';
        html += '<td>$' + parseFloat(o.total).toFixed(2) + '</td>';
        html += '<td><span class="badge ' + (statusBadges[o.status] || 'badge-gold') + '">' + o.status.replace('_', ' ') + '</span></td>';
        if (o.status === 'pending_review') {
          html += '<td><button class="btn btn-sm btn-danger" onclick="cancelOrderAPI(\'' + o.id + '\', this)" style="padding:4px 10px;font-size:11px;">Cancel</button></td>';
        } else {
          html += '<td>&mdash;</td>';
        }
        html += '</tr>';
      }
      tbody.innerHTML = html || '<tr><td colspan="7" class="text-center text-muted">No orders yet.</td></tr>';
    } catch (err) {
      console.warn('Failed to load orders:', err);
    }
  }

  window.cancelOrderAPI = async function (orderId, btn) {
    if (!confirm('Cancel this order? This cannot be undone.')) return;
    try {
      await api('PATCH', '/orders/' + orderId + '/cancel');
      loadMemberOrders();
    } catch (err) {
      alert(err.message || 'Failed to cancel order');
    }
  };

  // ──────────────────────────────────
  // Restore session on page load
  // ──────────────────────────────────
  async function restoreSession() {
    if (!backendAvailable || !token) return;
    try {
      var user = await api('GET', '/auth/me');
      sessionStorage.setItem('memberLoggedIn', 'true');
      sessionStorage.setItem('memberName', user.full_name || user.name);
      sessionStorage.setItem('memberEmail', user.email);
      sessionStorage.setItem('memberStatus', user.status || 'active');
      if (user.isAdmin) sessionStorage.setItem('isAdmin', 'true');
      if (user.personal_ref_code) sessionStorage.setItem('personalRefCode', user.personal_ref_code);
      updateNavForMember();
    } catch (e) {
      // Token expired
      token = null;
      localStorage.removeItem('hlf_token');
    }
  }

  // ──────────────────────────────────
  // Init
  // ──────────────────────────────────
  checkBackend().then(function () {
    if (backendAvailable) restoreSession();
  });

})();
