/* =====================================================
   EAST AFRO HOTEL — ADMIN DASHBOARD
   Authentication, reservations, messages, room inventory,
   room blocks, calendar, private notes and CSV exports
   ===================================================== */

'use strict';

/* -----------------------------------------------------
   CONFIGURATION
   ----------------------------------------------------- */

const cfg = window.HOTEL_CONFIG || {};

const statusEl = document.getElementById('status');
const login = document.getElementById('login');
const dashboard = document.getElementById('dashboard');

const metrics = document.getElementById('metrics');
const roomSelector = document.getElementById('blockRoom');
const viewDate = document.getElementById('viewDate');

const client =
  cfg.supabaseUrl &&
  cfg.supabaseAnonKey &&
  window.supabase
    ? window.supabase.createClient(
        cfg.supabaseUrl,
        cfg.supabaseAnonKey
      )
    : null;
// Share the initialized Supabase client with billing.js.
window.hotelSupabaseClient = client;

let rooms = [];
let blocks = [];
let loading = false;

const todayISO = () => {
  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
};

const dayString = date =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');

function status(message) {
  if (statusEl) statusEl.textContent = message;
}

function el(tag, text) {
  const node = document.createElement(tag);

  if (text !== undefined && text !== null) {
    node.textContent = String(text);
  }

  return node;
}

function setClass(node, className) {
  node.className = className;
  return node;
}

function formatDate(value) {
  if (!value) return 'Not provided';

  // Date-only values should not shift to another day
  // because of timezone conversion.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);

  if (dateOnly) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString();
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') {
    return 'Rate not set';
  }

  return '$' + Number(value).toFixed(2);
}

function makeButton(text, className, handler) {
  const button = el('button', text);

  button.type = 'button';
  button.className = 'record-button ' + className;
  button.addEventListener('click', handler);

  return button;
}

function addDetail(container, labelText, value) {
  const detail = setClass(el('div'), 'record-detail');

  detail.append(
    setClass(el('span', labelText), 'record-detail-label'),
    setClass(
      el(
        'span',
        value === undefined || value === null || value === ''
          ? 'Not provided'
          : value
      ),
      'record-detail-value'
    )
  );

  container.append(detail);
}

function emptyState(target, message, isError = false) {
  target.replaceChildren();

  target.append(
    setClass(
      el('p', message),
      'admin-empty-state' +
        (isError ? ' admin-error-state' : '')
    )
  );
}

/* -----------------------------------------------------
   AUTHENTICATION
   ----------------------------------------------------- */


async function load() {
  if (loading) return;

  loading = true;

  try {
    if (!client) {
      stopLoginExpiry();

      if (login) login.hidden = false;
      if (dashboard) dashboard.hidden = true;

      status('Configure Supabase in config.js first.');
      return;
    }

    const {
      data: { user },
      error: userError
    } = await client.auth.getUser();

    if (userError || !user) {
      stopLoginExpiry();

      if (login) login.hidden = false;
      if (dashboard) dashboard.hidden = true;

      status('Sign in with an approved staff account.');
      return;
    }

    const { data: staff, error: staffError } = await client
      .from('hotel_staff')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (staffError || !staff) {
      stopLoginExpiry();
      await client.auth.signOut();

      if (login) login.hidden = false;
      if (dashboard) dashboard.hidden = true;

      status('This account is not authorized to access the dashboard.');
      return;
    }

    if (login) login.hidden = true;
    if (dashboard) dashboard.hidden = false;

    // Start or refresh the 30-minute inactivity timer
    // only after staff authorization succeeds.
    startLoginExpiry();

    status('Signed in successfully.');

    await initializeDashboard();
  } catch (error) {
    console.error('Admin load error:', error);
    status(
      'Unable to load the dashboard. Check your connection and configuration.'
    );
  } finally {
    loading = false;
  }
}


/* -----------------------------------------------------
   DASHBOARD ENTRY POINT
   ----------------------------------------------------- */



async function initializeDashboard() {
  initializeDashboardNavigation();

  await Promise.all([
    render('reservation_requests', 'reservations'),
    render('contact_messages', 'messages'),
    loadOperations(),
    loadBookedRooms()
  ]);
}



/* -----------------------------------------------------
   RESERVATIONS AND CONTACT MESSAGES
   ----------------------------------------------------- */

async function render(table, targetId) {
  const target = document.getElementById(targetId);

  if (!target || !client) return;

  target.replaceChildren(
    setClass(el('p', 'Loading records…'), 'admin-empty-state')
  );

  const { data, error } = await client
    .from(table)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    emptyState(
      target,
      'Unable to load records: ' + error.message,
      true
    );
    return;
  }

  if (!data || data.length === 0) {
    emptyState(
      target,
      table === 'reservation_requests'
        ? 'No reservation requests yet.'
        : 'No contact messages yet.'
    );
    return;
  }

  target.replaceChildren();

  const isReservation = table === 'reservation_requests';

  const statusOptions = isReservation
    ? ['new', 'contacted', 'declined']
    : ['new', 'replied', 'closed'];

  for (const item of data) {
    const card = setClass(
      el('article'),
      'entry admin-record-card'
    );

    const name =
      item.guest_name ||
      item.sender_name ||
      'Guest';

    const email =
      item.guest_email ||
      item.sender_email ||
      'Not provided';

    const phone =
      item.guest_phone ||
      item.sender_phone ||
      'Not provided';

    /* Record header */
    const header = setClass(el('div'), 'record-header');
    const identity = setClass(el('div'), 'record-identity');

    identity.append(
      el('h3', name),
      setClass(
        el(
          'p',
          isReservation
            ? 'Reservation request'
            : 'Contact inquiry'
        ),
        'record-subtitle'
      )
    );

    header.append(
      identity,
      setClass(
        el(
          'p',
          'Received ' + formatDate(item.created_at)
        ),
        'record-received'
      )
    );

    card.append(header);

    /* Contact details */
    const contactGrid = setClass(
      el('div'),
      'record-contact-grid'
    );

    addDetail(contactGrid, 'Email address', email);
    addDetail(contactGrid, 'Phone number', phone);

    card.append(contactGrid);

    /* Reservation details or message */
    if (isReservation) {
      const summary = setClass(
        el('section'),
        'reservation-summary'
      );

      summary.append(
        setClass(
          el('h4', 'Reservation details'),
          'record-section-title'
        )
      );

      const grid = setClass(
        el('div'),
        'reservation-detail-grid'
      );

      const addReservationDetail = (label, value) => {
        const detail = setClass(
          el('div'),
          'reservation-detail'
        );

        detail.append(
          setClass(el('span', label), 'record-detail-label'),
          setClass(
            el(
              'strong',
              value === undefined || value === null || value === ''
                ? 'Not specified'
                : value
            ),
            'record-detail-value'
          )
        );

        grid.append(detail);
      };

      addReservationDetail(
        'Check-in',
        formatDate(item.check_in)
      );

      addReservationDetail(
        'Check-out',
        formatDate(item.check_out)
      );

      addReservationDetail('Guests', item.guests);
      addReservationDetail(
        'Room preference',
        item.room_preference
      );

      summary.append(grid);
      card.append(summary);
    } else {
      const messageSection = setClass(
        el('section'),
        'contact-message-section'
      );

      messageSection.append(
        setClass(
          el('h4', 'Message details'),
          'record-section-title'
        ),
        setClass(
          el(
            'p',
            'Subject: ' + (item.topic || 'General inquiry')
          ),
          'contact-message-topic'
        ),
        setClass(
          el(
            'p',
            item.message || 'No message content provided.'
          ),
          'contact-message-body'
        )
      );

      card.append(messageSection);
    }

    /* Status control.
       Confirmed reservations must be changed through the
       reservation allocation workflow, not this dropdown. */
    const statusSection = setClass(
      el('section'),
      'record-status-section'
    );

    const statusLabel = setClass(
      el(
        'label',
        isReservation
          ? 'Reservation status'
          : 'Message status'
      ),
      'record-control-label'
    );

    const statusSelect = setClass(
      el('select'),
      'record-status-select'
    );

    // Keep any existing status visible even if it is not
    // part of the standard options.
    const options = [...statusOptions];

    if (item.status && !options.includes(item.status)) {
      options.push(item.status);
    }

    for (const value of options) {
      const option = el(
        'option',
        value.charAt(0).toUpperCase() + value.slice(1)
      );

      option.value = value;
      statusSelect.append(option);
    }

    statusSelect.value = item.status || 'new';
    statusSelect.disabled = item.status === 'confirmed';

    statusLabel.append(statusSelect);
    statusSection.append(statusLabel);
    card.append(statusSection);

    statusSelect.addEventListener('change', async () => {
      const previousStatus = item.status || 'new';
      const nextStatus = statusSelect.value;

      statusSelect.disabled = true;

      const { error: updateError } = await client
        .from(table)
        .update({ status: nextStatus })
        .eq('id', item.id);

      if (updateError) {
        statusSelect.value = previousStatus;
        statusSelect.disabled =
          previousStatus === 'confirmed';

        status('Could not update status: ' + updateError.message);
        return;
      }

      status('Status updated.');
      await render(table, targetId);
    });

    /* Reservation actions and private notes */
    if (isReservation) {
      renderReservationActions(card, item);
      renderPrivateNotes(card, item);
    }

    target.append(card);
  }
}

/* -----------------------------------------------------
   RESERVATION ACTIONS
   ----------------------------------------------------- */

function renderReservationActions(card, item) {
  const section = setClass(
    el('section'),
    'record-actions-section premium-reservation-actions'
  );

  section.append(
    setClass(
      el('h4', 'Reservation actions'),
      'record-section-title'
    ),
    setClass(
      el(
        'p',
        'Review the guest details and verify availability before allocating a room.'
      ),
      'reservation-action-intro'
    )
  );

  const currentStatus = item.status || 'new';

  if (currentStatus === 'confirmed') {
    const notice = setClass(
      el('div'),
      'reservation-action-notice reservation-action-success'
    );

    notice.append(
      el('strong', 'Room allocation recorded'),
      el(
        'p',
        'This reservation is marked as confirmed. Contact the guest separately to communicate the booking details.'
      )
    );

    section.append(notice);

    const actions = setClass(
      el('div'),
      'reservation-action-buttons'
    );

    const cancel = makeButton(
      'Cancel room allocation',
      'record-button-danger',
      async () => {
        if (!window.confirm(
          'Cancel this room allocation? This does not automatically notify the guest.'
        )) return;

        cancel.disabled = true;

        const { error } = await client.rpc(
          'cancel_hotel_reservation',
          { p_request_id: item.id }
        );

        if (error) {
          status('Could not cancel allocation: ' + error.message);
          cancel.disabled = false;
          return;
        }

        status(
          'Allocation cancelled. Please notify the guest separately.'
        );

        await load();
      }
    );

    actions.append(cancel);
    section.append(actions);
  } else if (currentStatus === 'declined') {
    const notice = setClass(
      el('div'),
      'reservation-action-notice reservation-action-declined'
    );

    notice.append(
      el('strong', 'Request declined'),
      el(
        'p',
        'No room allocation action is available for this request. You can change the status if the request needs to be reconsidered.'
      )
    );

    section.append(notice);
  } else {
    const activeRooms = rooms.filter(room => room.active);

    const selection = setClass(
      el('div'),
      'reservation-room-selection'
    );

    const label = setClass(
      el('label', 'Select a room to allocate'),
      'reservation-room-label'
    );

    const select = setClass(
      el('select'),
      'record-room-select'
    );

    select.setAttribute('aria-label', 'Room to allocate');

    const placeholder = el(
      'option',
      activeRooms.length
        ? 'Choose a room…'
        : 'No active rooms available'
    );

    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.selected = true;

    select.append(placeholder);

    for (const room of activeRooms) {
      const rate = room.nightly_rate_usd == null
        ? 'Rate not set'
        : formatMoney(room.nightly_rate_usd) + '/night';

      const option = el(
        'option',
        `${room.room_code} · ${room.room_type} · ${rate}`
      );

      option.value = room.id;
      select.append(option);
    }

    label.append(select);
    selection.append(label);

    const warning = setClass(
      el('div'),
      'reservation-action-notice reservation-action-warning'
    );

    warning.append(
      el('strong', 'Verify availability first'),
      el(
        'p',
        'Check the room calendar for the entire stay. An active room is not necessarily available for these dates. The database confirmation function should also prevent overlapping bookings.'
      )
    );

    selection.append(warning);

    const actions = setClass(
      el('div'),
      'reservation-action-buttons'
    );

    const confirmButton = makeButton(
      'Confirm & allocate room',
      'record-button-primary',
      async () => {
        if (!select.value) {
          status('Select a room before confirming this reservation.');
          select.focus();
          return;
        }

        const room = activeRooms.find(
          candidate => candidate.id === select.value
        );

        if (!room) {
          status('Please select a valid active room.');
          return;
        }

        if (
          !item.check_in ||
          !item.check_out ||
          item.check_out <= item.check_in
        ) {
          status('The reservation has invalid check-in or check-out dates.');
          return;
        }

        const approved = window.confirm(
          `Allocate room ${room.room_code} to ${item.guest_name || 'this guest'} ` +
          `from ${item.check_in} to ${item.check_out}? ` +
          'Verify availability for the full stay first.'
        );

        if (!approved) return;

        confirmButton.disabled = true;
        select.disabled = true;

        const { error } = await client.rpc(
          'confirm_hotel_reservation',
          {
            p_request_id: item.id,
            p_room_id: room.id
          }
        );

        if (error) {
          status('Could not confirm reservation: ' + error.message);
          confirmButton.disabled = false;
          select.disabled = false;
          return;
        }

        status(
          'Room allocation recorded. Contact the guest separately to confirm their stay.'
        );

        await load();
      }
    );

    confirmButton.disabled = activeRooms.length === 0;

    actions.append(confirmButton);
    selection.append(actions);
    section.append(selection);
  }

  card.append(section);
}

/* -----------------------------------------------------
   PRIVATE RESERVATION NOTES
   ----------------------------------------------------- */

function renderPrivateNotes(card, item) {
  const section = setClass(
    el('section'),
    'record-notes-section premium-reservation-notes'
  );

  section.append(
    setClass(
      el('h4', 'Private staff notes'),
      'record-section-title'
    ),
    setClass(
      el(
        'p',
        'Internal notes for hotel staff only. These are not sent to the guest.'
      ),
      'reservation-notes-help'
    )
  );

  const textarea = setClass(
    el('textarea'),
    'record-notes-input'
  );

  textarea.value = item.staff_notes || '';
  textarea.rows = 3;
  textarea.maxLength = 2000;
  textarea.placeholder =
    'Record follow-up, guest preferences or internal notes…';

  textarea.setAttribute('aria-label', 'Private staff notes');

  const actions = setClass(
    el('div'),
    'record-notes-actions'
  );

  const save = makeButton(
    'Save private notes',
    'record-button-secondary',
    async () => {
      save.disabled = true;

      const { error } = await client
        .from('reservation_requests')
        .update({ staff_notes: textarea.value })
        .eq('id', item.id);

      save.disabled = false;

      status(
        error
          ? 'Could not save notes: ' + error.message
          : 'Private notes saved.'
      );
    }
  );

  actions.append(save);
  section.append(textarea, actions);
  card.append(section);
}

/* -----------------------------------------------------
   ROOM INVENTORY AND ROOM BLOCKS
   ----------------------------------------------------- */

async function loadOperations() {
  if (!client || !dashboard || dashboard.hidden) return;

  const [roomResult, blockResult] = await Promise.all([
    client
      .from('room_inventory')
      .select('*')
      .order('room_code'),

    client
      .from('room_blocks')
      .select('*')
      .order('check_in', { ascending: false })
      .limit(1000)
  ]);

  if (roomResult.error || blockResult.error) {
    const error =
      roomResult.error?.message ||
      blockResult.error?.message;

    status(
      'Inventory unavailable. Check database permissions and schema. ' +
      error
    );

    return;
  }

  rooms = roomResult.data || [];
  blocks = blockResult.data || [];

  renderOperations();
}

function renderOperations() {
  const inventory = document.getElementById('inventory');

  if (!inventory) return;

  inventory.replaceChildren();

  if (roomSelector) roomSelector.replaceChildren();

  for (const room of rooms) {
    if (roomSelector) {
      const option = el(
        'option',
        `${room.room_code} · ${room.room_type}`
      );

      option.value = room.id;
      roomSelector.append(option);
    }

    const entry = setClass(
      el('div'),
      'entry inventory-entry'
    );

    const rate =
      room.nightly_rate_usd == null
        ? 'Rate not set'
        : formatMoney(room.nightly_rate_usd) + '/night';

    const details = setClass(
      el('div'),
      'inventory-room-details'
    );

    details.append(
      el(
        'strong',
        `${room.room_code} · ${room.room_type}`
      ),
      el('p', rate),
      setClass(
        el(
          'span',
          room.active ? 'Active' : 'Inactive'
        ),
        room.active
          ? 'room-state room-state-active'
          : 'room-state room-state-inactive'
      )
    );

    const toggle = makeButton(
      room.active ? 'Deactivate' : 'Activate',
      'record-button-secondary',
      async () => {
        if (
          room.active &&
          !window.confirm(
            'Deactivate this room? Make sure this will not disrupt an existing reservation.'
          )
        ) return;

        toggle.disabled = true;

        const { error } = await client
          .from('room_inventory')
          .update({ active: !room.active })
          .eq('id', room.id);

        if (error) {
          status('Could not update room: ' + error.message);
          toggle.disabled = false;
          return;
        }

        status('Room status updated.');
        await loadOperations();
        await render('reservation_requests', 'reservations');
      }
    );

    entry.append(details, toggle);
    inventory.append(entry);
  }

  if (!rooms.length) {
    emptyState(
      inventory,
      'No rooms entered. Add the actual hotel rooms above.'
    );
  }

  const date = viewDate?.value || todayISO();
  const activeRooms = rooms.filter(room => room.active);

  const occupied = activeRooms.filter(room =>
    blocks.some(block =>
      block.room_id === room.id &&
      block.check_in <= date &&
      block.check_out > date &&
      block.block_type === 'booking'
    )
  ).length;

  const held = activeRooms.filter(room =>
    blocks.some(block =>
      block.room_id === room.id &&
      block.check_in <= date &&
      block.check_out > date &&
      block.block_type !== 'booking'
    )
  ).length;

  if (metrics) {
    metrics.replaceChildren();

    const values = [
      ['Active rooms', activeRooms.length],
      ['Booked on selected date', occupied],
      ['Unavailable rooms', held],
      [
        'Booked occupancy',
        activeRooms.length
          ? Math.round((occupied / activeRooms.length) * 100) + '%'
          : 'N/A'
      ]
    ];

    for (const [label, value] of values) {
      const metric = setClass(el('div'), 'metric-card');

      metric.append(
        setClass(el('p', label), 'metric-label'),
        setClass(el('strong', value), 'metric-value')
      );

      metrics.append(metric);
    }
  }

  renderCalendar(date);
  renderBlocks();
}

function renderCalendar(date) {
  const target = document.getElementById('calendar');

  if (!target || !date) return;

  target.replaceChildren();

  const start = new Date(date + 'T12:00:00');

  if (Number.isNaN(start.getTime())) return;

  const table = setClass(el('table'), 'calendar-table');
  const header = el('tr');

  header.append(el('th', 'Room / Date'));

  const days = [];

  for (let index = 0; index < 14; index++) {
    const day = new Date(start);
    day.setDate(start.getDate() + index);

    const iso = dayString(day);
    days.push(iso);

    header.append(el('th', iso.slice(5)));
  }

  table.append(header);

  for (const room of rooms.filter(item => item.active)) {
    const row = el('tr');

    row.append(el('th', room.room_code));

    for (const day of days) {
      const block = blocks.find(item =>
        item.room_id === room.id &&
        item.check_in <= day &&
        item.check_out > day
      );

      const label = !block
        ? '—'
        : block.block_type === 'booking'
          ? 'Booked'
          : block.block_type === 'hold'
            ? 'Hold'
            : 'Maint.';

      const cell = el('td', label);

      cell.className = block
        ? block.block_type === 'booking'
          ? 'occupied'
          : 'blocked'
        : 'available';

      row.append(cell);
    }

    table.append(row);
  }

  target.append(table);
}

function renderBlocks() {
  const target = document.getElementById('blocks');

  if (!target) return;

  target.replaceChildren();

  target.append(
    setClass(el('h3', 'Recent Room Blocks'), 'record-section-title')
  );

  if (!blocks.length) {
    target.append(
      setClass(el('p', 'No blocks recorded.'), 'admin-empty-state')
    );
    return;
  }

  for (const block of blocks.slice(0, 100)) {
    const room = rooms.find(
      item => item.id === block.room_id
    );

    const entry = setClass(
      el('article'),
      'entry room-block-entry'
    );

    entry.append(
      el(
        'strong',
        `${room?.room_code || 'Room'} · ${block.block_type} · ${block.check_in} → ${block.check_out}`
      ),
      el('p', block.guest_reference || 'No reference')
    );

    const linked = Boolean(block.reservation_request_id);

    const remove = makeButton(
      linked ? 'Linked to reservation' : 'Remove block',
      'record-button-secondary',
      async () => {
        if (!window.confirm('Remove this room block?')) return;

        remove.disabled = true;

        const { error } = await client
          .from('room_blocks')
          .delete()
          .eq('id', block.id);

        if (error) {
          status('Could not remove block: ' + error.message);
          remove.disabled = false;
          return;
        }

        status('Room block removed.');
        await loadOperations();
      }
    );

    remove.disabled = linked;
    entry.append(remove);
    target.append(entry);
  }
}

/* -----------------------------------------------------
   AUTHENTICATION FORM HANDLERS
   ----------------------------------------------------- */

const loginForm = document.getElementById('loginForm');

if (loginForm) {
  loginForm.addEventListener('submit', async event => {
    event.preventDefault();

    if (!client) {
      status('Configure Supabase first.');
      return;
    }

    const email = document.getElementById('email');
    const password = document.getElementById('password');

    if (!email || !password) {
      status('The login form is missing required fields.');
      return;
    }

    status('Signing in…');

    const { error } = await client.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value
    });

    if (error) {
      status('Sign in failed: ' + error.message);
      return;
    }

    password.value = '';
    await load();
  });
}


const logoutButton = document.getElementById('logout');

if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    // Stop the inactivity timer.
    stopLoginExpiry();

    try {
      if (client) {
        const { error } = await client.auth.signOut();

        if (error) {
          console.error('Logout error:', error);
          status('Unable to sign out. Please try again.');
          return;
        }
      }

      // Hide the dashboard and return to the login screen.
      if (dashboard) dashboard.hidden = true;
      if (login) login.hidden = false;

      // Clear the password field, if present.
      const password = document.getElementById('password');
      if (password) password.value = '';

      status('You have signed out.');

    } catch (error) {
      console.error('Logout error:', error);
      status('An error occurred while signing out. Please try again.');
    }
  });
}

const refreshButton = document.getElementById('refresh');

if (refreshButton) {
  refreshButton.addEventListener('click', load);
}


/* -----------------------------------------------------
   ADD ROOM
   ----------------------------------------------------- */

const roomForm = document.getElementById('roomForm');

if (roomForm) {
  roomForm.addEventListener('submit', async event => {
    event.preventDefault();

    if (!client) return;

    const form = event.currentTarget;
    const fields = new FormData(form);

    const roomCode = String(
      fields.get('room_code') || ''
    ).trim();

    const roomType = String(
      fields.get('room_type') || ''
    ).trim();

    const rateValue = fields.get('rate');
    const rate = rateValue === '' || rateValue === null
      ? null
      : Number(rateValue);

    if (!roomCode || !roomType) {
      status('Enter the room code and room type.');
      return;
    }

    if (rate !== null && (!Number.isFinite(rate) || rate < 0)) {
      status('Enter a valid nightly rate.');
      return;
    }

    const { error } = await client
      .from('room_inventory')
      .insert({
        room_code: roomCode,
        room_type: roomType,
        nightly_rate_usd: rate
      });

    if (error) {
      status('Could not add room: ' + error.message);
      return;
    }

    form.reset();
    status('Room added.');

    await loadOperations();
    await render('reservation_requests', 'reservations');
  });
}

/* -----------------------------------------------------
   ADD ROOM BLOCK
   ----------------------------------------------------- */

const blockForm = document.getElementById('blockForm');

if (blockForm) {
  blockForm.addEventListener('submit', async event => {
    event.preventDefault();

    if (!client) return;

    const form = event.currentTarget;
    const fields = new FormData(form);

    const roomId = String(fields.get('room_id') || '');
    const checkIn = String(fields.get('check_in') || '');
    const checkOut = String(fields.get('check_out') || '');
    const blockType = String(fields.get('block_type') || '');
    const guestReference = String(
      fields.get('guest_reference') || ''
    ).trim();

    if (!roomId || !checkIn || !checkOut || !blockType) {
      status('Complete all required room-block fields.');
      return;
    }

    if (checkOut <= checkIn) {
      status('Checkout must be later than check-in.');
      return;
    }

    const room = rooms.find(item => item.id === roomId);

    if (!room) {
      status('Select a valid room.');
      return;
    }

    const validBlockTypes = ['booking', 'hold', 'maintenance'];

    if (!validBlockTypes.includes(blockType)) {
      status('Select a valid room-block type.');
      return;
    }

    const overlaps = blocks.some(block =>
      block.room_id === roomId &&
      checkIn < block.check_out &&
      checkOut > block.check_in
    );

    if (overlaps) {
      status(
        'This room already has a booking or block overlapping those dates. Review the calendar first.'
      );
      return;
    }

    const { error } = await client
      .from('room_blocks')
      .insert({
        room_id: roomId,
        check_in: checkIn,
        check_out: checkOut,
        block_type: blockType,
        guest_reference: guestReference || null
      });

    if (error) {
      status('Unable to save block: ' + error.message);
      return;
    }

    form.reset();

    if (viewDate) viewDate.value = todayISO();

    status('Room block saved.');
    await loadOperations();
  });
}

const reloadCalendar = document.getElementById('reloadCalendar');

if (reloadCalendar) {
  reloadCalendar.addEventListener('click', loadOperations);
}

if (viewDate) {
  viewDate.addEventListener('change', () => {
    renderOperations();
  });
}

/* -----------------------------------------------------
   CSV EXPORT
   ----------------------------------------------------- */

async function exportCSV(table) {
  if (!client) {
    status('Configure Supabase first.');
    return;
  }

  const { data, error } = await client
    .from(table)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    status('Export failed: ' + error.message);
    return;
  }

  if (!data || !data.length) {
    status('No records to export.');
    return;
  }

  const columns = table === 'reservation_requests'
    ? [
        'id',
        'created_at',
        'guest_name',
        'guest_email',
        'guest_phone',
        'check_in',
        'check_out',
        'guests',
        'room_preference',
        'status',
        'staff_notes'
      ]
    : [
        'id',
        'created_at',
        'sender_name',
        'sender_email',
        'sender_phone',
        'topic',
        'message',
        'status'
      ];

  const escapeCSV = value => {
    let safeValue = String(value ?? '');

    // Reduce spreadsheet formula injection risk when a CSV
    // is opened in Excel or another spreadsheet application.
    if (/^[=+\-@\t\r]/.test(safeValue)) {
      safeValue = "'" + safeValue;
    }

    return '"' + safeValue.replace(/"/g, '""') + '"';
  };

  const csv =
    '\uFEFF' +
    [
      columns.map(escapeCSV).join(','),
      ...data.map(record =>
        columns
          .map(column => escapeCSV(record[column]))
          .join(',')
      )
    ].join('\r\n');

  const blob = new Blob([csv], {
    type: 'text/csv;charset=utf-8'
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = table + '-' + todayISO() + '.csv';

  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);

  status('Export downloaded. Store guest data securely.');
}

const exportReservations =
  document.getElementById('exportReservations');

if (exportReservations) {
  exportReservations.addEventListener('click', () =>
    exportCSV('reservation_requests')
  );
}

const exportMessages =
  document.getElementById('exportMessages');

if (exportMessages) {
  exportMessages.addEventListener('click', () =>
    exportCSV('contact_messages')
  );
}



/* -----------------------------------------------------
   BOOKED ROOMS
   Loads active booking allocations from Supabase.
   Read-only: does not modify hotel data.
   ----------------------------------------------------- */

async function loadBookedRooms() {
  const container = document.getElementById('bookedRooms');

  if (!container) {
    console.error('Booked Rooms container #bookedRooms was not found.');
    return;
  }

  if (!client) {
    container.innerHTML =
      '<p class="admin-error">Supabase is not initialized.</p>';
    return;
  }

  container.innerHTML = '<p>Loading booked rooms…</p>';

  try {
    // Find active room allocations linked to reservations.
    const { data: blocks, error: blocksError } = await client
      .from('room_blocks')
      .select(
        'id, room_id, check_in, check_out, block_type, guest_reference, reservation_request_id, released_at'
      )
      .eq('block_type', 'booking')
      .is('released_at', null)
      .not('reservation_request_id', 'is', null)
      .order('check_in', { ascending: true });

    if (blocksError) throw blocksError;

    if (!blocks || blocks.length === 0) {
      container.innerHTML =
        '<p>No active booked rooms found.</p>';
      return;
    }

    const roomIds = [...new Set(blocks.map(row => row.room_id).filter(Boolean))];
    const reservationIds = [
      ...new Set(blocks.map(row => row.reservation_request_id).filter(Boolean))
    ];

    // Fetch room details.
    const [roomsResult, reservationsResult] = await Promise.all([
      roomIds.length
        ? client
            .from('room_inventory')
            .select('id, room_code, room_type')
            .in('id', roomIds)
        : Promise.resolve({ data: [], error: null }),

      reservationIds.length
        ? client
            .from('reservation_requests')
            .select(
              'id, guest_name, guest_email, guest_phone, check_in, check_out, guests, status'
            )
            .in('id', reservationIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (roomsResult.error) throw roomsResult.error;
    if (reservationsResult.error) throw reservationsResult.error;

    const roomsById = new Map(
      (roomsResult.data || []).map(room => [room.id, room])
    );

    const reservationsById = new Map(
      (reservationsResult.data || []).map(
        reservation => [reservation.id, reservation]
      )
    );

    const escapeBookedText = value =>
      String(value ?? '—').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character]);

    const formatBookedDate = value => {
      if (!value) return '—';

      const date = new Date(`${value}`.slice(0, 10) + 'T00:00:00');

      return Number.isNaN(date.getTime())
        ? escapeBookedText(value)
        : date.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          });
    };

    const rows = blocks.map(block => {
      const room = roomsById.get(block.room_id);
      const reservation = reservationsById.get(
        block.reservation_request_id
      );

      return `
        <tr>
          <td>${escapeBookedText(room?.room_code || 'Room unavailable')}</td>
          <td>${escapeBookedText(room?.room_type)}</td>
          <td>${escapeBookedText(reservation?.guest_name || block.guest_reference)}</td>
          <td>${escapeBookedText(reservation?.guest_email)}</td>
          <td>${escapeBookedText(reservation?.guest_phone)}</td>
          <td>${formatBookedDate(reservation?.check_in || block.check_in)}</td>
          <td>${formatBookedDate(reservation?.check_out || block.check_out)}</td>
          <td>${escapeBookedText(reservation?.guests)}</td>
          <td>${escapeBookedText(reservation?.status || 'Unavailable')}</td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="admin-table-scroll">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Room</th>
              <th>Room type</th>
              <th>Guest</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Check-in</th>
              <th>Check-out</th>
              <th>Guests</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="admin-muted">
        ${blocks.length} active room allocation${blocks.length === 1 ? '' : 's'}.
      </p>
    `;
  } catch (error) {
    console.error('Failed to load booked rooms:', error);

    container.innerHTML = `
      <p class="admin-error">
        Could not load booked rooms.
        Please check the browser console for details.
      </p>
    `;
  }
}



/* -----------------------------------------------------
   16. STAFF LOGIN SESSION EXPIRY
   Automatically signs staff out after 30 minutes
   without activity.
   ----------------------------------------------------- */

const LOGIN_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

let loginExpiryTimer = null;
let loginExpiryActive = false;
let loginExpiryListenersAdded = false;

function stopLoginExpiry() {
  loginExpiryActive = false;

  if (loginExpiryTimer !== null) {
    clearTimeout(loginExpiryTimer);
    loginExpiryTimer = null;
  }
}

function scheduleLoginExpiry() {
  if (!loginExpiryActive) return;

  if (loginExpiryTimer !== null) {
    clearTimeout(loginExpiryTimer);
  }

  loginExpiryTimer = setTimeout(
    expireLoginSession,
    LOGIN_IDLE_TIMEOUT_MS
  );
}

async function expireLoginSession() {
  stopLoginExpiry();

  try {
    if (client) {
      await client.auth.signOut();
    }
  } catch (error) {
    console.error('Session expiry sign-out error:', error);
  } finally {
    const dashboard = document.getElementById('dashboard');
    const login = document.getElementById('login');
    const status = document.getElementById('status');
    const password = document.getElementById('password');

    if (dashboard) dashboard.hidden = true;
    if (login) login.hidden = false;
    if (password) password.value = '';

    if (status) {
      status.textContent =
        'Your session expired after 30 minutes of inactivity. Please sign in again.';
    }
  }
}

function startLoginExpiry() {
  loginExpiryActive = true;
  scheduleLoginExpiry();

  if (loginExpiryListenersAdded) return;
  loginExpiryListenersAdded = true;

  const activityEvents = [
    'pointerdown',
    'keydown',
    'scroll',
    'touchstart'
  ];

  activityEvents.forEach(eventName => {
    document.addEventListener(eventName, () => {
      if (loginExpiryActive) {
        scheduleLoginExpiry();
      }
    }, { passive: true });
  });
}


/* -----------------------------------------------------
   INITIALIZE
   ----------------------------------------------------- */

if (viewDate && !viewDate.value) {
  viewDate.value = todayISO();
}

load();

/* -----------------------------------------------------
   DASHBOARD SIDEBAR NAVIGATION
   ----------------------------------------------------- */

const dashboardSectionIds = [
  'overview',
  'inventory-section',
  'calendar-section',
  'reservations-section',
  'walkin-section',
  'booked-rooms-section',
  'billing-section',
  'messages-section'
];

function showDashboardSection(sectionId, updateHash = false) {
  const selected = dashboardSectionIds.includes(sectionId)
    ? sectionId
    : 'overview';

  // Show the selected section and hide the others.
  dashboardSectionIds.forEach(id => {
    const section = document.getElementById(id);

    if (section) {
      section.hidden = id !== selected;
    }
  });

  // Keep the sidebar's active state synchronized.
  document.querySelectorAll('[data-dashboard-link]').forEach(link => {
    const active = link.getAttribute('href') === '#' + selected;

    link.classList.toggle('is-active', active);

    if (active) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });

  // Update the URL hash when a navigation link is clicked.
  if (updateHash && window.location.hash !== '#' + selected) {
    window.history.replaceState(null, '', '#' + selected);
  }
}

function initializeDashboardNavigation() {
  document.querySelectorAll('[data-dashboard-link]').forEach(link => {
    link.addEventListener('click', event => {
      const target = link.getAttribute('href')?.slice(1);

      if (!dashboardSectionIds.includes(target)) return;

      event.preventDefault();
      showDashboardSection(target, true);
    });
  });

  // Support direct links and browser hash changes.
  window.addEventListener('hashchange', () => {
    showDashboardSection(window.location.hash.slice(1));
  });

  showDashboardSection(window.location.hash.slice(1));
}
