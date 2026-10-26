# East Afro Hotel — Cumulative Version History

The current project is the cumulative Version 6 source. Earlier milestones are incorporated in the latest code and database scripts; you do not need to combine older project folders manually.

- **Version 1 — Initial website:** hotel landing page and core informational sections, responsive styling, hotel branding and online image sources.
- **Version 2 — Interactive enquiries and admin foundation:** public reservation/contact enquiry forms and the initial Supabase-backed staff workflow/schema.
- **Version 3 — Room operations:** staff room inventory and room-block/occupancy calendar workflow.
- **Version 4 — Allocation and exports:** staff-mediated room allocation/cancellation workflow, overlap protection and CSV exports.
- **Version 5 — Indicative availability:** guest-facing aggregate room-type availability lookup for selected dates; it is not a booking guarantee.
- **Version 6 — Accessibility and usability:** preserves prior public/admin functionality and adds skip-to-content, keyboard focus improvements, keyboard-operable gallery preview/dialog, selected stay-length summary, back-to-top, improved page metadata, Escape handling for mobile navigation, and reduced-motion support.

## Migration order

For a new Supabase project, run `schema.sql` first, then `upgrade-v3.sql`, `upgrade-v4.sql`, and `upgrade-v5.sql`. Version 6 does not add a database migration. Test all SQL against a separate staging project before production use. If upgrading an existing database, inspect its migration history and run only migrations that have not already been applied.

## Not included yet

Version 7 production hardening remains a follow-up milestone: secure server/Edge Function submission path, server-side validation, durable rate limiting, CAPTCHA/Turnstile verification, automated email notifications, operational monitoring, and full end-to-end tests. Do not assume these features are active in this package.
