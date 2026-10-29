
/* =========================================================
   EAST AFRO HOTEL
   Main website JavaScript
   ========================================================= */


/* =========================================================
   1. SHARED HELPERS
   ========================================================= */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);


/* =========================================================
   2. FOOTER YEAR
   ========================================================= */

const yearElement = $('#year');

if (yearElement) {
  yearElement.textContent = new Date().getFullYear();
}


/* =========================================================
   3. NOTIFICATION DIALOG
   ========================================================= */

const dialog = $('#dialog');

function notice(title, message) {
  const titleElement = $('#dialogTitle');
  const messageElement = $('#dialogMessage');

  if (titleElement) {
    titleElement.textContent = title;
  }

  if (messageElement) {
    messageElement.textContent = message;
  }

  if (dialog && typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    window.alert(`${title}\n${message}`);
  }
}

const closeDialog = $('#closeDialog');
const dialogOk = $('#dialogOk');

if (closeDialog) {
  closeDialog.addEventListener('click', () => {
    if (dialog) dialog.close();
  });
}

if (dialogOk) {
  dialogOk.addEventListener('click', () => {
    if (dialog) dialog.close();
  });
}

if (dialog) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });
}


/* =========================================================
   4. MOBILE NAVIGATION MENU
   ========================================================= */

const menu = $('.menu-toggle');
const nav = $('#nav');

if (menu && nav) {
  menu.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');

    menu.setAttribute('aria-expanded', String(isOpen));
    menu.setAttribute(
      'aria-label',
      isOpen ? 'Close navigation menu' : 'Open navigation menu'
    );
    menu.textContent = isOpen ? '✕' : '☰';
  });

  $$('#nav a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      menu.setAttribute('aria-expanded', 'false');
      menu.setAttribute('aria-label', 'Open navigation menu');
      menu.textContent = '☰';
    });
  });
}


/* =========================================================
   5. KEYBOARD ACCESSIBILITY
   ========================================================= */

document.addEventListener('keydown', (event) => {
  if (
    event.key === 'Escape' &&
    nav &&
    menu &&
    nav.classList.contains('open')
  ) {
    nav.classList.remove('open');
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', 'Open navigation menu');
    menu.textContent = '☰';
    menu.focus();
  }
});


/* =========================================================
   6. DATE HELPERS AND BOOKING DATE VALIDATION
   ========================================================= */

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

const checkinInput = $('#checkin');
const checkoutInput = $('#checkout');

function updateCheckoutMinimum() {
  if (!checkinInput || !checkoutInput) return;

  const selectedDate = checkinInput.value;

  if (!selectedDate) {
    checkoutInput.min = toISODate(
      new Date(getToday().getTime() + 86400000)
    );
    return;
  }

  const checkinDate = new Date(`${selectedDate}T00:00:00`);

  if (Number.isNaN(checkinDate.getTime())) return;

  checkinDate.setDate(checkinDate.getDate() + 1);

  const minimumCheckout = toISODate(checkinDate);

  checkoutInput.min = minimumCheckout;

  if (
    !checkoutInput.value ||
    checkoutInput.value < minimumCheckout
  ) {
    checkoutInput.value = minimumCheckout;
  }
}

if (checkinInput && checkoutInput) {
  const today = getToday();

  checkinInput.min = toISODate(today);

  updateCheckoutMinimum();

  checkinInput.addEventListener('change', () => {
    updateCheckoutMinimum();
    updateStaySummary();
  });

  checkoutInput.addEventListener('change', updateStaySummary);
}


/* =========================================================
   7. HOTEL CONFIGURATION AND SUPABASE
   ========================================================= */

const config = window.HOTEL_CONFIG || {};

let db = null;

if (
  config.supabaseUrl &&
  config.supabaseAnonKey &&
  window.supabase &&
  typeof window.supabase.createClient === 'function'
) {
  try {
    db = window.supabase.createClient(
      config.supabaseUrl,
      config.supabaseAnonKey
    );
  } catch (error) {
    console.error('Supabase initialization failed:', error);
  }
}

async function saveRequest(table, payload) {
  if (!db) return false;

  const { error } = await db
    .from(table)
    .insert(payload);

  if (error) {
    throw error;
  }

  return true;
}


/* =========================================================
   8. EMAIL ENQUIRY FALLBACK
   ========================================================= */

function prepareEmail(to, subject, body) {
  if (!to) {
    notice(
      'Configuration needed',
      'The hotel email address has not been configured yet. Please add a verified address in config.js before enabling enquiries.'
    );
    return;
  }

  const mailtoUrl =
    `mailto:${encodeURIComponent(to)}` +
    `?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`;

  window.location.href = mailtoUrl;
}


/* =========================================================
   9. ROOM BOOKING FORM
   ========================================================= */

const bookingForm = $('#bookingForm');

if (bookingForm) {
  bookingForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    // Honeypot field used to help filter automated submissions.
    if (formData.get('website')) return;

    const checkin = String(formData.get('checkin') || '');
    const checkout = String(formData.get('checkout') || '');

    if (!checkin || !checkout || checkout <= checkin) {
      notice(
        'Check your dates',
        'Check-out must be later than check-in.'
      );
      return;
    }

    const submitButton = form.querySelector('[type="submit"]');

    if (submitButton) {
      submitButton.disabled = true;
    }

    try {
      const payload = {
        guest_name: String(formData.get('name') || '').trim(),
        guest_email: String(formData.get('email') || '').trim(),
        guest_phone: String(formData.get('phone') || '').trim(),
        check_in: checkin,
        check_out: checkout,
        guests: Number.parseInt(formData.get('guests'), 10) || 2,
        room_preference: String(formData.get('room') || '')
      };

      const saved = await saveRequest(
        'reservation_requests',
        payload
      );

      if (saved) {
        notice(
          'Request received',
          'Your reservation request was received. This is NOT a confirmed booking. Hotel staff must confirm availability and rates.'
        );

        form.reset();
        updateCheckoutMinimum();
        updateStaySummary();
      } else {
        const details =
          `Reservation enquiry - East Afro Hotel\n\n` +
          `Name: ${payload.guest_name}\n` +
          `Email: ${payload.guest_email}\n` +
          `Phone: ${payload.guest_phone}\n` +
          `Check-in: ${payload.check_in}\n` +
          `Check-out: ${payload.check_out}\n` +
          `Guests: ${payload.guests}\n` +
          `Room preference: ${payload.room_preference}\n\n` +
          'Please confirm availability and rates.';

        prepareEmail(
          config.reservationsEmail,
          'Room availability enquiry',
          details
        );
      }
    } catch (error) {
      console.error('Booking submission failed:', error);

      notice(
        'Could not submit',
        'Your request could not be sent. Please contact the hotel directly.'
      );
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}


/* =========================================================
   10. ROOM BOOKING SHORTCUT BUTTONS
   ========================================================= */

$$('.room-book').forEach((button) => {
  button.addEventListener('click', () => {
    const roomSelect = $('#roomSelect');
    const bookingSection = $('#booking');

    if (roomSelect && button.dataset.room) {
      roomSelect.value = button.dataset.room;
    }

    if (bookingSection) {
      bookingSection.scrollIntoView({
        behavior: 'smooth'
      });
    }

    if (checkinInput) {
      checkinInput.focus({
        preventScroll: true
      });
    }
  });
});


/* =========================================================
   11. CONTACT FORM
   ========================================================= */

const contactForm = $('#contactForm');

if (contactForm) {
  contactForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    // Honeypot field used to help filter automated submissions.
    if (formData.get('website')) return;

    const submitButton = form.querySelector('[type="submit"]');

    if (submitButton) {
      submitButton.disabled = true;
    }

    try {
      const payload = {
        sender_name: String(formData.get('name') || '').trim(),
        sender_email: String(formData.get('email') || '').trim(),
        sender_phone: String(formData.get('phone') || '').trim(),
        topic: String(formData.get('topic') || ''),
        message: String(formData.get('message') || '').trim()
      };

      const saved = await saveRequest(
        'contact_messages',
        payload
      );

      if (saved) {
        notice(
          'Message received',
          'Thank you. Your message was received by the hotel enquiry system.'
        );

        form.reset();
      } else {
        const emailBody =
          `Name: ${payload.sender_name}\n` +
          `Email: ${payload.sender_email}\n` +
          `Phone: ${payload.sender_phone}\n` +
          `Topic: ${payload.topic}\n\n` +
          payload.message;

        prepareEmail(
          config.contactEmail,
          `East Afro Hotel: ${payload.topic}`,
          emailBody
        );
      }
    } catch (error) {
      console.error('Contact form submission failed:', error);

      notice(
        'Could not submit',
        'Your message could not be sent. Please contact the hotel directly.'
      );
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}


/* =========================================================
   12. GALLERY CATEGORY FILTERS
   ========================================================= */

$$('.filter').forEach((button) => {
  button.addEventListener('click', () => {
    $$('.filter').forEach((filterButton) => {
      filterButton.classList.remove('active');
    });

    button.classList.add('active');

    const selectedCategory = button.dataset.filter;

    $$('.gallery-grid img').forEach((image) => {
      image.hidden =
        selectedCategory !== 'all' &&
        image.dataset.category !== selectedCategory;
    });
  });
});


/* =========================================================
   13. INDICATIVE ROOM AVAILABILITY
   ========================================================= */

const availabilityButton = $('#checkAvailability');
const availabilityResult = $('#availabilityResult');

if (availabilityButton) {
  availabilityButton.addEventListener('click', async () => {
    if (!availabilityResult) {
      console.error(
        'Missing HTML element: #availabilityResult'
      );
      return;
    }

    const start = checkinInput?.value || '';
    const end = checkoutInput?.value || '';
    const room = $('#roomSelect')?.value || 'Any room';

    if (!start || !end || end <= start) {
      availabilityResult.textContent =
        'Choose valid check-in and check-out dates first.';
      return;
    }

    if (!db) {
      availabilityResult.textContent =
        'Live availability is not configured yet. Please send an enquiry.';
      return;
    }

    availabilityButton.disabled = true;

    availabilityResult.textContent =
      'Checking indicative availability…';

    try {
      const { data, error } = await db.rpc(
        'public_room_availability',
        {
          p_check_in: start,
          p_check_out: end,
          p_room_type: room === 'Any room' ? null : room
        }
      );

      if (error) {
        throw error;
      }

      const rows = Array.isArray(data) ? data : [];

      if (!rows.length) {
        availabilityResult.textContent =
          'No matching room inventory is currently published. Please send an enquiry.';
        return;
      }

      availabilityResult.replaceChildren();

      rows.forEach((row) => {
        const line = document.createElement('p');

        const rateText =
          row.nightly_rate_from_usd == null
            ? ''
            : ` · indicative rates from $${Number(
                row.nightly_rate_from_usd
              ).toFixed(2)}/night`;

        line.textContent =
          `${row.room_type}: ${row.available_rooms} of ` +
          `${row.total_rooms} rooms potentially available` +
          rateText;

        availabilityResult.appendChild(line);
      });

      const note = document.createElement('small');

      note.textContent =
        'Indicative only. Availability can change before hotel staff confirm your booking.';

      availabilityResult.appendChild(note);
    } catch (error) {
      console.error(
        'Availability check failed:',
        error
      );

      availabilityResult.textContent =
        'Availability could not be checked. You can still submit an enquiry.';
    } finally {
      availabilityButton.disabled = false;
    }
  });
}


/* =========================================================
   14. STAY LENGTH SUMMARY
   ========================================================= */

const staySummary = $('#staySummary');

function updateStaySummary() {
  if (!staySummary) return;

  const start = checkinInput?.value || '';
  const end = checkoutInput?.value || '';

  if (!start || !end || end <= start) {
    staySummary.textContent =
      'Choose valid check-in and check-out dates to see your stay length.';
    return;
  }

  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);

  const nights = Math.round(
    (endDate.getTime() - startDate.getTime()) / 86400000
  );

  if (!Number.isFinite(nights) || nights < 1) {
    staySummary.textContent =
      'Choose valid check-in and check-out dates to see your stay length.';
    return;
  }

  staySummary.textContent =
    `Your selected stay: ${nights} night${nights === 1 ? '' : 's'} · ` +
    `${start} to ${end}. This is not a confirmed reservation.`;
}

updateStaySummary();


/* =========================================================
   15. GALLERY IMAGE PREVIEW
   ========================================================= */

const galleryDialog = $('#galleryDialog');
const galleryPreview = $('#galleryPreview');
const galleryCaption = $('#galleryCaption');
const closeGallery = $('#closeGallery');

function closeGalleryDialog() {
  if (galleryDialog) {
    galleryDialog.close();
  }
}

$$('.gallery-grid img').forEach((image) => {
  image.tabIndex = 0;
  image.setAttribute('role', 'button');
  image.setAttribute(
    'aria-label',
    `View larger image: ${image.alt}`
  );

  function openPreview() {
    if (
      galleryDialog &&
      galleryPreview &&
      typeof galleryDialog.showModal === 'function'
    ) {
      galleryPreview.src = image.currentSrc || image.src;
      galleryPreview.alt = image.alt;

      if (galleryCaption) {
        galleryCaption.textContent = image.alt;
      }

      galleryDialog.showModal();
    } else {
      window.open(
        image.currentSrc || image.src,
        '_blank',
        'noopener'
      );
    }
  }

  image.addEventListener('click', openPreview);

  image.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPreview();
    }
  });
});

if (closeGallery) {
  closeGallery.addEventListener('click', closeGalleryDialog);
}

if (galleryDialog) {
  galleryDialog.addEventListener('click', (event) => {
    if (event.target === galleryDialog) {
      closeGalleryDialog();
    }
  });

  galleryDialog.addEventListener('close', () => {
    if (galleryPreview) {
      galleryPreview.removeAttribute('src');
    }
  });
}


/* =========================================================
   16. BACK-TO-TOP BUTTON
   ========================================================= */

const backToTop = $('#backToTop');

if (backToTop) {
  const updateBackToTop = () => {
    backToTop.classList.toggle(
      'visible',
      window.scrollY > 500
    );
  };

  window.addEventListener(
    'scroll',
    updateBackToTop,
    { passive: true }
  );

  updateBackToTop();

  backToTop.addEventListener('click', () => {
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    window.scrollTo({
      top: 0,
      behavior: reduceMotion ? 'auto' : 'smooth'
    });
  });
}
