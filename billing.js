
/* =========================================================
   EAST AFRO HOTEL — GUEST STAYS, BILLING & REVENUE
   Improved billing module for the existing admin dashboard.

   Uses existing Supabase tables:
   - reservation_requests
   - room_inventory
   - room_blocks
   - hotel_stays
   - hotel_charges
   - hotel_payments
   - hotel_stay_financials

   Uses existing RPC functions:
   - start_hotel_stay
   - finish_hotel_stay

   Requires:
   - Supabase JS v2
   - config.js
   - admin.js
   - Existing billing elements in admin.html

   No database migration is performed by this file.
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
  const CHARGE_CATEGORIES = ['meals', 'laundry', 'other', 'discount'];
  const PAYMENT_METHODS = [
    'cash',
    'bank_transfer',
    'mobile_money',
    'card'
  ];

  let reportRows = [];
  let refreshing = false;
  let refreshQueued = false;

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
    }
  };

  const money = (value, currency) => {
    const number = Number(value);

    const safeValue = Number.isFinite(number) ? number : 0;

    return `${currency} ${safeValue.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  const safeNumber = (value, label, allowZero = true) => {
    const text = String(value ?? '').trim();

    if (!text) {
      throw new Error(`Enter a valid ${label}.`);
    }

    const number = Number(text);

    if (
      !Number.isFinite(number) ||
      number < 0 ||
      (!allowZero && number === 0)
    ) {
      throw new Error(
        `${label.charAt(0).toUpperCase() + label.slice(1)} must be ${
          allowZero ? 'zero or greater' : 'greater than zero'
        }.`
      );
    }

    return number;
  };

  const date = value => {
    if (!value) return '—';

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat('en-GB', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(parsed) + ' (Juba)';
  };

  const dateOnly = value => {
    if (!value) return '—';

    const match = String(value).slice(0, 10).match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

    if (!match) return String(value);

    return `${match[3]}/${match[2]}/${match[1]}`;
  };

  function todayInJuba() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());

    const values = {};

    for (const part of parts) {
      if (part.type !== 'literal') {
        values[part.type] = part.value;
      }
    }

    return `${values.year}-${values.month}-${values.day}`;
  }

  function isTodayInJuba(value) {
    if (!value) return false;

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return false;
    }

    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(parsed);

    const values = {};

    for (const part of parts) {
      if (part.type !== 'literal') {
        values[part.type] = part.value;
      }
    }

    const paidDay =
      `${values.year}-${values.month}-${values.day}`;

    return paidDay === todayInJuba();
  }

  function errorMessage(error, fallback = 'The operation could not be completed.') {
    const message = String(error?.message || '').trim();

    return message || fallback;
  }

  function empty(target, message, isError = false) {
    if (!target) return;

    target.replaceChildren(
      cls(
        el('p', message),
        'admin-empty-state' +
          (isError ? ' admin-error-state' : '')
      )
    );
  }

  function makeButton(
    label,
    handler,
    kind = 'record-button-primary'
  ) {
    const button = el('button', label);

    button.type = 'button';
    button.className = `record-button ${kind}`;

    button.addEventListener('click', async () => {
      if (button.disabled) return;

      button.disabled = true;

      try {
        await handler();
      } catch (error) {
        console.error(`Billing action failed: ${label}`, error);
        say(errorMessage(error));
      } finally {
        button.disabled = false;
      }
    });

    return button;
  }

  function normalizeCurrency(value) {
    return String(value || '').trim().toUpperCase();
  }

  function normalizePaymentMethod(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replaceAll(' ', '_')
      .replaceAll('-', '_');
  }

  function getTextInput(message, defaultValue = '') {
    const result = prompt(message, defaultValue);

    if (result === null) return null;

    return result.trim();
  }

  function validateText(value, label, maxLength) {
    const text = String(value || '').trim();

    if (!text) {
      throw new Error(`${label} is required.`);
    }

    if (text.length > maxLength) {
      throw new Error(
        `${label} must not exceed ${maxLength} characters.`
      );
    }

    return text;
  }

  function makeReportNumber(value) {
    const number = Number(value || 0);

    return Number.isFinite(number) ? number : 0;
  }

  /* =========================================================
     STAFF AUTHENTICATION
     ========================================================= */

  async function currentStaff() {
    if (!client) return false;

    const {
      data: { user },
      error
    } = await client.auth.getUser();

    if (error || !user) return false;

    const { data: staff, error: staffError } = await client
      .from('hotel_staff')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    return !staffError && Boolean(staff);
  }

  /* =========================================================
     BILLING SUMMARY
     ========================================================= */

  function renderSummary(financials, payments) {
    if (!summaryEl) return;

    summaryEl.replaceChildren();

    const totals = {
      USD: {
        billed: 0,
        paid: 0,
        balance: 0,
        collectedToday: 0
      },
      SSP: {
        billed: 0,
        paid: 0,
        balance: 0,
        collectedToday: 0
      }
    };

    const stayCurrencyById = new Map();

    for (const row of financials) {
      const currency = normalizeCurrency(row.currency);

      if (!totals[currency]) continue;

      const total = totals[currency];

      total.billed += makeReportNumber(row.total_charges);
      total.paid += makeReportNumber(row.total_paid);
      total.balance += makeReportNumber(row.balance);

      stayCurrencyById.set(row.stay_id, currency);
    }

    /*
      The financial view calculates totals in each stay's currency.
      Payment records are converted into that same currency by
      the database before they are included in the summary.
    */
    for (const payment of payments) {
      if (!isTodayInJuba(payment.paid_at)) continue;

      const currency = stayCurrencyById.get(payment.stay_id);

      if (!currency || !totals[currency]) continue;

      totals[currency].collectedToday +=
        makeReportNumber(payment.converted_amount);
    }

    for (const currency of CURRENCIES) {
      const total = totals[currency];

      const metrics = [
        {
          label: `${currency} · Total billed`,
          value: money(total.billed, currency)
        },
        {
          label: `${currency} · Payments received`,
          value: money(total.paid, currency)
        },
        {
          label: `${currency} · Outstanding balance`,
          value: money(total.balance, currency)
        },
        {
          label: `${currency} · Collected today`,
          value: money(total.collectedToday, currency)
        }
      ];

      for (const metric of metrics) {
        const card = cls(el('div'), 'metric');

        card.append(
          cls(el('strong', metric.value), 'metric-value'),
          el('span', metric.label)
        );

        summaryEl.append(card);
      }
    }
  }

  /* =========================================================
     CHARGE AND PAYMENT HISTORY
     ========================================================= */

  function makeHistory(title, rows, formatter) {
    const wrapper = el('div');

    wrapper.append(
      cls(el('strong', title), 'record-section-title')
    );

    if (!rows.length) {
      wrapper.append(
        cls(el('p', 'None recorded yet.'), 'admin-empty-state')
      );

      return wrapper;
    }

    const list = el('ul');

    for (const row of rows) {
      list.append(el('li', formatter(row)));
    }

    wrapper.append(list);

    return wrapper;
  }

  function renderStayHistory(stay, charges, payments) {
    const history = cls(el('div'), 'billing-history');

    history.append(
      makeHistory('Charge history', charges, row => {
        const category = String(row.category || 'other')
          .replaceAll('_', ' ')
          .toUpperCase();

        const description = row.description || 'Charge';

        return (
          `${category} · ${description} · ` +
          `${row.quantity} × ${money(row.unit_price, stay.currency)} = ` +
          `${money(row.amount, stay.currency)} · ${date(row.created_at)}`
        );
      })
    );

    history.append(
      makeHistory('Payment history', payments, row => {
        const method = String(row.payment_method || 'unknown')
          .replaceAll('_', ' ');

        let message =
          `${money(row.amount, row.payment_currency)} via ${method}` +
          ` · credited ${money(row.converted_amount, stay.currency)}` +
          ` · exchange rate ${row.exchange_rate_to_stay_currency}` +
          ` · ${date(row.paid_at)}`;

        if (row.reference) {
          message += ` · Ref: ${row.reference}`;
        }

        if (row.notes) {
          message += ` · Notes: ${row.notes}`;
        }

        return message;
      })
    );

    return history;
  }

  /* =========================================================
     SELECT THE MOST RELEVANT ROOM BLOCK
     ========================================================= */

  function chooseBlockForRequest(blocks) {
    if (!blocks.length) return null;

    const sorted = [...blocks].sort((a, b) => {
      const aActive = !a.released_at;
      const bActive = !b.released_at;

      if (aActive !== bActive) {
        return aActive ? -1 : 1;
      }

      const aDate = String(a.created_at || a.check_in || '');
      const bDate = String(b.created_at || b.check_in || '');

      return bDate.localeCompare(aDate);
    });

    return sorted[0];
  }

  function groupBy(rows, key) {
    const map = new Map();

    for (const row of rows) {
      const value = row[key];

      if (!map.has(value)) {
        map.set(value, []);
      }

      map.get(value).push(row);
    }

    return map;
  }

  /* =========================================================
     LOAD BILLING RECORDS
     ========================================================= */

  async function loadBilling() {
    if (!staysEl || !summaryEl) return;

    if (!client) {
      empty(
        staysEl,
        'Supabase is not configured. Check config.js and the Supabase script.',
        true
      );

      summaryEl.replaceChildren();
      say('Billing could not connect to Supabase.');
      return;
    }

    if (refreshing) {
      refreshQueued = true;
      return;
    }

    refreshing = true;

    empty(staysEl, 'Loading guest stays and financial records…');

    try {
      if (!(await currentStaff())) {
        empty(
          staysEl,
          'Sign in with an approved hotel staff account to use billing.'
        );

        summaryEl.replaceChildren();
        reportRows = [];
        say('Billing requires an approved hotel staff account.');
        return;
      }

      /*
        Include released blocks for historical reporting.
        Active blocks are selected first for current allocations.
      */
      const { data: blocks, error: blockError } = await client
        .from('room_blocks')
        .select(
          'id, room_id, check_in, check_out, guest_reference, ' +
          'reservation_request_id, released_at, created_at, block_type'
        )
        .eq('block_type', 'booking')
        .not('reservation_request_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (blockError) throw blockError;

      const linkedBlocks = blocks || [];

      if (!linkedBlocks.length) {
        reportRows = [];
        summaryEl.replaceChildren();

        empty(
          staysEl,
          'No allocated reservations are available for guest billing yet.'
        );

        say('No linked room allocations were found.');
        return;
      }

      const groupedBlocks = groupBy(
        linkedBlocks,
        'reservation_request_id'
      );

      const selectedBlocks = [];

      for (const [, requestBlocks] of groupedBlocks) {
        const selected = chooseBlockForRequest(requestBlocks);

        if (selected) selectedBlocks.push(selected);
      }

      const requestIds = [
        ...new Set(
          selectedBlocks
            .map(row => row.reservation_request_id)
            .filter(Boolean)
        )
      ];

      const [
        requestResult,
        roomResult,
        stayResult
      ] = await Promise.all([
        client
          .from('reservation_requests')
          .select(
            'id, guest_name, guest_email, guest_phone, check_in, ' +
            'check_out, guests, status'
          )
          .in('id', requestIds)
          .eq('status', 'confirmed'),

        client
          .from('room_inventory')
          .select('id, room_code, room_type, nightly_rate_usd'),

        client
          .from('hotel_stays')
          .select('*')
          .in('reservation_request_id', requestIds)
      ]);

      if (requestResult.error) throw requestResult.error;
      if (roomResult.error) throw roomResult.error;

      if (stayResult.error) {
        throw new Error(
          'Could not load hotel stays. Verify that the billing tables, ' +
          'view, and staff read policies are configured in Supabase. ' +
          `Details: ${stayResult.error.message}`
        );
      }

      const requests = requestResult.data || [];
      const rooms = roomResult.data || [];
      const stays = stayResult.data || [];

      const roomMap = new Map(
        rooms.map(row => [row.id, row])
      );

      const requestMap = new Map(
        requests.map(row => [row.id, row])
      );

      const stayByRequest = new Map(
        stays.map(row => [row.reservation_request_id, row])
      );

      /*
        Do not load financial records for unrelated requests.
      */
      const stayIds = stays.map(row => row.id);

      let charges = [];
      let payments = [];
      let financials = [];

      if (stayIds.length) {
        const [
          chargeResult,
          paymentResult,
          financeResult
        ] = await Promise.all([
          client
            .from('hotel_charges')
            .select(
              'id, stay_id, category, description, quantity, ' +
              'unit_price, amount, created_at'
            )
            .in('stay_id', stayIds)
            .order('created_at', { ascending: true }),

          client
            .from('hotel_payments')
            .select(
              'id, stay_id, amount, payment_currency, ' +
              'exchange_rate_to_stay_currency, converted_amount, ' +
              'payment_method, reference, paid_at, notes'
            )
            .in('stay_id', stayIds)
            .order('paid_at', { ascending: true }),

          client
            .from('hotel_stay_financials')
            .select(
              'stay_id, reservation_request_id, currency, status, ' +
              'total_charges, total_paid, balance'
            )
            .in('reservation_request_id', requestIds)
        ]);

        if (chargeResult.error) throw chargeResult.error;
        if (paymentResult.error) throw paymentResult.error;

        if (financeResult.error) {
          throw new Error(
            'Could not load the hotel billing summary view. ' +
            'Check the hotel_stay_financials view and its permissions. ' +
            `Details: ${financeResult.error.message}`
          );
        }

        charges = chargeResult.data || [];
        payments = paymentResult.data || [];
        financials = financeResult.data || [];
      }

      renderSummary(financials, payments);

      const financialByStay = new Map(
        financials.map(row => [row.stay_id, row])
      );

      const chargesByStay = groupBy(charges, 'stay_id');
      const paymentsByStay = groupBy(payments, 'stay_id');

      staysEl.replaceChildren();
      reportRows = [];

      let visibleCount = 0;

      for (const block of selectedBlocks) {
        const guest = requestMap.get(block.reservation_request_id);

        /*
          Only confirmed reservations appear in this operational
          billing screen. Historical financial records remain stored
          in Supabase after a reservation is cancelled.
        */
        if (!guest) continue;

        const room = roomMap.get(block.room_id) || {};
        const stay = stayByRequest.get(guest.id) || null;
        const finance = stay
          ? financialByStay.get(stay.id)
          : null;

        const stayCharges = stay
          ? chargesByStay.get(stay.id) || []
          : [];

        const stayPayments = stay
          ? paymentsByStay.get(stay.id) || []
          : [];

        const currency = stay?.currency || 'Not set';
        const billed = makeReportNumber(finance?.total_charges);
        const paid = makeReportNumber(finance?.total_paid);
        const balance = makeReportNumber(finance?.balance);

        const state = !stay
          ? 'Awaiting check-in'
          : stay.status === 'in_house'
            ? 'In house'
            : 'Checked out';

        reportRows.push({
          guest_name:
            guest.guest_name || block.guest_reference || 'Guest',
          guest_email: guest.guest_email || '',
          guest_phone: guest.guest_phone || '',
          room_code: room.room_code || 'Room unavailable',
          room_type: room.room_type || '',
          reservation_id: guest.id,
          check_in: stay?.check_in_at || block.check_in,
          check_out: stay?.check_out_at || block.check_out,
          currency,
          status: state,
          total_charges: billed,
          total_paid: paid,
          balance
        });

        const card = cls(el('article'), 'entry admin-record-card');
        const header = cls(el('div'), 'record-header');
        const identity = cls(el('div'), 'record-identity');

        identity.append(
          el(
            'h3',
            `${guest.guest_name || 'Guest'} · ${room.room_code || 'Room'}`
          ),
          cls(
            el(
              'p',
              `${room.room_type || 'Room type unavailable'} · ${state}`
            ),
            'record-subtitle'
          )
        );

        header.append(
          identity,
          cls(
            el('p', `Reservation ${guest.id.slice(0, 8)}`),
            'record-received'
          )
        );

        card.append(header);

        const details = cls(el('div'), 'record-contact-grid');

        const detailItems = [
          ['Email', guest.guest_email || 'Not provided'],
          ['Phone', guest.guest_phone || 'Not provided'],
          [
            'Booked dates',
            `${dateOnly(block.check_in)} → ${dateOnly(block.check_out)}`
          ],
          [
            'Actual check-in',
            stay ? date(stay.check_in_at) : 'Not checked in'
          ],
          [
            'Actual checkout',
            stay?.check_out_at
              ? date(stay.check_out_at)
              : 'Not checked out'
          ],
          ['Billing currency', currency],
          [
            'Total billed',
            stay ? money(billed, stay.currency) : '—'
          ],
          [
            'Payments received',
            stay ? money(paid, stay.currency) : '—'
          ],
          [
            'Outstanding balance',
            stay ? money(balance, stay.currency) : '—'
          ]
        ];

        for (const [label, value] of detailItems) {
          const detail = cls(el('div'), 'record-detail');

          detail.append(
            cls(el('span', label), 'record-detail-label'),
            cls(el('span', value), 'record-detail-value')
          );

          details.append(detail);
        }

        card.append(details);

        if (stay) {
          card.append(
            renderStayHistory(stay, stayCharges, stayPayments)
          );
        }

        const actions = cls(el('div'), 'reservation-action-buttons');

        /* ---------------- CHECK IN ---------------- */

        if (!stay) {
          actions.append(
            makeButton('Check in guest', async () => {
              const currencyInput = getTextInput(
                'Billing currency: enter USD or SSP.',
                'USD'
              );

              if (currencyInput === null) return;

              const selectedCurrency = normalizeCurrency(currencyInput);

              if (!CURRENCIES.includes(selectedCurrency)) {
                throw new Error('Billing currency must be USD or SSP.');
              }

              const defaultRate =
                selectedCurrency === 'USD' &&
                room.nightly_rate_usd != null
                  ? String(room.nightly_rate_usd)
                  : '';

              const rateInput = getTextInput(
                `Nightly room rate in ${selectedCurrency}:`,
                defaultRate
              );

              if (rateInput === null) return;

              const rate = safeNumber(
                rateInput,
                'nightly room rate'
              );

              if (
                !confirm(
                  `Check in ${guest.guest_name || 'this guest'} at ` +
                  `${money(rate, selectedCurrency)} per night?`
                )
              ) {
                return;
              }

              const { error } = await client.rpc('start_hotel_stay', {
                p_request_id: guest.id,
                p_currency: selectedCurrency,
                p_nightly_rate: rate
              });

              if (error) throw error;

              say(
                `Guest checked in. Billing currency: ${selectedCurrency}.`
              );

              await loadBilling();
            })
          );
        }

        /* ---------------- IN-HOUSE ACTIONS ---------------- */

        if (stay && stay.status === 'in_house') {
          actions.append(
            makeButton('Add charge', async () => {
              const categoryInput = getTextInput(
                'Charge category: meals, laundry, other, or discount.',
                'meals'
              );

              if (categoryInput === null) return;

              const category = categoryInput.toLowerCase();

              if (!CHARGE_CATEGORIES.includes(category)) {
                throw new Error(
                  'Choose meals, laundry, other, or discount.'
                );
              }

              const descriptionInput = getTextInput(
                category === 'discount'
                  ? 'Discount description:'
                  : 'Description of charge:',
                category === 'meals' ? 'Meals and drinks' : ''
              );

              if (descriptionInput === null) return;

              const description = validateText(
                descriptionInput,
                'Description',
                300
              );

              const quantityInput = getTextInput(
                'Quantity (enter 1 for a single amount):',
                '1'
              );

              if (quantityInput === null) return;

              const quantity = safeNumber(
                quantityInput,
                'quantity',
                false
              );

              const priceInput = getTextInput(
                category === 'discount'
                  ? `Discount per unit in ${stay.currency}. Enter a POSITIVE amount; the system subtracts it from the bill.`
                  : `Unit amount in ${stay.currency}:`,
                '0.00'
              );

              if (priceInput === null) return;

              const unitPrice = safeNumber(
                priceInput,
                category === 'discount'
                  ? 'discount amount'
                  : 'unit amount'
              );

              if (
                category === 'discount' &&
                unitPrice === 0
              ) {
                throw new Error(
                  'Enter a discount greater than zero.'
                );
              }

              const amount = quantity * unitPrice;

              if (!Number.isFinite(amount)) {
                throw new Error('The total amount is too large.');
              }

              const actionLabel = category === 'discount'
                ? 'Record discount'
                : 'Record charge';

              if (
                !confirm(
                  `${actionLabel}?\n\n` +
                  `Category: ${category}\n` +
                  `Description: ${description}\n` +
                  `Quantity: ${quantity}\n` +
                  `Unit amount: ${money(unitPrice, stay.currency)}\n` +
                  `Total: ${money(amount, stay.currency)}\n\n` +
                  (
                    category === 'discount'
                      ? 'This discount will reduce the outstanding bill.'
                      : 'This charge will increase the outstanding bill.'
                  )
                )
              ) {
                return;
              }

              const { error } = await client
                .from('hotel_charges')
                .insert({
                  stay_id: stay.id,
                  category,
                  description,
                  quantity,
                  unit_price: unitPrice
                });

              if (error) throw error;

              say(
                category === 'discount'
                  ? 'Discount recorded.'
                  : 'Additional charge recorded.'
              );

              await loadBilling();
            })
          );

          /* ---------------- CHECKOUT ---------------- */

          actions.append(
            makeButton(
              'Check out guest',
              async () => {
                if (
                  !confirm(
                    `Check out ${guest.guest_name || 'this guest'}?\n\n` +
                    'The system will finalize the accommodation charge ' +
                    'and release the linked room booking. This action ' +
                    'cannot be reversed from this button.'
                  )
                ) {
                  return;
                }

                const { error } = await client.rpc(
                  'finish_hotel_stay',
                  { p_stay_id: stay.id }
                );

                if (error) throw error;

                say(
                  'Guest checked out. The final accommodation charge ' +
                  'has been recorded.'
                );

                await loadBilling();
              },
              'record-button-danger'
            )
          );
        }

        /* ---------------- RECORD PAYMENT ---------------- */

        if (stay && (stay.status === 'in_house' || balance > 0)) {
          actions.append(
            makeButton('Record payment', async () => {
              const amountInput = getTextInput(
                'Payment amount received:',
                ''
              );

              if (amountInput === null) return;

              const amount = safeNumber(
                amountInput,
                'payment amount',
                false
              );

              const currencyInput = getTextInput(
                'Payment currency: USD or SSP.',
                stay.currency
              );

              if (currencyInput === null) return;

              const paymentCurrency = normalizeCurrency(currencyInput);

              if (!CURRENCIES.includes(paymentCurrency)) {
                throw new Error(
                  'Payment currency must be USD or SSP.'
                );
              }

              let fx = 1;

              if (paymentCurrency !== stay.currency) {
                const rateInput = getTextInput(
                  `Exchange rate: how many ${stay.currency} equal ` +
                  `1 ${paymentCurrency}? Enter the rate approved by the hotel.`,
                  ''
                );

                if (rateInput === null) return;

                fx = safeNumber(
                  rateInput,
                  'exchange rate',
                  false
                );
              }

              const methodInput = getTextInput(
                'Payment method: cash, bank_transfer, mobile_money, or card.',
                'cash'
              );

              if (methodInput === null) return;

              const method = normalizePaymentMethod(methodInput);

              if (!PAYMENT_METHODS.includes(method)) {
                throw new Error(
                  'Choose cash, bank_transfer, mobile_money, or card.'
                );
              }

              const referenceInput = getTextInput(
                'Payment reference (optional):',
                ''
              );

              if (referenceInput === null) return;

              if (referenceInput.length > 160) {
                throw new Error(
                  'Payment reference must not exceed 160 characters.'
                );
              }

              const notesInput = getTextInput(
                'Payment notes (optional):',
                ''
              );

              if (notesInput === null) return;

              if (notesInput.length > 1000) {
                throw new Error(
                  'Payment notes must not exceed 1000 characters.'
                );
              }

              const convertedAmount = amount * fx;

              if (!Number.isFinite(convertedAmount)) {
                throw new Error(
                  'The converted payment amount is too large.'
                );
              }

              if (
                !confirm(
                  `Record payment?\n\n` +
                  `Received: ${money(amount, paymentCurrency)}\n` +
                  `Credited to guest account: ${money(convertedAmount, stay.currency)}\n` +
                  `Method: ${method.replaceAll('_', ' ')}\n` +
                  `Exchange rate: ${fx}\n\n` +
                  'Confirm that the money has actually been received.'
                )
              ) {
                return;
              }

              const { error } = await client
                .from('hotel_payments')
                .insert({
                  stay_id: stay.id,
                  amount,
                  payment_currency: paymentCurrency,
                  exchange_rate_to_stay_currency: fx,
                  payment_method: method,
                  reference: referenceInput,
                  notes: notesInput
                });

              if (error) throw error;

              say(
                'Payment recorded. Keep the receipt or reference ' +
                'for reconciliation.'
              );

              await loadBilling();
            })
          );
        }

        card.append(actions);
        staysEl.append(card);
        visibleCount += 1;
      }

      if (!visibleCount) {
        empty(
          staysEl,
          'No confirmed room allocations are available for billing.'
        );
      }

      say(
        `Billing records refreshed. ${visibleCount} allocated ` +
        `reservation(s) listed. Reporting date: ${todayInJuba()} (Juba).`
      );
    } catch (error) {
      console.error('Billing load failed:', error);

      empty(
        staysEl,
        errorMessage(
          error,
          'Unable to load billing records. Check the Supabase connection and staff permissions.'
        ),
        true
      );

      say('Billing could not load. Review the displayed error and Supabase permissions.');
    } finally {
      refreshing = false;

      if (refreshQueued) {
        refreshQueued = false;
        Promise.resolve().then(loadBilling);
      }
    }
  }

  /* =========================================================
     CSV EXPORT
     ========================================================= */

  function protectSpreadsheetValue(value) {
    let text = String(value ?? '');

    /*
      Prevent spreadsheet applications from interpreting untrusted
      guest-entered text as a formula when the CSV is opened.
    */
    if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) {
      text = "'" + text;
    }

    return text;
  }

  function csvCell(value) {
    const safeValue = protectSpreadsheetValue(value);

    return `"${safeValue.replaceAll('"', '""')}"`;
  }

  function exportReport() {
    if (!reportRows.length) {
      say('No billing rows are available to export.');
      return;
    }

    const columns = [
      'guest_name',
      'guest_email',
      'guest_phone',
      'reservation_id',
      'room_code',
      'room_type',
      'check_in',
      'check_out',
      'currency',
      'status',
      'total_charges',
      'total_paid',
      'balance'
    ];

    const rows = [
      columns.join(','),
      ...reportRows.map(row =>
        columns.map(key => csvCell(row[key])).join(',')
      )
    ];

    const csv = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;'
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download =
      `east-afro-billing-${todayInJuba()}.csv`;

    document.body.append(anchor);
    anchor.click();
    anchor.remove();

    /*
      Delay revocation briefly to give the browser time to begin
      processing the download.
    */
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    say(
      `Billing report exported (${reportRows.length} reservation(s)). ` +
      'Store the file securely because it contains guest information.'
    );
  }

  /* =========================================================
     EVENT LISTENERS
     ========================================================= */

  if (refreshButton) {
    refreshButton.addEventListener('click', loadBilling);
  }

  if (exportButton) {
    exportButton.addEventListener('click', exportReport);
  }

  window.addEventListener('hotel:dashboard-ready', loadBilling);

  /*
    Initial load supports an existing authenticated session after
    refreshing the admin page.
  */
  loadBilling();
})();
