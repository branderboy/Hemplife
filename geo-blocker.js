/**
 * Hemp Life Farmers — IP Geo-Blocker
 *
 * Whitelist-only: Only allows access from approved US states.
 * Uses free IP geolocation API. Blocks visitors from:
 *   - Restricted states (hard block)
 *   - Non-US countries
 *   - States not on the whitelist
 *
 * Include after api-client.js:  <script src="geo-blocker.js"></script>
 */

(function () {
  'use strict';

  // ============================================================
  // CONFIGURATION — Edit these to control access
  // ============================================================

  // States we ALLOW (whitelist). Everyone else is blocked.
  // Add or remove state codes as needed.
  var ALLOWED_STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA',
    'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
    'NY', 'NC', 'ND', 'OH', 'OK', 'PA', 'RI', 'SC', 'TN', 'TX',
    'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
  ];

  // States that are HARD BLOCKED (even if they appear in whitelist above)
  var BLOCKED_STATES = ['ID', 'OR', 'SD'];

  // Only allow US visitors?
  var US_ONLY = true;

  // Allow bypass for admins? (checks sessionStorage)
  var ADMIN_BYPASS = true;

  // Skip geo-check in development?
  var DEV_BYPASS = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  // Cache duration (don't re-check every page load)
  var CACHE_KEY = 'hlf_geo_check';
  var CACHE_DURATION = 60 * 60 * 1000; // 1 hour

  // ============================================================
  // STATE NAMES (for user-friendly messages)
  // ============================================================
  var STATE_NAMES = {
    AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
    CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
    HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',
    KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',
    MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',
    NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',
    NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',
    OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
    SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
    VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
    DC:'District of Columbia'
  };

  // ============================================================
  // MAIN
  // ============================================================
  function init() {
    // Skip in dev
    if (DEV_BYPASS) {
      console.log('[GEO] Dev mode — skipping geo-check');
      return;
    }

    // Admin bypass
    if (ADMIN_BYPASS && sessionStorage.getItem('isAdmin')) {
      console.log('[GEO] Admin bypass');
      return;
    }

    // Check cache
    var cached = getCachedResult();
    if (cached !== null) {
      if (cached === 'blocked') showBlockOverlay(localStorage.getItem('hlf_geo_reason') || 'Your location is restricted.');
      return;
    }

    // Fetch location
    checkLocation();
  }

  function getCachedResult() {
    try {
      var data = localStorage.getItem(CACHE_KEY);
      if (!data) return null;
      var parsed = JSON.parse(data);
      if (Date.now() - parsed.timestamp > CACHE_DURATION) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }
      return parsed.result;
    } catch (e) {
      return null;
    }
  }

  function cacheResult(result, reason) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ result: result, timestamp: Date.now() }));
      if (reason) localStorage.setItem('hlf_geo_reason', reason);
    } catch (e) { /* ignore */ }
  }

  async function checkLocation() {
    try {
      // Use ip-api.com (free, no key needed, 45 req/min)
      var response = await fetch('http://ip-api.com/json/?fields=status,country,countryCode,region,regionName,city');
      if (!response.ok) throw new Error('Geo API error');
      var data = await response.json();

      if (data.status !== 'success') {
        console.warn('[GEO] API returned non-success, allowing access');
        cacheResult('allowed');
        return;
      }

      console.log('[GEO] Location:', data.regionName + ', ' + data.countryCode, '(' + data.city + ')');

      // Check country
      if (US_ONLY && data.countryCode !== 'US') {
        var reason = 'Hemp Life Farmers only services the United States. Your detected location: ' + data.country;
        cacheResult('blocked', reason);
        showBlockOverlay(reason);
        return;
      }

      // Check hard-blocked states
      var stateCode = data.region; // 2-letter state code
      if (BLOCKED_STATES.indexOf(stateCode) !== -1) {
        var stateName = STATE_NAMES[stateCode] || stateCode;
        var reason2 = 'Hemp Life Farmers cannot service ' + stateName + ' (' + stateCode + ') due to state-level hemp restrictions.';
        cacheResult('blocked', reason2);
        showBlockOverlay(reason2);
        return;
      }

      // Check whitelist
      if (ALLOWED_STATES.indexOf(stateCode) === -1) {
        var stateName2 = STATE_NAMES[stateCode] || stateCode;
        var reason3 = 'Hemp Life Farmers does not currently service ' + stateName2 + ' (' + stateCode + ').';
        cacheResult('blocked', reason3);
        showBlockOverlay(reason3);
        return;
      }

      // Allowed
      cacheResult('allowed');
      console.log('[GEO] Access allowed:', data.regionName);

    } catch (err) {
      // If geo-check fails, allow access (don't block legitimate users)
      console.warn('[GEO] Check failed, allowing access:', err.message);
      cacheResult('allowed');
    }
  }

  function showBlockOverlay(message) {
    var overlay = document.getElementById('geo-block-overlay');
    if (!overlay) {
      // Create overlay if it doesn't exist
      overlay = document.createElement('div');
      overlay.id = 'geo-block-overlay';
      overlay.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(20,20,16,.95);z-index:10001;align-items:center;justify-content:center;padding:24px;';
      overlay.innerHTML = '<div class="geo-block-modal" style="background:#fff;border-radius:14px;padding:48px;max-width:520px;width:100%;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.5);">' +
        '<div style="font-size:48px;color:#8B3A2A;margin-bottom:16px;">&#128683;</div>' +
        '<h2 style="color:#8B3A2A;">Service Unavailable</h2>' +
        '<p style="color:#6B6356;margin:16px 0;" id="geo-block-message"></p>' +
        '<div style="background:#FDF0EC;border:1px solid #e8c4bc;border-left:4px solid #8B3A2A;border-radius:8px;padding:16px;text-align:left;margin:16px 0;">' +
        '<strong>Why am I seeing this?</strong><p style="font-size:13px;margin-top:6px;">Your IP address indicates a location we are unable to service. This may be due to state or local hemp regulations.</p></div>' +
        '<p style="color:#6B6356;font-size:12px;margin-top:16px;">If you believe this is an error, contact <strong>support@hemplifefarmers.com</strong></p>' +
        '</div>';
      document.body.appendChild(overlay);
    }

    var msgEl = overlay.querySelector('#geo-block-message') || overlay.querySelector('p');
    if (msgEl) msgEl.textContent = message;
    overlay.style.display = 'flex';

    // Prevent scrolling
    document.body.style.overflow = 'hidden';
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
