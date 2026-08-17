# Tutoring Slot Booking

Two pages, one static site:

- **`index.html`** — client booking flow (mobile-first). Send this link (or your deployed root URL) to parents.
- **`developer.html`** — your admin view (desktop). Keep this link private — there's no login, just an unlisted URL.

Backend is a Google Sheet, written to via a Google Apps Script Web App.

## 1. Set up the Google Sheet

1. Create a new Google Sheet.
2. Create two tabs named exactly `Availability` and `Bookings`.
3. In `Bookings`, add this header row:
   ```
   BookingId | Day | StartTime | EndTime | Level | Subject | StartingDate | StudentName | ParentName | ParentNumber | Email | CreatedAt
   ```
4. Leave `Availability` empty for now — you'll seed it via script in step 3 below.

## 2. Add the Apps Script

1. In the Sheet, go to **Extensions → Apps Script**.
2. Delete any starter code and paste in the contents of `Code.gs` from this repo.
3. Save (Ctrl/Cmd+S).

## 3. Seed availability (one-time)

1. In the Apps Script editor, choose the function `seedAvailability` from the dropdown next to the Run button.
2. Click **Run**. Approve the permissions prompt when asked.
3. This fills `Availability` with every half-hour slot from 10:00–21:30, Monday–Saturday, all marked **unavailable**. You'll open up your real teaching hours later from the developer view.

## 4. Deploy the Web App

1. In the Apps Script editor: **Deploy → New deployment**.
2. Type: **Web app**.
3. Execute as: **Me**.
4. Who has access: **Anyone**.
5. Click **Deploy**, authorize if prompted, and copy the Web App URL (ends in `/exec`).

> ⚠️ **Every time you edit `Code.gs`, you must publish a new version** for the change to go live: **Deploy → Manage deployments → (pencil icon) → New version → Deploy**. Just saving the script is not enough — the `/exec` URL keeps serving the old code until you do this.

## 5. Point the site at your Web App

1. Open `js/config.js`.
2. Replace `PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE` with the URL from step 4.

## 6. Deploy the static site

No build step needed — it's plain HTML/CSS/JS.

- **Vercel/Netlify**: connect the repo (or drag-and-drop the folder into Netlify), leave build command empty, output directory = root.
- Once deployed you'll have two links to share:
  - `https://yoursite.com/` (or `/index.html`) — send to clients.
  - `https://yoursite.com/developer.html` — keep for yourself.

## Using the developer view

- **Grey hatched cells** = not offered. **Light blue cells** = open and unbooked. **Orange cells** = booked (shows student name).
- Click a grey/blue cell to toggle it, or click-and-drag down a column to toggle a range at once.
- Click an orange (booked) cell to see full contact details and cancel the booking, freeing the slot back up.
- You can't toggle availability on a slot that's currently booked — cancel the booking first.

## How slot lengths work

Availability is tracked in 30-minute units. When a client picks **GCSE**, the app looks for 2 consecutive open units (1 hour). For **A-Level**, it looks for 3 consecutive open units (1.5 hours). This means, for example, if 4:00–5:30pm is booked as A-Level, 5:30–6:30pm is still bookable as GCSE, and 5:30–7:00pm is still bookable as A-Level — booking one slot only consumes the exact half-hour units it needs.

Bookings are for a recurring weekly slot (e.g. "Tuesdays 6–7pm") — there's no date, just a day-of-week + time, and it stays booked until you cancel it from the developer view.
