/* =====================================================
   EAST AFRO HOTEL — ADMIN DASHBOARD
   Authentication, reservations, messages, room inventory,
   room blocks, calendar, private notes and CSV exports.

   Reservation workflow:
   - Confirmation allocates a room through Supabase RPC.
   - Cancellation releases the allocation, retaining history.
   - Released allocations do not block future bookings.
   - Cancelled reservations can be allocated again.
   - Booked Rooms shows active linked booking allocations.
   - Status changes cannot bypass an active allocation.
   - Existing database protection functions remain enabled.
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
window.hotelSupabaseClient = client;
let rooms = [];
let blocks = [];
let bookedRoomRecords = [];
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

function isReleased(block) {
  return Boolean(block?.released_at);
}

function isActiveBlock(block) {
  return Boolean(block) && !isReleased(block);
}

function hasActiveReservationAllocation(requestId) {
  if (!requestId) return false;

  return blocks.some(block =>
    block.reservation_request_id === requestId &&
    block.block_type === 'booking' &&
    isActiveBlock(block)
  );
}

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

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
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

  const amount = Number(value);

  return Number.isFinite(amount)
    ? '$' + amount.toFixed(2)
    : 'Rate not set';
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
   AUTHENTICATION AND DASHBOARD LOADING
   ----------------------------------------------------- */

async function load() {
  if (loading) return;

  loading = true;

  try {
    if (!client) {
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
      await client.auth.signOut();

      if (login) login.hidden = false;
      if (dashboard) dashboard.hidden = true;

      status(
        'This account is not approved for hotel staff access.'
      );

      if (staffError) {
        console.error('Staff authorization error:', staffError);
      }

      return;
    }

    if (login) login.hidden = true;
    if (dashboard) dashboard.hidden = false;

    status('Signed in as ' + (user.email || 'approved staff'));

    await loadOperations();

    await Promise.all([
      render('reservation_requests', 'reservations'),
      render('contact_messages', 'messages'),
      loadBookedRooms()
    ]);

    document.dispatchEvent(
      new CustomEvent('hotel:dashboard-ready')
    );

  } catch (error) {
    console.error('Dashboard loading error:', error);
    status(
      'The dashboard could not finish loading. Check the console.'
    );
  } finally {
    loading = false;
  }
}

/*
 * Refresh reservation-related displays after confirmation
 * or cancellation. Uses the existing dashboard loader.
 */
async function refreshReservationViews() {
  await load();
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
        el('p', 'Received ' + formatDate(item.created_at)),
        'record-received'
      )
    );

    card.append(header);

    const contactGrid = setClass(
      el('div'),
      'record-contact-grid'
    );

    addDetail(contactGrid, 'Email address', email);
    addDetail(contactGrid, 'Phone number', phone);

    card.append(contactGrid);

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

      addReservationDetail('Check-in', formatDate(item.check_in));
      addReservationDetail('Check-out', formatDate(item.check_out));
      addReservationDetail('Guests', item.guests);
      addReservationDetail('Room preference', item.room_preference);

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

        }

    /* Status control */

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

    const options = isReservation
      ? ['new', 'contacted', 'declined']
      : ['new', 'replied', 'closed'];

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

    const activeAllocation =
      isReservation &&
      hasActiveReservationAllocation(item.id);

    statusSelect.disabled =
      item.status === 'confirmed' || activeAllocation;

    if (activeAllocation && item.status !== 'confirmed') {
      statusLabel.append(
        setClass(
          el(
            'small',
            'Status changes are locked while an active room allocation exists.'
          ),
          'record-status-help'
        )
      );
    }

    statusLabel.append(statusSelect);
    statusSection.append(statusLabel);
    card.append(statusSection);

    statusSelect.addEventListener('change', async () => {
      const previousStatus = item.status || 'new';
      const nextStatus = statusSelect.value;

      if (
        isReservation &&
        hasActiveReservationAllocation(item.id)
      ) {
        statusSelect.value = previousStatus;
        statusSelect.disabled = true;

        status(
          'This reservation has an active room allocation. Use the reservation actions instead.'
        );

        return;
      }

      statusSelect.disabled = true;

      try {
        const { error: updateError } = await client
          .from(table)
          .update({ status: nextStatus })
          .eq('id', item.id);

        if (updateError) {
          statusSelect.value = previousStatus;
          statusSelect.disabled =
            previousStatus === 'confirmed' ||
            (
              isReservation &&
              hasActiveReservationAllocation(item.id)
            );

          status('Could not update status: ' + updateError.message);
          return;
        }

        status('Status updated.');
        await render(table, targetId);

      } catch (error) {
        console.error('Status update error:', error);

        statusSelect.value = previousStatus;
        statusSelect.disabled =
          previousStatus === 'confirmed' ||
          (
            isReservation &&
            hasActiveReservationAllocation(item.id)
          );

        status('Unexpected error while updating status.');
      }
    });

    if (isReservation) {
      renderReservationActions(card, item);
      renderPrivateNotes(card, item);
    }

    target.append(card);
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
  const activeAllocation = hasActiveReservationAllocation(item.id);

  /*
   * A confirmed reservation should have an active allocation.
   * If the data is inconsistent, show a warning rather than
   * silently treating it as a normal pending request.
   */
  if (currentStatus === 'confirmed') {
    const notice = setClass(
      el('div'),
      'reservation-action-notice ' +
        (
          activeAllocation
            ? 'reservation-action-success'
            : 'reservation-action-warning'
        )
    );

    notice.append(
      el(
        'strong',
        activeAllocation
          ? 'Room allocation recorded'
          : 'Confirmed status needs review'
      ),
      el(
        'p',
        activeAllocation
          ? 'The reservation has an active room allocation. Contact the guest separately to communicate the booking details.'
          : 'This reservation is marked confirmed, but no active linked room allocation was found. Check the room-block history and database records before taking further action.'
      )
    );

    section.append(notice);

    if (activeAllocation) {
      const actions = setClass(
        el('div'),
        'reservation-action-buttons'
      );

      const cancel = makeButton(
        'Cancel room allocation',
        'record-button-danger',
        async () => {
          if (!window.confirm(
            'Cancel this room allocation? The room will be released, and the guest will not be notified automatically.'
          )) return;

          cancel.disabled = true;

          try {
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
              'Allocation cancelled and room released. Please notify the guest separately.'
            );

            await refreshReservationViews();

          } catch (error) {
            console.error('Cancellation error:', error);
            status('Unexpected error while cancelling the allocation.');
            cancel.disabled = false;
          }
        }
      );

      actions.append(cancel);
      section.append(actions);
    }

  } else if (currentStatus === 'declined') {
    const notice = setClass(
      el('div'),
      'reservation-action-notice reservation-action-declined'
    );

    notice.append(
      el('strong', 'Request declined'),
      el(
        'p',
        'This request is declined. If it needs to be reconsidered, change its status using the status selector.'
      )
    );

    section.append(notice);

  } else if (activeAllocation) {
    /*
     * Defensive fallback for an active allocation whose
     * reservation status is not confirmed.
     */
    const notice = setClass(
      el('div'),
      'reservation-action-notice reservation-action-warning'
    );

    notice.append(
      el('strong', 'Active room allocation exists'),
      el(
        'p',
        'This reservation already has an active room allocation. Do not create another allocation. Review the existing room block.'
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
        'Check the room calendar for the entire stay. The database confirmation function must also validate the allocation and prevent overlapping room blocks.'
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

        try {
          const { error } = await client.rpc(
            'confirm_hotel_reservation',
            {
              p_request_id: item.id,
              p_room_id: room.id,
              p_reference:
                'Reservation ' + String(item.id).slice(0, 8)
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

          await refreshReservationViews();

        } catch (error) {
          console.error('Reservation confirmation error:', error);

          status('Unexpected error while confirming the reservation.');

          confirmButton.disabled = false;
          select.disabled = false;
        }
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
  textarea.maxLength = 1000;
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

      try {
        const { error } = await client
          .from('reservation_requests')
          .update({ staff_notes: textarea.value })
          .eq('id', item.id);

        if (error) {
          status('Could not save notes: ' + error.message);
          return;
        }

        item.staff_notes = textarea.value;
        status('Private notes saved.');

      } catch (error) {
        console.error('Private notes error:', error);
        status('Unexpected error while saving private notes.');

      } finally {
        save.disabled = false;
      }
    }
  );

  actions.append(save);
  section.append(textarea, actions);
  card.append(section);
}

/* -----------------------------------------------------
   BOOKED ROOMS — ACTIVE ALLOCATIONS ONLY
   ----------------------------------------------------- */

async function loadBookedRooms() {
  const target = document.getElementById('bookedRooms');

  if (!target || !client) return;

  emptyState(target, 'Loading booked rooms…');

  const { data: allocations, error: allocationError } =
    await client
      .from('room_blocks')
      .select('*')
      .eq('block_type', 'booking')
      .is('released_at', null)
      .not('reservation_request_id', 'is', null)
      .order('check_in', { ascending: false })
      .limit(1000);

  if (allocationError) {
    bookedRoomRecords = [];

    emptyState(
      target,
      'Unable to load booked rooms: ' + allocationError.message,
      true
    );

    status(
      'Booked rooms could not be loaded: ' +
      allocationError.message
    );

    return;
  }

  if (!allocations || allocations.length === 0) {
    bookedRoomRecords = [];

    emptyState(
      target,
      'No active room allocations found. Released allocations remain in room-block history.'
    );

    return;
  }

  const reservationIds = [
    ...new Set(
      allocations
        .map(allocation => allocation.reservation_request_id)
        .filter(Boolean)
    )
  ];

  const roomIds = [
    ...new Set(
      allocations
        .map(allocation => allocation.room_id)
        .filter(Boolean)
    )
  ];

  const [reservationResult, roomResult] = await Promise.all([
    client
      .from('reservation_requests')
      .select('*')
      .in('id', reservationIds),

    client
      .from('room_inventory')
      .select('*')
      .in('id', roomIds)
  ]);

  if (reservationResult.error || roomResult.error) {
    bookedRoomRecords = [];

    const message =
      reservationResult.error?.message ||
      roomResult.error?.message;

    emptyState(
      target,
      'Unable to load guest or room details: ' + message,
      true
    );

    status('Booked room details could not be loaded: ' + message);
    return;
  }

  const reservationsById = new Map(
    (reservationResult.data || []).map(reservation => [
      reservation.id,
      reservation
    ])
  );

  const roomsById = new Map(
    (roomResult.data || []).map(room => [
      room.id,
      room
    ])
  );

  bookedRoomRecords = allocations.map(allocation => {
    const reservation =
      reservationsById.get(
        allocation.reservation_request_id
      ) || {};

    const room =
      roomsById.get(allocation.room_id) || {};

    return {
      allocation_id: allocation.id,

      reservation_request_id:
        allocation.reservation_request_id,

      room_code:
        room.room_code || 'Room unavailable',

      room_type:
        room.room_type || 'Not available',

      guest_name:
        reservation.guest_name || 'Guest',

      guest_email:
        reservation.guest_email || '',

      guest_phone:
        reservation.guest_phone || '',

      check_in: allocation.check_in,
      check_out: allocation.check_out,

      guests: reservation.guests ?? '',

      status: reservation.status || 'unknown',

      guest_reference:
        allocation.guest_reference || '',

      created_at: allocation.created_at || ''
    };
  });

  renderBookedRooms();
}

/* -----------------------------------------------------
   RENDER BOOKED ROOMS TABLE
   ----------------------------------------------------- */

function renderBookedRooms() {
  const target = document.getElementById('bookedRooms');

  if (!target) return;
    if (!bookedRoomRecords.length) {
    emptyState(
      target,
      'No active confirmed room allocations found.'
    );

    return;
  }

  target.replaceChildren();

  const wrapper = setClass(
    el('div'),
    'booked-rooms-table-wrapper'
  );

  const table = setClass(
    el('table'),
    'admin-data-table booked-rooms-table'
  );

  const headers = [
    'Room',
    'Room type',
    'Guest',
    'Email',
    'Phone',
    'Check-in',
    'Check-out',
    'Guests',
    'Status'
  ];

  const thead = el('thead');
  const headerRow = el('tr');

  headers.forEach(label => headerRow.append(el('th', label)));

  thead.append(headerRow);
  table.append(thead);

  const tbody = el('tbody');

  bookedRoomRecords.forEach(record => {
    const row = el('tr');

    const values = [
      record.room_code,
      record.room_type,
      record.guest_name,
      record.guest_email || 'Not provided',
      record.guest_phone || 'Not provided',
      formatDate(record.check_in),
      formatDate(record.check_out),
      record.guests === ''
        ? 'Not provided'
        : record.guests,
      record.status
    ];

    values.forEach(value => {
      row.append(el('td', String(value ?? '')));
    });

    tbody.append(row);
  });

  table.append(tbody);
  wrapper.append(table);
  target.append(wrapper);
}

/* -----------------------------------------------------
   CSV HELPERS
   ----------------------------------------------------- */

function escapeCSV(value) {
  let safeValue = String(value ?? '');

  if (/^[=+\-@\t\r]/.test(safeValue)) {
    safeValue = "'" + safeValue;
  }

  return '"' + safeValue.replace(/"/g, '""') + '"';
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], {
    type: 'text/csv;charset=utf-8'
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;

  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* -----------------------------------------------------
   EXPORT BOOKED ROOMS TO CSV
   ----------------------------------------------------- */

async function exportBookedRoomsCSV() {
  if (!client) {
    status('Configure Supabase first.');
    return;
  }

  await loadBookedRooms();

  if (!bookedRoomRecords.length) {
    status('No active booked room records to export.');
    return;
  }

  const columns = [
    ['room_code', 'Room'],
    ['room_type', 'Room type'],
    ['guest_name', 'Guest name'],
    ['guest_email', 'Guest email'],
    ['guest_phone', 'Guest phone'],
    ['check_in', 'Check-in'],
    ['check_out', 'Check-out'],
    ['guests', 'Guests'],
    ['status', 'Reservation status'],
    ['guest_reference', 'Reference'],
    ['reservation_request_id', 'Reservation ID']
  ];

  const csv =
    '\uFEFF' +
    [
      columns
        .map(([, label]) => escapeCSV(label))
        .join(','),

      ...bookedRoomRecords.map(record =>
        columns
          .map(([key]) => escapeCSV(record[key]))
          .join(',')
      )
    ].join('\r\n');

  downloadCSV(
    csv,
    'booked-rooms-' + todayISO() + '.csv'
  );

  status(
    'Active booked rooms export downloaded. Store guest data securely.'
  );
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

  window.hotelRoomBlocksLoaded = !blockResult.error;

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
  await loadOverview();
}

function renderOperations() {
  const inventory = document.getElementById('inventory');

  if (!inventory) return;

  inventory.replaceChildren();

  if (roomSelector) {
    roomSelector.replaceChildren();

    const placeholder = el('option', 'Choose a room…');
    placeholder.value = '';
    placeholder.selected = true;

    roomSelector.append(placeholder);
  }

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
      el('strong', `${room.room_code} · ${room.room_type}`),
      el('p', rate),
      setClass(
        el('span', room.active ? 'Active' : 'Inactive'),
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

        try {
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

        } catch (error) {
          console.error('Room status update error:', error);
          status('Unexpected error while updating the room.');
          toggle.disabled = false;
        }
      }
    );

    entry.append(details, toggle);
    inventory.append(entry);
  }

  if (!rooms.length) {
    emptyState(      inventory,
      'No rooms entered. Add the actual hotel rooms above.'
    );
  }

  const date = viewDate?.value || todayISO();
  const activeRooms = rooms.filter(room => room.active);

  const occupied = activeRooms.filter(room =>
    blocks.some(block =>
      block.room_id === room.id &&
      isActiveBlock(block) &&
      block.check_in <= date &&
      block.check_out > date &&
      block.block_type === 'booking'
    )
  ).length;

  const held = activeRooms.filter(room =>
    blocks.some(block =>
      block.room_id === room.id &&
      isActiveBlock(block) &&
      block.check_in <= date &&
      block.check_out > date &&
      block.block_type !== 'booking'
    )
  ).length;

  renderCalendar(date);
  renderBlocks();
}

/* -----------------------------------------------------
   BALANCED OVERVIEW — SEVEN LIVE INDICATORS
   All daily dates use Africa/Juba (UTC+2).
   ----------------------------------------------------- */

function jubaTodayISO() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Juba',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const part = type => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function overviewCard(label, value) {
  const card = setClass(el('div'), 'metric');
  card.append(el('strong', value), el('span', label));
  return card;
}

let overviewRequestNumber = 0;

async function loadOverview() {
  if (!metrics || !client || !dashboard || dashboard.hidden) return;

  const requestNumber = ++overviewRequestNumber;
  const today = jubaTodayISO();
  const activeRooms = rooms.filter(room => room.active);
  const unavailableIds = new Set(
    blocks.filter(block =>
      isActiveBlock(block) &&
      block.check_in <= today &&
      block.check_out > today
    ).map(block => block.room_id)
  );

  metrics.replaceChildren(overviewCard('Hotel activity', 'Loading…'));

  // Count queries avoid fetching personal guest/message information.
  const results = await Promise.allSettled([
    client.from('hotel_stays')
      .select('room_block_id', { count: 'exact' })
      .eq('status', 'in_house'),
    client.from('reservation_requests')
      .select('id', { count: 'exact', head: true })
      .in('status', ['new', 'contacted']),
    client.from('reservation_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'confirmed')
      .eq('check_in', today),
    client.from('reservation_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'confirmed')
      .eq('check_out', today),
    client.from('contact_messages')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new')
  ]);

  if (requestNumber !== overviewRequestNumber || dashboard.hidden) return;

  function resultAt(index) {
    const item = results[index];
    if (item.status !== 'fulfilled' || item.value.error) {
      console.warn('Overview metric unavailable:',
        item.status === 'fulfilled' ? item.value.error : item.reason);
      return null;
    }
    return item.value;
  }

  const staysResult = resultAt(0);
  const pendingResult = resultAt(1);
  const arrivalsResult = resultAt(2);
  const departuresResult = resultAt(3);
  const messagesResult = resultAt(4);

  const inHouseBlockIds = new Set(
    (staysResult?.data || []).map(stay => stay.room_block_id).filter(Boolean)
  );
  const occupiedRoomIds = new Set(
    blocks.filter(block => inHouseBlockIds.has(block.id))
      .map(block => block.room_id)
  );
  const occupiedCount = staysResult && blocks.length < 1000 &&
    window.hotelRoomBlocksLoaded !== false
    ? occupiedRoomIds.size
    : '—';

  // Do not present a misleading available-room count if the room-block
  // query failed or if the returned block list reached its 1000-row cap.
  const availabilityReliable = blocks.length < 1000 &&
    window.hotelRoomBlocksLoaded !== false;
  const availableCount = availabilityReliable && staysResult
    ? activeRooms.filter(room =>
        !unavailableIds.has(room.id) && !occupiedRoomIds.has(room.id)
      ).length
    : '—';

  const cards = [
    ['Total rooms', rooms.length],
    ['Available rooms', availableCount],
    ['Occupied rooms', occupiedCount],
    ['Pending reservations', pendingResult?.count ?? '—'],
    ["Today's expected arrivals", arrivalsResult?.count ?? '—'],
    ["Today's expected departures", departuresResult?.count ?? '—'],
    ['New messages', messagesResult?.count ?? '—']
  ];

  metrics.replaceChildren(...cards.map(([label, value]) =>
    overviewCard(label, value)
  ));
}

/* -----------------------------------------------------
   ROOM CALENDAR
   ----------------------------------------------------- */

function renderCalendar(date) {
  const target = document.getElementById('calendar');

  if (!target) return;

  target.replaceChildren();

  const start = new Date(date + 'T12:00:00');

  if (Number.isNaN(start.getTime())) {
    emptyState(target, 'Select a valid calendar date.', true);
    return;
  }

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
      const matchingBlocks = blocks.filter(item =>
        item.room_id === room.id &&
        isActiveBlock(item) &&
        item.check_in <= day &&
        item.check_out > day
      );

      const block =
        matchingBlocks.find(item => item.block_type === 'booking') ||
        matchingBlocks.find(item => item.block_type === 'hold') ||
        matchingBlocks[0];

      const label = !block
        ? '—'
        : block.block_type === 'booking'
          ? 'Booked'
          : block.block_type === 'hold'
            ? 'Hold'
            : 'Maint.';

      const cell = el('td', label);

      cell.className = !block
        ? 'available'
        : block.block_type === 'booking'
          ? 'occupied'
          : 'blocked';

      row.append(cell);
    }

    table.append(row);
  }

  target.append(table);
}

/* -----------------------------------------------------
   RECENT ROOM BLOCKS — INCLUDING HISTORY
   ----------------------------------------------------- */

function renderBlocks() {
  const target = document.getElementById('blocks');

  if (!target) return;

  target.replaceChildren(
    setClass(el('h3', 'Recent Room Blocks'), 'record-section-title')
  );

  if (!blocks.length) {
    target.append(
      setClass(el('p', 'No blocks recorded.'), 'admin-empty-state')
    );
    return;
  }

  for (const block of blocks.slice(0, 100)) {
    const room = rooms.find(item => item.id === block.room_id);
    const released = isReleased(block);

    const entry = setClass(
      el('article'),
      'entry room-block-entry' +
        (released ? ' room-block-released' : '')
    );

    const blockTitle =
      `${room?.room_code || 'Room'} · ${block.block_type} · ` +
      `${block.check_in} → ${block.check_out}` +
      (released ? ' · RELEASED' : '');

    entry.append(
      el('strong', blockTitle),
      el('p', block.guest_reference || 'No reference')
    );

    if (released) {
      entry.append(
        el('p', 'Room released at ' + formatDate(block.released_at)),
        setClass(
          el(
            'p',
            'Historical record retained. This block no longer prevents new bookings.'
          ),
          'admin-empty-state'
        )
      );
    }

    const linked = Boolean(block.reservation_request_id);

    const buttonText = released
      ? 'Released · History retained'
      : linked
        ? 'Linked to reservation'
        : 'Remove block';

    const remove = makeButton(
      buttonText,
      'record-button-secondary',
      async () => {
        if (released) {
          status(
            'This block has been released. Its historical record is preserved.'
          );
          return;
        }

        if (linked) {          status(
            'This room block is linked to a reservation. ' +
            'Cancel the reservation through the Reservations section instead.'
          );
          return;
        }

        if (!window.confirm('Remove this room block?')) return;

        remove.disabled = true;

        try {
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

        } catch (error) {
          console.error('Room block deletion error:', error);
          status('Unexpected error while removing the room block.');
          remove.disabled = false;
        }
      }
    );

    remove.disabled = linked || released;

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

    try {
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

    } catch (error) {
      console.error('Sign-in error:', error);
      status('Unexpected error during sign-in.');
    }
  });
}

const logoutButton = document.getElementById('logout');

if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    if (!client) return;

    try {
      const { error } = await client.auth.signOut();

      if (error) {
        status('Could not sign out: ' + error.message);
        return;
      }

      if (login) login.hidden = false;
      if (dashboard) dashboard.hidden = true;

      rooms = [];
      blocks = [];
      bookedRoomRecords = [];

      status('You have signed out.');

    } catch (error) {
      console.error('Sign-out error:', error);
      status('Unexpected error while signing out.');
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

    if (!client) {
      status('Configure Supabase first.');
      return;
    }

    const form = event.currentTarget;
    const fields = new FormData(form);

    const roomCode = String(
      fields.get('room_code') || ''
    ).trim();

    const roomType = String(
      fields.get('room_type') || ''
    ).trim();

    const rateValue = fields.get('rate');

    const rate =
      rateValue === null || rateValue === ''
        ? null
        : Number(rateValue);

    if (!roomCode || !roomType) {
      status('Enter the room code and room type.');
      return;
    }

    if (rate !== null && (!Number.isFinite(rate) || rate < 0)) {
      status('Enter a valid, non-negative nightly rate.');
      return;
    }

    try {
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

    } catch (error) {
      console.error('Add room error:', error);
      status('Unexpected error while adding the room.');
    }
  });
}

/* -----------------------------------------------------
   ADD ROOM BLOCK
   ----------------------------------------------------- */

const blockForm = document.getElementById('blockForm');

if (blockForm) {
  blockForm.addEventListener('submit', async event => {
    event.preventDefault();

    if (!client) {
      status('Configure Supabase first.');
      return;
    }

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

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(checkIn) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)
    ) {
      status('Enter valid check-in and check-out dates.');
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

    if (!room.active) {
      status('This room is inactive. Activate it before creating a block.');
      return;
    }

    if (
      !['booking', 'hold', 'maintenance'].includes(blockType)
    ) {
      status('Select a valid room-block type.');
      return;
    }

    const overlaps = blocks.some(block =>
      block.room_id === roomId &&
      isActiveBlock(block) &&
      checkIn < block.check_out &&
      checkOut > block.check_in
    );

    if (overlaps) {
      status(
        'This room already has a booking or block overlapping those dates. Review the calendar first.'
      );
      return;
    }

    try {
      const { error } = await client
        .from('room_blocks')
        .insert({
          room_id: roomId,
          check_in: checkIn,
          check_out: checkOut,
          block_type: blockType,
          guest_reference: guestReference
        });

      if (error) {
        status('Unable to save block: ' + error.message);
        return;
      }

      form.reset();

      if (viewDate) viewDate.value = todayISO();

      status('Room block saved.');
      await loadOperations();

    } catch (error) {
      console.error('Create room block error:', error);
      status('Unexpected error while saving the room block.');
    }
  });
}
/* -----------------------------------------------------
   CALENDAR REFRESH
   ----------------------------------------------------- */

const reloadCalendar = document.getElementById('reloadCalendar');

if (reloadCalendar) {
  reloadCalendar.addEventListener('click', async () => {
    await loadOperations();
    await loadBookedRooms();
  });
}

if (viewDate) {
  viewDate.addEventListener('change', () => {
    renderOperations();
  });
}

/* -----------------------------------------------------
   CSV EXPORT — RESERVATIONS AND MESSAGES
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

  downloadCSV(
    csv,
    table + '-' + todayISO() + '.csv'
  );

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
   BOOKED ROOMS CSV BUTTON
   ----------------------------------------------------- */

const exportBookedRoomsButton =
  document.getElementById('exportBookedRooms');

if (exportBookedRoomsButton) {
  exportBookedRoomsButton.addEventListener(
    'click',
    exportBookedRoomsCSV
  );
}


/* -----------------------------------------------------
   SECTION-BASED DASHBOARD NAVIGATION
   Shows only the selected management section.
   Keeps the original Supabase operations untouched.
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

  const overviewBar = document.getElementById('overview');
  const overviewMetrics = document.getElementById('overview-metrics');

  if (overviewBar) {
    overviewBar.hidden = selected !== 'overview';
  }

  if (overviewMetrics) {
    overviewMetrics.hidden = selected !== 'overview';
  }

  dashboardSectionIds
    .filter(id => id !== 'overview')
    .forEach(id => {
      const section = document.getElementById(id);
      if (section) section.hidden = id !== selected;
    });

  document.querySelectorAll('[data-dashboard-link]').forEach(link => {
    const active = link.getAttribute('href') === '#' + selected;
    link.classList.toggle('is-active', active);
    if (active) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });

  if (updateHash && window.location.hash !== '#' + selected) {
    window.history.replaceState(null, '', '#' + selected);
  }

  if (dashboard && !dashboard.hidden) {
    const content = document.querySelector('.admin-dashboard-content');
    if (content) content.scrollIntoView({ behavior: 'auto', block: 'start' });
  }
}

function initializeDashboardNavigation() {
  // Enforce hidden even if existing styles specify display: grid/flex.
  const style = document.createElement('style');
  style.textContent =
    '.admin-dashboard-content [hidden] { display: none !important; }';
  document.head.append(style);

  document.querySelectorAll('[data-dashboard-link]').forEach(link => {
    link.addEventListener('click', event => {
      const id = link.getAttribute('href')?.slice(1);
      if (!dashboardSectionIds.includes(id)) return;
      event.preventDefault();
      showDashboardSection(id, true);
    });
  });

  window.addEventListener('hashchange', () => {
    showDashboardSection(window.location.hash.slice(1));
  });

  showDashboardSection(window.location.hash.slice(1));
}


/* -----------------------------------------------------
   WALK-IN BOOKING UI
   Build this section in admin.js so no admin.html edits are needed.
   ----------------------------------------------------- */

function initializeWalkInBookingUI() {
  if (!dashboard || document.getElementById('walkin-section')) return;

  const style = document.createElement('style');
  style.textContent = `
    #walkin-section .walkin-panel{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:20px;margin:16px 0;box-shadow:0 4px 16px rgba(15,23,42,.04)}
    #walkin-section .walkin-intro{color:#64748b;margin:0 0 18px;line-height:1.55}
    #walkin-section .walkin-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    #walkin-section .walkin-field{display:flex;flex-direction:column;gap:6px;min-width:0}
    #walkin-section .walkin-field.full{grid-column:1/-1}
    #walkin-section .walkin-field label{font-size:.9rem;font-weight:600;color:#334155}
    #walkin-section .walkin-field input,#walkin-section .walkin-field select,#walkin-section .walkin-field textarea{box-sizing:border-box;width:100%;min-height:42px;border:1px solid #cbd5e1;border-radius:8px;padding:10px 11px;font:inherit;background:#fff;color:#0f172a}
    #walkin-section .walkin-field textarea{min-height:84px;resize:vertical}
    #walkin-section .walkin-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
    #walkin-section .walkin-actions button{border:0;border-radius:8px;padding:11px 16px;font:inherit;font-weight:600;cursor:pointer}
    #walkin-section #checkWalkinAvailability{background:#e2e8f0;color:#0f172a}
    #walkin-section #createWalkinBooking{background:#123a72;color:#fff}
    #walkin-section button:disabled{opacity:.55;cursor:not-allowed}
    #walkin-section #walkinStatus,#walkin-section #walkinAvailabilityResults{margin-top:14px;padding:11px 12px;border-radius:8px;background:#f1f5f9;color:#334155;white-space:pre-wrap;line-height:1.5}
    #walkin-section #walkinStatus.admin-error-state,#walkin-section #walkinAvailabilityResults.admin-error-state{background:#fef2f2;color:#991b1b}
    @media(max-width:650px){#walkin-section .walkin-grid{grid-template-columns:1fr}#walkin-section .walkin-field.full{grid-column:auto}#walkin-section .walkin-panel{padding:14px}}
  `;
  document.head.append(style);

  const section = document.createElement('section');
  section.id = 'walkin-section';
  section.className = 'admin-section';
  section.hidden = true;

  const panel = document.createElement('div');
  panel.className = 'walkin-panel';
  const heading = el('h2', 'Walk-in Booking');
  const intro = el('p', 'Register a guest who arrives at the front desk without an online reservation. Check the dates and select an available room before confirming. The existing reservation workflow will allocate the room.');
  intro.className = 'walkin-intro';

  const form = document.createElement('form');
  form.id = 'walkinBookingForm';
  form.autocomplete = 'on';

  const grid = document.createElement('div');
  grid.className = 'walkin-grid';

  const field = (labelText, name, type, options = {}) => {
    const wrap = document.createElement('div');
    wrap.className = 'walkin-field' + (options.full ? ' full' : '');
    const label = document.createElement('label');
    label.htmlFor = options.id || name;
    label.textContent = labelText;
    let control;
    if (type === 'select') {
      control = document.createElement('select');
      if (options.options) {
        for (const [value, text] of options.options) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = text;
          control.append(option);
        }
      }
    } else if (type === 'textarea') {
      control = document.createElement('textarea');
    } else {
      control = document.createElement('input');
      control.type = type;
    }
    control.id = options.id || name;
    control.name = name;
    if (options.required) control.required = true;
    if (options.min !== undefined) control.min = options.min;
    if (options.max !== undefined) control.max = options.max;
    if (options.step !== undefined) control.step = options.step;
    if (options.placeholder) control.placeholder = options.placeholder;
    if (options.autocomplete) control.autocomplete = options.autocomplete;
    wrap.append(label, control);
    grid.append(wrap);
    return control;
  };

  field('Guest full name', 'guest_name', 'text', { required:true, placeholder:'Enter guest’s full name', autocomplete:'name' });
  field('Phone number', 'guest_phone', 'tel', { required:true, placeholder:'Guest contact number', autocomplete:'tel' });
  field('Email address (optional)', 'guest_email', 'email', { placeholder:'guest@example.com', autocomplete:'email' });
  field('Number of guests', 'guests', 'number', { required:true, min:1, max:100, step:1, id:'walkinGuests' }).value = '1';
  const checkIn = field('Check-in date', 'check_in', 'date', { required:true, id:'walkinCheckIn' });
  const checkOut = field('Check-out date', 'check_out', 'date', { required:true, id:'walkinCheckOut' });
  field('Available room', 'room_id', 'select', { required:true, id:'walkinRoom', options:[['','Check availability first']] });
  field('Staff notes (optional)', 'staff_notes', 'textarea', { full:true, placeholder:'Internal notes for hotel staff only' });

  const actions = document.createElement('div');   actions.className = 'walkin-actions';
  const checkButton = el('button', 'Check room availability');
  checkButton.type = 'button';
  checkButton.id = 'checkWalkinAvailability';
  const createButton = el('button', 'Confirm walk-in booking');
  createButton.type = 'submit';
  createButton.id = 'createWalkinBooking';
  createButton.disabled = true;
  actions.append(checkButton, createButton);

  const availability = el('div', 'Choose check-in and check-out dates, then check availability.');
  availability.id = 'walkinAvailabilityResults';
  availability.hidden = true;
  availability.setAttribute('role', 'status');
  const message = el('div', '');
  message.id = 'walkinStatus';
  message.hidden = true;
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');

  form.append(grid, actions, availability, message);
  panel.append(heading, intro, form);
  section.append(panel);

  const content = document.querySelector('.admin-dashboard-content') || dashboard;
  content.append(section);

  const links = [...document.querySelectorAll('[data-dashboard-link]')];
  const reservationLink = links.find(link => link.getAttribute('href') === '#reservations-section');
  if (reservationLink) {
    const navLink = reservationLink.cloneNode(true);
    navLink.href = '#walkin-section';
    navLink.textContent = 'Walk-in Booking';
    navLink.classList.remove('is-active');
    navLink.removeAttribute('aria-current');
    navLink.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    const parent = reservationLink.parentElement;
    if (parent && parent.tagName.toLowerCase() === 'li') {
      const listItem = parent.cloneNode(false);
      listItem.append(navLink);
      parent.parentElement?.insertBefore(listItem, parent.nextSibling);
    } else if (parent) {
      parent.insertBefore(navLink, reservationLink.nextSibling);
    }
  }

  const minDate = todayISO();
  checkIn.min = minDate;
  checkOut.min = minDate;
  checkIn.value = minDate;
  const tomorrow = new Date(`${minDate}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  checkOut.value = dayString(tomorrow);
}

initializeWalkInBookingUI();

/* -----------------------------------------------------
   WALK-IN BOOKINGS — FRONT DESK
   Uses reservation_requests and the existing confirmation RPC.
   Does not create room_blocks or hotel_stays directly.
   ----------------------------------------------------- */

const walkinForm = document.getElementById('walkinBookingForm');
const walkinStatus = document.getElementById('walkinStatus');
const walkinAvailabilityResults = document.getElementById('walkinAvailabilityResults');
const walkinCheckIn = document.getElementById('walkinCheckIn');
const walkinCheckOut = document.getElementById('walkinCheckOut');
const walkinRoom = document.getElementById('walkinRoom');
const checkWalkinAvailabilityButton = document.getElementById('checkWalkinAvailability');
const createWalkinBookingButton = document.getElementById('createWalkinBooking');

function showWalkinMessage(message, isError = false) {
  [walkinStatus].filter(Boolean).forEach(target => {
    target.hidden = false;
    target.textContent = message;
    target.classList.toggle('admin-error-state', isError);
  });
}

function showWalkinAvailability(message, isError = false) {
  if (!walkinAvailabilityResults) return;
  walkinAvailabilityResults.hidden = false;
  walkinAvailabilityResults.textContent = message;
  walkinAvailabilityResults.classList.toggle('admin-error-state', isError);
}

function validWalkinDates() {
  const checkIn = walkinCheckIn?.value || '';
  const checkOut = walkinCheckOut?.value || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    showWalkinAvailability('Enter both check-in and check-out dates.', true);
    return null;
  }
  if (checkOut <= checkIn) {
    showWalkinAvailability('Check-out must be later than check-in.', true);
    return null;
  }
  return { checkIn, checkOut };
}

async function fetchWalkinAvailability(checkIn, checkOut) {
  if (!client) throw new Error('Supabase is not configured.');

  // Fetch fresh inventory and block data instead of trusting a stale screen.
  const [roomResult, blockResult] = await Promise.all([
    client.from('room_inventory').select('*').eq('active', true).order('room_code'),
    client.from('room_blocks').select('*').order('check_in', { ascending: false }).limit(5000)
  ]);

  if (roomResult.error) throw new Error('Could not load rooms: ' + roomResult.error.message);
  if (blockResult.error) throw new Error('Could not verify room allocations: ' + blockResult.error.message);
  if ((blockResult.data || []).length >= 5000) {
    throw new Error('Too many room-block records were returned to verify availability safely. Ask the database administrator to review room-block history before registering this booking.');
  }

  const freshRooms = roomResult.data || [];
  const freshBlocks = blockResult.data || [];
  const availableRooms = freshRooms.filter(room => !freshBlocks.some(block =>
    block.room_id === room.id &&
    !block.released_at &&
    checkIn < block.check_out &&
    checkOut > block.check_in
  ));

  return { availableRooms, freshRooms, freshBlocks };
}

function renderWalkinRoomOptions(availableRooms) {
  if (!walkinRoom) return;
  walkinRoom.replaceChildren();
  const placeholder = el('option', availableRooms.length
    ? 'Select an available room…'
    : 'No rooms available for these dates');
  placeholder.value = '';
  placeholder.selected = true;
  placeholder.disabled = true;
  walkinRoom.append(placeholder);

  for (const room of availableRooms) {
    const rate = room.nightly_rate_usd == null
      ? 'Rate not set'
      : formatMoney(room.nightly_rate_usd) + ' per night';
    const option = el('option', `${room.room_code} · ${room.room_type} · ${rate}`);
    option.value = room.id;
    walkinRoom.append(option);
  }
}

async function checkWalkinAvailability() {
  const dates = validWalkinDates();
  if (!dates) return;

  if (walkinRoom) {
    walkinRoom.disabled = true;
    walkinRoom.replaceChildren(el('option', 'Checking availability…'));
  }
  if (checkWalkinAvailabilityButton) checkWalkinAvailabilityButton.disabled = true;
  if (createWalkinBookingButton) createWalkinBookingButton.disabled = true;

  try {
    const { availableRooms } = await fetchWalkinAvailability(dates.checkIn, dates.checkOut);
    renderWalkinRoomOptions(availableRooms);
    if (walkinRoom) walkinRoom.disabled = false;
    if (createWalkinBookingButton) createWalkinBookingButton.disabled = availableRooms.length === 0;

    showWalkinAvailability(availableRooms.length
      ? `${availableRooms.length} room(s) are available for ${dates.checkIn} to ${dates.checkOut}. Select a room to continue.`
      : 'No active rooms are available for the selected dates. Try different dates or register the actual room inventory first.');
  } catch (error) {
    console.error('Walk-in availability error:', error);
    renderWalkinRoomOptions([]);
    if (walkinRoom) walkinRoom.disabled = false;
    showWalkinAvailability(error.message || 'Could not verify availability.', true);
  } finally {
    if (checkWalkinAvailabilityButton) checkWalkinAvailabilityButton.disabled = false;
  }
}

if (checkWalkinAvailabilityButton) {
  checkWalkinAvailabilityButton.addEventListener('click', checkWalkinAvailability);
}

// Changing either date clears the previous selection so a room checked for
// different dates cannot accidentally be booked.
[walkinCheckIn, walkinCheckOut].filter(Boolean).forEach(input => {
  input.addEventListener('change', () => {
    renderWalkinRoomOptions([]);
    if (createWalkinBookingButton) createWalkinBookingButton.disabled = true;
    if (walkinAvailabilityResults) walkinAvailabilityResults.hidden = true;
  });
});

if (walkinForm) {
  walkinForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!client) {
      showWalkinMessage('Configure Supabase first.', true);
      return;
    }

    const dates = validWalkinDates();
    if (!dates) return;

    const fields = new FormData(walkinForm);
    const guestName = String(fields.get('guest_name') || '').trim();
    const guestPhone = String(fields.get('guest_phone') || '').trim();
    const guestEmail = String(fields.get('guest_email') || '').trim();
    const guests = Number(fields.get('guests'));
    const roomId = String(fields.get('room_id') || '');
    const staffNotes = String(fields.get('staff_notes') || '').trim();

    if (!guestName || !guestPhone) {
      showWalkinMessage('Enter the guest’s full name and phone number.', true);
      return;
    }
    if (!Number.isInteger(guests) || guests < 1 || guests > 100) {
      showWalkinMessage('Enter a valid number of guests (1–100).', true);
      return;
    }
    if (!roomId) {
      showWalkinMessage('Check availability and select a room first.', true);
      return;
    }

    if (createWalkinBookingButton) createWalkinBookingButton.disabled = true;
    if (checkWalkinAvailabilityButton) checkWalkinAvailabilityButton.disabled = true;
    showWalkinMessage('Rechecking availability and registering the booking…');

    try {
      // Verify staff session before creating any record.
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError || !userData?.user) throw new Error('Your session has expired. Sign in again.');
      const { data: staff, error: staffError } = await client
        .from('hotel_staff').select('user_id').eq('user_id', userData.user.id).maybeSingle();
      if (staffError || !staff) throw new Error('Your account is not approved for hotel staff access.');

      // Re-fetch room and blocks immediately before insert to avoid stale choices.
      const { availableRooms, freshRooms } = await fetchWalkinAvailability(dates.checkIn, dates.checkOut);
      const room = availableRooms.find(item => item.id === roomId);
      if (!room) throw new Error('That room is no longer available for those dates. Check availability again and choose another room.');
      if (!freshRooms.some(item => item.id === roomId && item.active)) {
        throw new Error('The selected room is no longer active. Choose another room.');
      }

      const notes = [
        'WALK-IN BOOKING — registered at the front desk.',
        staffNotes ? 'Staff notes: ' + staffNotes : ''
      ].filter(Boolean).join('\n');

      const requestPayload = {
        guest_name: guestName,
        guest_phone: guestPhone,
        guest_email: guestEmail || null,
        check_in: dates.checkIn,
        check_out: dates.checkOut,
        guests,
        room_preference: room.room_type,
        status: 'new',
        staff_notes: notes
      };

      const { data: request, error: insertError } = await client
        .from('reservation_requests')
        .insert(requestPayload)
        .select('id')
        .single();

      if (insertError) {
  console.error('Walk-in reservation INSERT failed:', {
    code: insertError.code,
    message: insertError.message,
    details: insertError.details,
    hint: insertError.hint,
    payload: requestPayload
  });

  throw new Error(
    'Could not create the walk-in request: ' +
    insertError.message +
    (insertError.code ? ' [Code: ' + insertError.code + ']' : '')
  );
}
      if (!request?.id) throw new Error('The walk-in request was created, but its ID was not returned. Check Reservations before retrying to avoid a duplicate.');

      const { error: confirmError } = await client.rpc('confirm_hotel_reservation', {
        p_request_id: request.id,
        p_room_id: room.id,
        p_reference: 'Walk-in ' + guestName
      });

      if (confirmError) {
        // Keep the request visible as pending rather than deleting records or
        // creating a room block outside the protected confirmation RPC.
        showWalkinMessage('The walk-in request was saved, but room allocation failed: ' + confirmError.message + '. Check Reservations before retrying; the request may still be pending.', true);
        status('Walk-in request saved but not allocated. Review it in Reservations.');
        await Promise.all([
          render('reservation_requests', 'reservations'),
          loadBookedRooms(),
          loadOverview()
        ]);
        return;
      }

      walkinForm.reset();
      renderWalkinRoomOptions([]);
      if (walkinRoom) walkinRoom.disabled = false;
      if (createWalkinBookingButton) createWalkinBookingButton.disabled = true;
      if (walkinAvailabilityResults) walkinAvailabilityResults.hidden = true;
      showWalkinMessage(`Walk-in booking confirmed. Room ${room.room_code} is allocated to ${guestName} for ${dates.checkIn} to ${dates.checkOut}.`);
      status('Walk-in booking confirmed and room allocated.');

      await Promise.all([        loadOperations(),
        render('reservation_requests', 'reservations'),
        loadBookedRooms()
      ]);
      await loadOverview();

    } catch (error) {
      console.error('Walk-in booking error:', error);
      showWalkinMessage(error.message || 'Unexpected error registering walk-in booking.', true);
      status(error.message || 'Walk-in booking failed.');
    } finally {
      if (checkWalkinAvailabilityButton) checkWalkinAvailabilityButton.disabled = false;
      if (createWalkinBookingButton && walkinRoom?.value) createWalkinBookingButton.disabled = false;
    }
  });
}

initializeDashboardNavigation();

/* -----------------------------------------------------
   INITIALIZE
   ----------------------------------------------------- */

if (viewDate && !viewDate.value) {
  viewDate.value = todayISO();
}

load();
