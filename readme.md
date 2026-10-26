# East Afro Hotel — Website (Version 6)

A responsive, static hotel website for East Afro Hotel, Juba, South Sudan.

## Files
- `index.html` — complete single-page site with all sections and enquiry forms
- `styles.css` — responsive styling
- `script.js` — navigation, gallery filters, date validation and email enquiries
- `config.js` — configure verified hotel email addresses
- `assets/logo.jpg` — supplied East Afro Hotel logo

## How to run
Open `index.html` in a browser, or use VS Code's Live Server extension. No build step required. Deploy to GitHub Pages, Netlify or any static host.

## Before publishing
1. Update `config.js` with confirmed hotel email addresses. Until configured, the forms display a configuration notice. When configured, the forms open the guest's email application; they **do not** submit bookings to a server or check availability.
2. Replace sample room categories, facility descriptions, imagery and dining descriptions with confirmed information from management.
3. Add real room prices, phone, physical address, social links, menu, policies, privacy notice and hotel-owned photos.
4. Connect a backend with secure storage, availability checks, notification delivery and staff management before offering real online bookings.
5. Obtain consent to publish the supplied hotel logo.

## Photography
Images are loaded remotely from `images.unsplash.com` and require an internet connection. Photos are illustrative and do **not** depict East Afro Hotel. See https://unsplash.com/license for licensing and https://unsplash.com/terms for restrictions concerning people, logos, property and trademarks. Do not present stock imagery as photographs of the hotel.

## Technical notes
No third-party JavaScript frameworks or paid services are required. Form data is not stored, and no payments are collected. Replace email-based enquiries with a server-backed system for production.

## Optional Supabase backend + staff dashboard (new)
1. Create a Supabase project and open its **SQL Editor**. Run `schema.sql`.
2. In `config.js`, enter the **Project URL** and **publishable / anon key** from Supabase. Never enter a secret or service-role key.
3. In Supabase Authentication, create an approved staff account (do not expose public staff sign-up). Copy its Auth user UUID. In SQL Editor run `insert into public.hotel_staff(user_id) values ('YOUR-STAFF-UUID');`.
4. Open `admin.html`, sign in, review reservation requests and contact messages, and update their statuses.
5. Public forms save enquiries when Supabase is configured. If not configured, they use the existing email-draft fallback.

**Security/production caveats:** Public submissions are NOT confirmed bookings. The database does not check inventory, take payments, or send notification emails. The staff dashboard only shows the 100 newest records in each category. Protect public submissions with CAPTCHA and rate-limiting through a server/Edge Function before advertising broadly; RLS does not prevent spam. Add a privacy policy and data retention procedures, verify email delivery/alerts, and use HTTPS hosting. Do not treat a status change as an inventory-backed confirmation.

## Version 3 — room operations

1. Complete the original Supabase setup (`schema.sql`), including approved staff authentication.
2. Run `upgrade-v3.sql` in Supabase SQL Editor.
3. Open `admin.html` and sign in with an approved staff account.
4. Add **real** room codes and types, optionally with verified USD rates.
5. Add room blocks for confirmed bookings, maintenance, or temporary holds. The database rejects overlapping blocks for a room.
6. Choose a date to see the 14-day room calendar and booked occupancy percentage.

**Important:** The room calendar is private, not a live public booking engine. Reservation requests are not automatically assigned rooms. Occupancy reflects only staff-entered confirmed booking blocks, not pending requests. Payment processing, guest notifications, housekeeping, detailed financial reporting, and automated room assignment are **not implemented**. Rates and room categories shown on the public site are illustrative until hotel management confirms them. Public forms need CAPTCHA and rate limiting before launch. Keep Supabase secret/service-role keys off the frontend.

## Version 4 — inventory-backed reservation workflow and exports

1. Set up the base database and run `upgrade-v3.sql` first. Then run `upgrade-v4.sql` in the Supabase SQL Editor.
2. Sign in to `admin.html` using an approved staff account. Enter the real rooms in Room Inventory.
3. For a new reservation request, verify dates, room type, price and guest details with hotel staff. Choose an active room and click **Confirm & allocate room**. The database allocates that room and updates the request status together in one transaction; overlapping bookings are rejected.
4. To reverse an allocation, use **Cancel allocation** in the request. Linked room blocks cannot be removed through the generic block deletion button. Inform the guest yourself.
5. Use the CSV export buttons to download the latest 1,000 reservation requests or messages. These contain personal data; protect and delete exports according to your hotel's privacy policy.

**Limitations:** This is still a staff-mediated booking workflow, not live guest self-booking. No automatic emails, payments, CAPTCHA, rate-limiting, or live guest-facing availability. Room rates are not automatically quoted or charged. Run the migrations in order and test against a separate Supabase project before using with real guests. Older manually marked `confirmed` requests from Version 2/3 may not have linked room blocks; reconcile those manually.


## Version 5: indicative guest availability
Run `upgrade-v5.sql` after the previous migrations. The guest booking form now offers
`Check room availability`, which displays aggregate room-type counts for the selected dates.
Room types must match the names used in the public form for filtered results. No inventory
is prepopulated; add verified rooms and rates in the staff dashboard.
This is **not** a reservation or guaranteed live price. Booking enquiries still need staff
confirmation. Availability reads from active room inventory and dated room blocks.
Basic hidden honeypot fields deter only simple bots. **Production launch requires**
server-side rate limits, CAPTCHA validation, and monitoring on the public forms.
No payment processing or automatic email notifications are included.


## Version 6 improvements
- Preserves the Version 5 public site, Supabase reservation/contact submission, indicative room availability check, and staff dashboard/inventory workflow.
- Adds accessible skip-to-content and keyboard focus styles, keyboard-operable gallery previews, image lightbox dialog, back-to-top control, and a live selected-stay summary.
- Improves page metadata for browser theme and social sharing, and honors reduced-motion preferences.
- No database migration is required for these frontend enhancements. Existing V5 Supabase configuration and migrations remain in place.

## Upgrade from Version 5
1. Back up your current site folder and Supabase project.
2. Replace the website files with this Version 6 folder, keeping your verified `config.js` values.
3. If your live site uses a customized `config.js`, do not overwrite it with the sample configuration. Never add a Supabase service-role key to frontend files.
4. Test the public site and `admin.html` in a staging deployment before publishing. Test date validation, room availability (when Supabase is configured), enquiry submission, staff sign-in, room inventory, allocations, and CSV exports.
5. Verify hotel contact details, room inventory/rates, amenity claims, privacy notice, and photography rights before launch.

Version 6 does not introduce payment processing, guaranteed real-time guest booking, automated guest email delivery, CAPTCHA, or server-side rate limiting. Reservation requests remain requests until staff verify and confirm them.
