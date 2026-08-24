// Wrapper around the Apps Script Web App endpoint.

// Without an explicit timeout, a stalled request (flaky mobile network, a
// hung Apps Script execution) leaves fetch() pending indefinitely, so the
// UI just spins forever instead of ever reaching the retry logic below.
const FETCH_TIMEOUT_MS = 12000;

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Apps Script Web Apps occasionally return a transient 404/"unable to open
// the file" error unrelated to the app itself. Retry a couple of times
// before giving up so a single flaky response doesn't strand the user.
async function fetchState() {
  const attempts = 3;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchWithTimeout(`${APPS_SCRIPT_URL}?action=getState`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to fetch state");
      return data; // { ok, availability, bookings }
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 700));
    }
  }
  throw lastErr;
}

// NOTE: body is sent as a plain string (not application/json) on purpose.
// Apps Script Web Apps don't respond to CORS preflight (OPTIONS) requests,
// so setting an explicit Content-Type would trigger a preflight and fail.
// Leaving Content-Type unset makes the browser send text/plain, which is a
// "simple request" and skips preflight entirely. The server parses it with
// JSON.parse(e.postData.contents).
// Under a burst of simultaneous writes, the backend's script lock (see
// Code.gs) can report "busy" if it couldn't acquire the lock in time.
// Retry a couple of times with a short delay instead of surfacing that
// straight to the user as a failure.
// Only retries on "busy" (the server acknowledged the request but couldn't
// get the lock) — not on network/timeout errors, since we can't tell
// whether a timed-out write actually landed server-side, and retrying a
// bookSlot blindly risks a duplicate booking. A timeout here still throws
// and reaches the caller's own try/catch instead of hanging forever.
async function postAction(action, payload) {
  const attempts = 3;
  for (let i = 0; i < attempts; i++) {
    const res = await fetchWithTimeout(APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json();
    if (data.error !== "busy" || i === attempts - 1) return data;
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
  }
}
