# East Afro Hotel — Website (Version 6)

A responsive website for **East Afro Hotel, Juba, South Sudan**, featuring hotel information, reservation enquiries, indicative room availability, and a private staff dashboard powered by Supabase.

The project is maintained on GitHub and deployed through Netlify. Version 6 builds on the existing Version 5 implementation, preserving the website design, database integration, reservation workflow, and staff dashboard.

## Live Project

- **Live website:** Use your existing Netlify site URL.
- **GitHub repository:** Use your existing GitHub repository URL.
- **Hosting:** Netlify
- **Source control:** GitHub
- **Database and authentication:** Supabase

> Replace the descriptions above with your actual website and repository URLs if they are not already documented elsewhere in the project.

## 1. Project Features

### Public website

- Responsive layout for desktop, tablet, and mobile.
- Home, About, Rooms, Dining, Facilities, Events, Gallery, Contact, and booking sections.
- Reservation enquiry form with guest information and stay dates.
- Indicative room availability checks for selected dates and room types.
- Contact enquiry form.
- Responsive navigation and gallery filtering.
- Accessible keyboard navigation and visible focus indicators.
- Keyboard-operable gallery previews and image lightbox.
- Back-to-top control and selected-stay summary.
- Browser theme and social-sharing metadata.
- Reduced-motion preference support.

### Staff dashboard

- Supabase authentication for approved hotel staff.
- Reservation request and contact message management.
- Room inventory management.
- Room blocks for confirmed reservations, maintenance, and temporary holds.
- Inventory-backed room allocation.
- Supported cancellation of room allocations.
- Fourteen-day room calendar and occupancy information.
- CSV exports for reservation requests and contact messages.

## 2. Project Structure

| File or folder | Purpose |
|---|---|
| `index.html` | Public website |
| `styles.css` | Responsive styling |
| `script.js` | Public navigation, forms, availability checks, and interactive features |
| `config.js` | Hotel contact and Supabase configuration |
| `admin.html` | Staff dashboard page |
| `admin.js` | Staff authentication and hotel operations |
| `schema.sql` | Initial database schema |
| `upgrade-v3.sql` | Room operations and calendar functionality |
| `upgrade-v4.sql` | Inventory-backed reservation workflow |
| `upgrade-v5.sql` | Indicative guest availability |
| `assets/` | Logo, favicon, and other local assets |

Some filenames may differ in a customized copy of the project. Preserve all files required by the current HTML and JavaScript references.

## 3. Technology Stack

- HTML5
- CSS3
- Vanilla JavaScript
- Supabase Authentication
- Supabase PostgreSQL
- Supabase Row Level Security (RLS)
- Git and GitHub
- Netlify hosting

No frontend build step or third-party JavaScript framework is required for the standard static website.

## 4. Local Development

1. Clone or download the existing GitHub repository.
2. Open the project folder in Visual Studio Code.
3. Install the Live Server extension if needed.
4. Open `index.html` with Live Server.
5. Open `admin.html` through the same local server to test the staff dashboard.

Directly opening an HTML file may cause restrictions affecting certain browser features or Supabase requests. A local development server is recommended.

## 5. Deployment with GitHub and Netlify

The project is already hosted on GitHub and Netlify. Continue using the existing repository and Netlify site.

### Updating the live website

1. Back up the current project files.
2. Update the necessary files in the existing GitHub repository.
3. Preserve the working `config.js` values and all required admin and SQL files.
4. Commit and push the changes to the branch connected to Netlify.
5. Open the existing Netlify site and check the Deploys section.
6. Confirm that the latest deployment completes successfully.
7. Open the live website and test its functionality.

If Netlify is configured for continuous deployment from GitHub, pushing changes to the connected branch should trigger a new deployment automatically.

If the site is not linked to GitHub, deploy through the existing Netlify workflow without creating an unnecessary second site.

### Important deployment notes

- Do not overwrite customized configuration with sample values.
- Do not publish Supabase service-role or secret keys in frontend files.
- Confirm that the Netlify publish directory points to the folder containing `index.html`.
- No build command is needed for the standard static frontend unless the existing deployment configuration specifies otherwise.
- Check the Netlify deploy log if a deployment fails.

## 6. Supabase Configuration

The public website uses the existing Supabase configuration and database migrations.

### Configuration

The `config.js` file should contain the correct project URL, publishable key or legacy anon key, and verified hotel contact email addresses, using the property names expected by the application.

Never expose a Supabase service-role key or secret key in client-side code.

### Database migrations

The database migration sequence is:

1. `schema.sql`
2. `upgrade-v3.sql`
3. `upgrade-v4.sql`
4. `upgrade-v5.sql`

These migrations provide the database functionality for enquiries, room operations, inventory-backed allocation, and indicative availability.

**Version 6 frontend improvements do not require an additional database migration.** Do not rerun existing migrations unnecessarily against a working production database.

### Staff access

Staff accounts must be created through an approved administrative process and authorized in `public.hotel_staff`.

Public visitors must not be allowed to grant themselves staff permissions. Supabase RLS and database functions must enforce the intended access restrictions.

## 7. Reservation Workflow

### Guest side

1. Select check-in and check-out dates.
2. Select the requested room category and guest count.
3. Check indicative availability.
4. Submit a reservation enquiry.

The availability check displays indicative room-type counts based on active inventory and room blocks. It does not create a booking or guarantee a room.

### Staff side

1. Sign in to the dashboard.
2. Review the reservation request.
3. Verify dates, room category, applicable rate, and guest details.
4. Select an available room.
5. Use **Confirm & allocate room** to complete the supported allocation workflow.
6. Communicate the confirmed booking to the guest through the hotel's approved process.

The database is designed to reject overlapping allocations for the same room.

Use the supported **Cancel allocation** action to reverse an allocation. Generic room-block deletion should not be used to remove blocks linked to allocations.

## 8. Version 6 Improvements

Version 6 retains the Version 5 website and backend integration while adding:

- Accessible skip-to-content navigation.
- Improved keyboard focus styling.
- Keyboard-operable gallery previews.
- An image lightbox dialog.
- Back-to-top control.
- Live selected-stay summary.
- Improved browser and social-sharing metadata.
- Reduced-motion support.

These are frontend enhancements and do not require new database tables.

## 9. Pre-Deployment and Live Testing

Before publishing an update, verify the following.

### Public website

- [ ] The Netlify deployment succeeds.
- [ ] The home page and all navigation links work.
- [ ] Layout works on desktop and mobile.
- [ ] Gallery filters and lightbox work.
- [ ] Date validation and selected-stay summary work.
- [ ] Indicative availability works with Supabase configured.
- [ ] Reservation submissions succeed or display a clear error.
- [ ] Contact submissions succeed or display a clear error.
- [ ] Email fallback behaves as expected when Supabase is unavailable.
- [ ] The correct logo, favicon, and images load.
- [ ] HTTPS is enabled on the live site.

### Staff dashboard

- [ ] Approved staff can sign in.
- [ ] Unauthorized users cannot access protected records or operations.
- [ ] Reservation requests and contact messages load.
- [ ] Status updates work correctly.
- [ ] Room inventory can be managed.
- [ ] Overlapping room allocations are rejected.
- [ ] Allocations and cancellations update the correct records.
- [ ] The room calendar displays the expected blocks.
- [ ] CSV exports work and contain the expected records.

Use test records and a staging environment before testing with real guest data.

## 10. Security and Production Requirements

Before promoting the website for public reservation enquiries:

- Verify Supabase RLS policies and database permissions.
- Protect staff account creation and dashboard access.
- Add server-side rate limiting and CAPTCHA verification through a trusted backend or Edge Function.
- Verify staff notification and guest email procedures.
- Publish an appropriate privacy notice.
- Establish data retention and deletion procedures.
- Protect CSV exports containing personal information.
- Use HTTPS.
- Test database authorization, validation, and concurrent room allocation.
- Verify the accuracy of hotel information and the rights to use all images and branding.

RLS does not prevent spam by itself, and hidden honeypot fields deter only basic automated submissions.

## 11. Current Limitations

The existing implementation does not automatically provide:

- Guaranteed real-time guest self-booking.
- Automatic room allocation on guest form submission.
- Payment processing or online deposits.
- Automatic guest confirmation emails.
- Built-in server-side CAPTCHA and rate limiting.
- Complete housekeeping and property-management operations.
- Automatic pricing, tax calculation, or payment reconciliation.

Reservation enquiries remain requests until staff verify and confirm them through the supported workflow. A status change alone does not guarantee that a room has been allocated.

## 12. Hotel Information and Photography

Before final public launch, verify all hotel information with management, including:

- Room categories and descriptions.
- Prices and booking policies.
- Facilities, dining services, and menus.
- Official contact details and physical address.
- Social media links.
- Cancellation and check-in/check-out policies.
- Privacy notice and data-handling practices.
- Permissions to publish the supplied hotel logo and photographs.

The current website uses remote Unsplash images as illustrative placeholders. They must not be presented as actual photographs of East Afro Hotel.

Review the [Unsplash License](https://unsplash.com/license) and [Unsplash Terms](https://unsplash.com/terms) before using stock imagery.

## 13. Version History

| Version | Description |
|---|---|
| Versions 1–2 | Original public website and enquiry functionality |
| Version 3 | Room operations, room blocks, and room calendar |
| Version 4 | Inventory-backed room allocation and CSV exports |
| Version 5 | Indicative guest-facing room availability |
| Version 6 | Accessibility, lightbox, selected-stay summary, metadata, and reduced-motion enhancements |

## Project Status

**Version 6 — Existing GitHub repository and Netlify deployment.**

The website is ready for deployment verification and final production checks. Preserve the existing project and Supabase setup when publishing updates.

Production use requires verified hotel information, tested database security, appropriate anti-abuse protections, and reliable procedures for confirming reservations and communicating with guests.
