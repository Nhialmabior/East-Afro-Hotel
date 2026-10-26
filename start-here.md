# East Afro Hotel — Final Consolidated Website Project

This package consolidates the cumulative website work through **Version 6**. Use this as the current source-of-truth project rather than merging files from earlier ZIPs. Version 6 includes the previous public site and room-management features plus accessibility and usability improvements.

## Quick start in Visual Studio Code

1. Extract the ZIP file to a normal folder (for example, `Documents/East-Afro-Hotel-Final-Project`). Do not edit the ZIP while it is compressed.
2. Open VS Code.
3. Select **File → Open Folder…** and choose the extracted `East-Afro-Hotel-Final-Project` folder (the folder containing `index.html`, `styles.css`, and `script.js`).
4. In the VS Code Extensions panel, install **Live Server** (publisher: Ritwick Dey), if it is not already installed.
5. Open `index.html`, right-click in the editor, and choose **Open with Live Server**. Your browser should open a local address, commonly `http://127.0.0.1:5500/`.
6. To view the staff dashboard UI, open `admin.html` in the browser. It requires a configured Supabase project and an approved staff account for sign-in and data access.

You can also open `index.html` directly in a browser for a basic visual check, but Live Server is recommended while editing.

## Before using the site publicly

- Open `config.js` and enter only verified contact email addresses and, if using the database, your Supabase project URL and public/anon key.
- Never place a Supabase `service_role` key, database password, email API key, or other secret in `config.js`, HTML, or JavaScript delivered to visitors.
- Replace illustrative room descriptions, prices, facilities, menus, contact details, social links, and stock photographs with hotel-approved information. The remote Unsplash images are examples, not photos of East Afro Hotel.
- Test the public enquiry form and dashboard using test data before real guest data.
- Do not describe an enquiry as a confirmed reservation. The current public availability check is indicative and the staff must verify and confirm requests.
- Set up HTTPS hosting, a privacy notice, access controls, data-retention practices, backups, spam protection, and email notifications before a production launch.

## Supabase setup (optional database/dashboard)

1. Create a Supabase project and keep its credentials private.
2. Open the project's SQL Editor and run `schema.sql` first.
3. Run the migrations in order: `upgrade-v3.sql`, then `upgrade-v4.sql`, then `upgrade-v5.sql`.
4. In `config.js`, set `supabaseUrl` to the project's URL and `supabaseAnonKey` to the project's publishable/anon key. These are public client values; Row Level Security policies must protect the data.
5. In Supabase Authentication, create a staff account yourself; do not enable unrestricted public staff registration. Copy the staff user's Auth UUID and, in SQL Editor, run:

   ```sql
   insert into public.hotel_staff (user_id)
   values ('REPLACE-WITH-STAFF-AUTH-UUID');
   ```

6. Open `admin.html`, sign in, add verified room inventory, and test allocation and cancellation with test requests.
7. Review every RLS policy and RPC function against your current Supabase configuration before using live guest data. Use a separate staging project first.

## What's included

- `index.html`, `styles.css`, `script.js`: public hotel website and interactive sections/forms.
- `admin.html`, `admin.js`: staff dashboard, inventory/room allocation workflow, occupancy calendar and CSV exports.
- `config.js`: safe-to-edit client configuration template.
- `schema.sql`, `upgrade-v3.sql`, `upgrade-v4.sql`, `upgrade-v5.sql`: database schema and ordered migrations.
- `assets/logo.jpg`: hotel logo asset supplied for this project.
- `README.md`, `VERSION-6-CHANGELOG.md`, `VERSION-HISTORY.md`, `LAUNCH-CHECKLIST.md`: documentation and launch guidance.

## Current limitations

This is the consolidated **Version 6** project, not a fully deployed production service. It does not include payment processing, automatic email delivery, server-side CAPTCHA verification, robust server-side rate limiting, or guaranteed instant guest self-booking. No live Supabase instance has been connected or tested as part of packaging. Complete the setup and checklist before publishing.
