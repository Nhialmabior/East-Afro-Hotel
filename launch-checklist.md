# East Afro Hotel — Pre-Launch Checklist

## Content and brand
- [ ] Hotel management approves the logo and all published content.
- [ ] Confirm official address, telephone, emails, opening hours, room types, room rates, taxes, facilities, dining details, policies and social URLs.
- [ ] Replace sample/stock images with approved hotel photography or clearly keep them illustrative.
- [ ] Add a privacy notice and contact for privacy-related requests.

## Local testing
- [ ] Open the project in VS Code and run it using Live Server.
- [ ] Test desktop and mobile navigation, all section links, gallery filters/dialog, and back-to-top.
- [ ] Test date validation and stay-length summary with valid and invalid dates.
- [ ] Check keyboard-only navigation, visible focus, Escape behaviour and reduced-motion preference.
- [ ] Check browser console for errors and broken image links.

## Database and staff operations (if using Supabase)
- [ ] Run migrations in the documented order on a staging project.
- [ ] Review RLS policies, RPC permissions and staff access before entering guest data.
- [ ] Configure only the public project URL and anon/publishable key in `config.js`.
- [ ] Create and explicitly approve staff accounts; verify unauthorized users cannot access admin data.
- [ ] Add verified rooms and test overlapping allocations, cancellations, availability lookup and CSV exports.
- [ ] Confirm backups, least-privilege access and retention/deletion practices.

## Production protection still required
- [ ] Add server-side input validation and persistent rate limiting.
- [ ] Add CAPTCHA/Turnstile verification on the server/Edge Function.
- [ ] Add automatic staff notification emails and guest acknowledgement emails with a transactional email provider.
- [ ] Add logging/monitoring and a process for handling failed notifications.
- [ ] Host on HTTPS and test the deployed site and forms end to end.
- [ ] Keep all service-role keys, email API keys and other secrets on the server only.
- [ ] Train staff that an enquiry is not a confirmed reservation until verified and communicated to the guest.
