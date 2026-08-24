// Wrapper around the Apps Script Web App endpoint.

// Apps Script Web Apps occasionally return a transient 404/"unable to open
// the file" error unrelated to the app itself. Retry a couple of times
// before giving up so a single flaky response doesn't strand the user.
async function fetchState() {
  const attempts = 3;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${APPS_SCRIPT_URL}?action=getState`);
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
async function postAction(action, payload) {
  const attempts = 3;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json();
    if (data.error !== "busy" || i === attempts - 1) return data;
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
  }
}
