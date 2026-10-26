# East Afro Hotel — Version 6 changelog

## Preserved from Version 5
- Public hotel landing page and responsive sections: rooms, dining, facilities, events, gallery, contact and reservation enquiry.
- Supabase-backed reservation and contact submissions with email-draft fallback.
- Indicative room availability RPC and guest-facing caveat that availability is not a confirmation.
- Existing `admin.html` staff dashboard, room inventory/rates, booking allocation workflow, occupancy calendar and CSV exports.
- Existing SQL schema and migrations (`schema.sql`, `upgrade-v3.sql`, `upgrade-v4.sql`, `upgrade-v5.sql`).

## Added in Version 6
- Skip-to-content link and visible keyboard focus styling.
- Keyboard-accessible gallery image preview dialog.
- Selected stay length summary based on chosen dates.
- Back-to-top button.
- Escape key closes the mobile navigation and returns focus to its toggle.
- Theme-color and Open Graph metadata.
- Reduced-motion preference support.

## Database changes
None. These are frontend enhancements. Continue to apply existing migrations in the documented order if setting up a fresh Supabase project.
