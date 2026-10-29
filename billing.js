/* =========================================================
   EAST AFRO HOTEL — GUEST STAYS, BILLING & REVENUE
   Upgraded enterprise PMS billing module with:
   - Live Folio / Tax Invoice Print Generator
   - Quick Charge Presets (Meals, Shuttle, Laundry)
   - Real-time Guest Search & Filter Bar
   - Multi-currency Settlement (USD & SSP)
   - Resilient Offline Demo Fallback
   ========================================================= */

'use strict';

(() => {
  const cfg = window.HOTEL_CONFIG || {};

  const client =
    window.hotelSupabaseClient ||
    window.supabaseClient ||
    window.supabase ||
    null;

  const statusEl = document.getElementById('billingStatus');
  const summaryEl = document.getElementById('billingSummary');
  const staysEl = document.getElementById('billingStays');
  const refreshButton = document.getElementById('refreshBilling');
  const exportButton = document.getElementById('exportBilling');

  const TIME_ZONE = 'Africa/Juba';
  const CURRENCIES = ['USD', 'SSP'];
  const CHARGE_CATEGORIES = ['meals', 'laundry', 'shuttle', 'other', 'discount'];
  const PAYMENT_METHODS = ['cash', 'bank_transfer', 'mobile_money', 'card'];

  let reportRows = [];
  let refreshing = false;
  let refreshQueued = false;
  let activeFilter = 'all';
  let searchQuery = '';

  /* =========================================================
     BASIC HELPERS
     ========================================================= */

  const el = (tag, text) => {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) {
      node.textContent = String(text);
    }
    return node;
  };

  const cls = (node, value) => {
    node.className = value;
    return node;
  };

  const say = message => {
    if (statusEl) {
      statusEl.textContent = String(message || '');
      statusEl.hidden = !message;
    }
  };

  const money = (value, currency = 'USD') => {
    const number = Number(value);
    const safeValue = Number.isFinite(number) ? number : 0;
    return `${currency} ${safeValue.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  const safeNumber = (value, label, allowZero = true) => {
    const text = String(value ?? '').trim();
    if (!text) throw new Error(`Enter a valid ${label}.`);
    const number = Number(text);
    if (!Number.isFinite(number) || number < 0 || (!allowZero && number === 0)) {
      throw new Error(
        `${label.charAt(0).toUpperCase() + label.slice(1)} must be ${allowZero ? 'zero or greater' : 'greater than zero'}.`
      );
    }
    return number;
  };

  const todayInJuba = () => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  };

  const normalizeCurrency = value => String(value || '').trim().toUpperCase();
  const normalizePaymentMethod = value => String(value || '').trim().toLowerCase().replaceAll(' ', '_');

  const getTextInput = (promptText, defaultValue = '') => {
    const value = window.prompt(promptText, defaultValue);
    return value === null ? null : String(value).trim();
  };

  const makeButton = (label, onClick, extraClass = '') => {
    const btn = el('button', label);
    btn.type = 'button';
    btn.className = `btn btn-small ${extraClass}`.trim();
    btn.addEventListener('click', async e => {
      e.preventDefault();
      try {
        await onClick();
      } catch (err) {
        alert(err.message || 'Operation failed');
        say(err.message);
      }
    });
    return btn;
  };

  /* =========================================================
     PRINTABLE GUEST FOLIO / TAX INVOICE
     ========================================================= */

  function printGuestFolio(guest, room, stay, charges = [], payments = [], balance = 0, totalCharges = 0, totalPaid = 0) {
    const printWindow = window.open('', '_blank', 'width=850,height=920');
    if (!printWindow) {
      alert('Please allow popups to preview and print the guest folio.');
      return;
    }

    const folioDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const folioNo = `EAH-INV-${new Date().getFullYear()}-${room.room_number || '101'}-${String(stay.id || '01').slice(0, 4)}`;
    const curr = stay.currency || 'USD';

    let chargesRows = charges.map(c => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${c.charge_date || folioDate}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${c.description || 'Accommodation'}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-transform: capitalize;">${c.category || 'Room'}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${money(c.total_amount || c.amount || 0, curr)}</td>
      </tr>
    `).join('');

    let paymentRows = payments.map(p => `
      <tr style="color: #166534;">
        <td style="padding: 9px 10px; border-bottom: 1px solid #e2e8f0;">${p.payment_date || folioDate}</td>
        <td style="padding: 9px 10px; border-bottom: 1px solid #e2e8f0;">Payment Received (${(p.payment_method || 'cash').toUpperCase()})</td>
        <td style="padding: 9px 10px; border-bottom: 1px solid #e2e8f0;">Ref: ${p.reference || 'DIRECT'}</td>
        <td style="padding: 9px 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">-${money(p.amount || 0, curr)}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Guest Folio - ${guest.guest_name || 'Guest'}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #17233c; margin: 40px; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0b1638; padding-bottom: 20px; }
          .brand-title { font-size: 26px; font-weight: bold; color: #0b1638; letter-spacing: 0.05em; font-family: serif; }
          .sub { color: #64748b; font-size: 13px; margin: 3px 0; }
          .guest-box { display: grid; grid-template-columns: 1fr 1fr; background: #f8fafc; border: 1px solid #e2e8f0; padding: 18px; margin: 24px 0; border-radius: 6px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
          th { background: #0b1638; color: white; padding: 10px; text-align: left; font-weight: 600; }
          th.num, td.num { text-align: right; }
          .totals-wrap { display: flex; justify-content: flex-end; margin-top: 25px; }
          .totals-table { width: 320px; font-size: 14px; }
          .totals-table div { display: flex; justify-content: space-between; padding: 6px 0; }
          .balance-row { border-top: 2px solid #0b1638; font-size: 17px; font-weight: bold; color: #0b1638; padding-top: 8px !important; }
          .footer-note { margin-top: 50px; border-top: 1px dashed #cbd5e1; padding-top: 20px; font-size: 12px; color: #64748b; display: flex; justify-content: space-between; align-items: flex-end; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand-title">EAST AFRO HOTEL</div>
            <div class="sub">Airport Road, Hai Malakal, Juba, South Sudan</div>
            <div class="sub">Tel: +211 922 000 111 / +211 912 000 222</div>
            <div class="sub">Email: accounts@eastafrohotel.com</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 19px; font-weight: bold; color: #d5a83d;">OFFICIAL GUEST FOLIO</div>
            <div class="sub"><strong>Folio No:</strong> ${folioNo}</div>
            <div class="sub"><strong>Issue Date:</strong> ${folioDate}</div>
            <div class="sub"><strong>Status:</strong> ${stay.status === 'checked_out' ? 'Checked Out / Closed' : 'In-House Guest'}</div>
          </div>
        </div>

        <div class="guest-box">
          <div>
            <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold;">Guest Particulars</div>
            <div style="font-size: 17px; font-weight: bold; color: #0b1638; margin-top: 4px;">${guest.guest_name || 'Guest'}</div>
            <div class="sub">Phone: ${guest.guest_phone || '—'}</div>
            <div class="sub">Email: ${guest.guest_email || '—'}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold;">Stay Information</div>
            <div style="font-size: 17px; font-weight: bold; color: #0b1638; margin-top: 4px;">Room ${room.room_number || '101'} (${room.room_type || 'Standard'})</div>
            <div class="sub">Arrival: ${stay.check_in_date || '—'}</div>
            <div class="sub">Departure: ${stay.check_out_date || '—'}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th class="num">Amount (${curr})</th>
            </tr>
          </thead>
          <tbody>
            ${chargesRows || '<tr><td colspan="4" style="text-align:center; padding:15px;">No extra charges recorded.</td></tr>'}
            ${paymentRows}
          </tbody>
        </table>

        <div class="totals-wrap">
          <div class="totals-table">
            <div><span>Total Charges:</span> <strong>${money(totalCharges, curr)}</strong></div>
            <div style="color: #166534;"><span>Total Payments:</span> <strong>-${money(totalPaid, curr)}</strong></div>
            <div class="balance-row"><span>Balance Due:</span> <span>${money(balance, curr)}</span></div>
          </div>
        </div>

        <div class="footer-note">
          <div>
            <div>Thank you for staying at East Afro Hotel, Juba.</div>
            <div>Registered Hospitality Entity · Tax Identification # 104-988-SS</div>
          </div>
          <div style="text-align: center; border-top: 1px solid #94a3b8; width: 190px; padding-top: 5px;">
            Front Desk Cashier
          </div>
        </div>
      </body>
      </html>
    `);

    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 400);
  }

  /* =========================================================
     SEARCH & FILTER TOOLBAR INJECTION
     ========================================================= */

  function renderToolbar() {
    let toolbar = document.getElementById('billingToolbar');
    if (!toolbar && staysEl && staysEl.parentNode) {
      toolbar = el('div');
      toolbar.id = 'billingToolbar';
      toolbar.style = 'display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 20px; padding: 12px 16px; background: #fff; border: 1px solid #e1e6ef; border-radius: 8px;';

      toolbar.innerHTML = `
        <div style="display: flex; gap: 8px; flex-wrap: wrap;" id="billingFilterGroup">
          <button type="button" class="btn btn-small btn-navy filter-btn active" data-status="all">All Records</button>
          <button type="button" class="btn btn-small btn-outline filter-btn" data-status="in_house">In-House Guests</button>
          <button type="button" class="btn btn-small btn-outline filter-btn" data-status="checked_out">Checked Out</button>
          <button type="button" class="btn btn-small btn-outline filter-btn" data-status="pending">Pending Check-in</button>
        </div>
        <div style="position: relative; min-width: 240px;">
          <input type="text" id="billingSearchInput" placeholder="🔍 Search guest, room or phone..." 
            style="width: 100%; padding: 8px 12px; font-size: 0.88rem; border: 1px solid #cbd5e1; border-radius: 6px; outline: none;">
        </div>
      `;

      staysEl.parentNode.insertBefore(toolbar, staysEl);

      toolbar.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          toolbar.querySelectorAll('.filter-btn').forEach(b => {
            b.classList.remove('btn-navy', 'active');
            b.classList.add('btn-outline');
          });
          btn.classList.add('btn-navy', 'active');
          btn.classList.remove('btn-outline');
          activeFilter = btn.dataset.status;
          filterAndDisplayCards();
        });
      });

      const searchInput = toolbar.querySelector('#billingSearchInput');
      searchInput.addEventListener('input', e => {
        searchQuery = e.target.value.toLowerCase().trim();
        filterAndDisplayCards();
      });
    }
  }

  function filterAndDisplayCards() {
    const cards = document.querySelectorAll('.billing-record-card');
    let visibleCount = 0;

    cards.forEach(card => {
      const status = card.dataset.status;
      const text = card.textContent.toLowerCase();

      const matchesStatus =
        activeFilter === 'all' ||
        (activeFilter === 'pending' && status === 'not_checked_in') ||
        status === activeFilter;

      const matchesSearch = !searchQuery || text.includes(searchQuery);

      if (matchesStatus && matchesSearch) {
        card.style.display = '';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    say(`Displaying ${visibleCount} record(s).`);
  }

  /* =========================================================
     SUMMARY METRICS
     ========================================================= */

  function renderSummary(financials = [], payments = []) {
    if (!summaryEl) return;
    summaryEl.replaceChildren();

    let totalRevenue = 0;
    let totalBalances = 0;
    let inHouseCount = 0;

    financials.forEach(f => {
      totalRevenue += Number(f.total_paid || 0);
      totalBalances += Number(f.balance || 0);
      if (f.status === 'in_house') inHouseCount++;
    });

    const metrics = [
      { label: 'Active In-House Guests', val: `${inHouseCount} Guests`, sub: 'Currently Staying' },
      { label: 'Total Payments Collected', val: money(totalRevenue, 'USD'), sub: 'Direct Settlement' },
      { label: 'Outstanding Balances', val: money(totalBalances, 'USD'), sub: 'Pending Checkout', color: '#b91c1c' },
      { label: 'Reporting Date', val: todayInJuba(), sub: 'Africa/Juba Standard Time' }
    ];

    metrics.forEach(m => {
      const card = el('div');
      card.className = 'metric';
      card.innerHTML = `
        <span>${m.label}</span>
        <strong style="color: ${m.color || 'var(--admin-navy)'};">${m.val}</strong>
        <span style="font-size: 0.78rem;">${m.sub}</span>
      `;
      summaryEl.append(card);
    });
  }

  /* =========================================================
     LOAD BILLING RECORDS
     ========================================================= */

  async function loadBilling() {
    if (!staysEl || !summaryEl) return;
    renderToolbar();

    if (refreshing) {
      refreshQueued = true;
      return;
    }
    refreshing = true;

    staysEl.innerHTML = '<p class="admin-empty-state">Loading guest billing records…</p>';

    try {
      // 1. Fetch stays, requests, blocks, charges & payments
      const [requestsRes, roomsRes, blocksRes, staysRes, chargesRes, paymentsRes] = await Promise.all([
        client.from('reservation_requests').select('*'),
        client.from('room_inventory').select('*'),
        client.from('room_blocks').select('*'),
        client.from('hotel_stays').select('*'),
        client.from('hotel_charges').select('*'),
        client.from('hotel_payments').select('*')
      ]);

      let requests = requestsRes.data || [];
      let rooms = roomsRes.data || [];
      let blocks = blocksRes.data || [];
      let stays = staysRes.data || [];
      let charges = chargesRes.data || [];
      let payments = paymentsRes.data || [];

      // Offline Demo Fallback if tables are empty
      if (!requests.length && !stays.length) {
        requests = [
          { id: 'req-1', guest_name: 'Ambassador Deng Garang', guest_email: 'd.garang@mofa.gov.ss', guest_phone: '+211 912 345 678', check_in_date: todayInJuba(), check_out_date: '2026-11-04' },
          { id: 'req-2', guest_name: 'Hon. Daniel Majok (UN Envoy)', guest_email: 'd.majok@un-envoy.org', guest_phone: '+211 920 445 789', check_in_date: todayInJuba(), check_out_date: '2026-11-02' }
        ];
        rooms = [
          { id: 'room-1', room_number: '201', room_type: 'Executive Suite', nightly_rate_usd: 180 },
          { id: 'room-2', room_number: '102', room_type: 'Standard Room', nightly_rate_usd: 120 }
        ];
        blocks = [
          { reservation_id: 'req-1', room_id: 'room-1', status: 'confirmed' },
          { reservation_id: 'req-2', room_id: 'room-2', status: 'confirmed' }
        ];
        stays = [
          { id: 'stay-1', reservation_id: 'req-1', status: 'in_house', currency: 'USD', check_in_date: todayInJuba(), check_out_date: '2026-11-04', nightly_rate: 180 }
        ];
        charges = [
          { stay_id: 'stay-1', description: 'Room Charge (Day 1)', category: 'Room', amount: 180, total_amount: 180 },
          { stay_id: 'stay-1', description: 'VIP Airport Shuttle', category: 'shuttle', amount: 25, total_amount: 25 },
          { stay_id: 'stay-1', description: 'Nile Perch Dinner Buffet', category: 'meals', amount: 35, total_amount: 35 }
        ];
        payments = [
          { stay_id: 'stay-1', amount: 240, payment_method: 'cash', reference: 'REC-0842' }
        ];
      }

      staysEl.replaceChildren();
      reportRows = [];

      const blocksByReq = new Map();
      blocks.forEach(b => blocksByReq.set(b.reservation_id, b));

      const roomsById = new Map();
      rooms.forEach(r => roomsById.set(r.id, r));

      const staysByReq = new Map();
      stays.forEach(s => staysByReq.set(s.reservation_id, s));

      const chargesByStay = new Map();
      charges.forEach(c => {
        if (!chargesByStay.has(c.stay_id)) chargesByStay.set(c.stay_id, []);
        chargesByStay.get(c.stay_id).push(c);
      });

      const paymentsByStay = new Map();
      payments.forEach(p => {
        if (!paymentsByStay.has(p.stay_id)) paymentsByStay.set(p.stay_id, []);
        paymentsByStay.get(p.stay_id).push(p);
      });

      const financialsList = [];

      requests.forEach(guest => {
        const block = blocksByReq.get(guest.id);
        const room = block ? (roomsById.get(block.room_id) || {}) : {};
        const stay = staysByReq.get(guest.id);

        const stayCharges = stay ? (chargesByStay.get(stay.id) || []) : [];
        const stayPayments = stay ? (paymentsByStay.get(stay.id) || []) : [];

        let totalCharges = 0;
        stayCharges.forEach(c => totalCharges += Number(c.total_amount || c.amount || 0));

        let totalPaid = 0;
        stayPayments.forEach(p => totalPaid += Number(p.amount || 0));

        const balance = Math.max(0, totalCharges - totalPaid);
        const status = stay ? stay.status : 'not_checked_in';

        financialsList.push({ status, total_paid: totalPaid, balance });

        // Add to CSV rows
        reportRows.push({
          guest_name: guest.guest_name,
          guest_email: guest.guest_email,
          guest_phone: guest.guest_phone,
          reservation_id: guest.id,
          room_code: room.room_number || 'TBD',
          room_type: room.room_type || 'Standard',
          check_in: guest.check_in_date,
          check_out: guest.check_out_date,
          currency: stay ? stay.currency : 'USD',
          status,
          total_charges: totalCharges,
          total_paid: totalPaid,
          balance
        });

        // Render Stay Card
        const card = el('article');
        card.className = 'admin-card billing-record-card';
        card.dataset.status = status;
        card.style = 'margin-bottom: 20px; border-left: 4px solid ' + (status === 'in_house' ? '#16a34a' : status === 'checked_out' ? '#64748b' : '#d5a83d');

        const cardHeader = el('div');
        cardHeader.style = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px solid #e1e6ef; padding-bottom: 12px;';
        cardHeader.innerHTML = `
          <div>
            <span style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: #64748b;">Room ${room.room_number || 'TBD'} · ${room.room_type || 'Standard'}</span>
            <h3 style="margin: 2px 0 0; color: #0b1638;">${guest.guest_name}</h3>
            <span style="font-size: 0.85rem; color: #64748b;">${guest.guest_phone || ''} | ${guest.guest_email || ''}</span>
          </div>
          <div style="text-align: right;">
            <span style="display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; background: ${status === 'in_house' ? '#dcfce7; color: #166534;' : status === 'checked_out' ? '#f1f5f9; color: #475569;' : '#fef9c3; color: #854d0e;'}">
              ${status === 'in_house' ? '● IN-HOUSE GUEST' : status === 'checked_out' ? 'CHECKED OUT' : 'WAITING CHECK-IN'}
            </span>
          </div>
        `;
        card.append(cardHeader);

        // Details grid
        const details = el('div');
        details.style = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 16px; background: #f8fafc; padding: 14px; border-radius: 6px;';
        details.innerHTML = `
          <div><span style="font-size: 0.75rem; color: #64748b;">Dates</span><br><strong>${guest.check_in_date} to ${guest.check_out_date}</strong></div>
          <div><span style="font-size: 0.75rem; color: #64748b;">Total Billed</span><br><strong style="color: #0b1638;">${money(totalCharges, stay?.currency)}</strong></div>
          <div><span style="font-size: 0.75rem; color: #64748b;">Payments</span><br><strong style="color: #16a34a;">-${money(totalPaid, stay?.currency)}</strong></div>
          <div><span style="font-size: 0.75rem; color: #64748b;">Outstanding</span><br><strong style="color: ${balance > 0 ? '#dc2626' : '#16a34a'}; font-size: 1.1rem;">${money(balance, stay?.currency)}</strong></div>
        `;
        card.append(details);

        // Actions Bar
        const actions = el('div');
        actions.style = 'display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px;';

        // 1. Check in button
        if (!stay || status === 'not_checked_in') {
          actions.append(makeButton('Check In Guest', async () => {
            const currency = getTextInput('Currency (USD or SSP):', 'USD') || 'USD';
            const rate = safeNumber(getTextInput('Nightly rate:', room.nightly_rate_usd || 120), 'Rate');
            const { error } = await client.rpc('start_hotel_stay', { p_request_id: guest.id, p_currency: currency, p_nightly_rate: rate });
            if (error) throw error;
            say(`Checked in ${guest.guest_name}.`);
            await loadBilling();
          }, 'btn-navy'));
        }

        // 2. In-House Actions: Quick Add Charge
        if (status === 'in_house') {
          actions.append(makeButton('➕ Add Charge', async () => {
            const presetChoice = getTextInput(
              'Select Quick Charge:\n1: Juba Airport Shuttle ($25)\n2: Nile Perch Buffet Lunch ($25)\n3: Laundry Service ($15)\n4: Custom Item',
              '1'
            );
            if (!presetChoice) return;

            let desc = 'Accommodation Service';
            let cat = 'meals';
            let amt = 20;

            if (presetChoice === '1') { desc = 'Airport Shuttle Transfer'; cat = 'shuttle'; amt = 25; }
            else if (presetChoice === '2') { desc = 'Restaurant Buffet'; cat = 'meals'; amt = 25; }
            else if (presetChoice === '3') { desc = 'Express Laundry'; cat = 'laundry'; amt = 15; }
            else {
              desc = getTextInput('Description:', 'Room Service') || 'Room Service';
              amt = safeNumber(getTextInput('Amount:', '10'), 'Amount');
            }

            const { error } = await client.from('hotel_charges').insert({
              stay_id: stay.id, category: cat, description: desc, quantity: 1, unit_price: amt, total_amount: amt
            });
            if (error) throw error;
            say(`Added charge of $${amt} for ${desc}.`);
            await loadBilling();
          }));

          // 3. Record Payment
          actions.append(makeButton('💵 Record Payment', async () => {
            const amt = safeNumber(getTextInput(`Payment amount received (Balance: ${balance}):`, balance), 'Amount');
            const method = getTextInput('Payment method (cash, card, bank_transfer):', 'cash') || 'cash';
            const ref = getTextInput('Reference / Receipt #:', `REC-${Math.floor(1000 + Math.random() * 9000)}`);

            const { error } = await client.from('hotel_payments').insert({
              stay_id: stay.id, amount: amt, payment_currency: stay.currency, payment_method: method, reference: ref
            });
            if (error) throw error;
            say(`Recorded payment of ${money(amt, stay.currency)}.`);
            await loadBilling();
          }));

          // 4. Check out
          actions.append(makeButton('Check Out Guest', async () => {
            if (balance > 0 && !confirm(`Guest has an unpaid balance of ${money(balance, stay.currency)}. Continue checkout?`)) return;
            const { error } = await client.rpc('finish_hotel_stay', { p_stay_id: stay.id });
            if (error) throw error;
            say(`Guest ${guest.guest_name} checked out.`);
            await loadBilling();
          }, 'btn-outline'));
        }

        // 5. Print Folio Button (Always available once stay exists or demo)
        if (stay) {
          actions.append(makeButton('🖨️ Print Guest Folio', () => {
            printGuestFolio(guest, room, stay, stayCharges, stayPayments, balance, totalCharges, totalPaid);
          }, 'btn-outline'));
        }

        card.append(actions);
        staysEl.append(card);
      });

      renderSummary(financialsList);
      say(`Billing synchronized. ${requests.length} guest records loaded.`);
    } catch (err) {
      console.error('Billing load failed:', err);
      say('Billing load error: ' + err.message);
    } finally {
      refreshing = false;
      if (refreshQueued) {
        refreshQueued = false;
        loadBilling();
      }
    }
  }

  /* =========================================================
     CSV EXPORT
     ========================================================= */

  function exportReport() {
    if (!reportRows.length) {
      say('No records to export.');
      return;
    }

    const headers = ['guest_name', 'guest_phone', 'room_code', 'check_in', 'check_out', 'status', 'total_charges', 'total_paid', 'balance'];
    const csvContent = '\uFEFF' + [
      headers.join(','),
      ...reportRows.map(r => headers.map(h => `"${String(r[h] || '').replace(/"/g, '""')}"`).join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `east-afro-billing-${todayInJuba()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say('CSV report exported successfully.');
  }

  // Event Listeners
  if (refreshButton) refreshButton.addEventListener('click', loadBilling);
  if (exportButton) exportButton.addEventListener('click', exportReport);
  window.addEventListener('hotel:dashboard-ready', loadBilling);

  // Initialize
  loadBilling();
})();
