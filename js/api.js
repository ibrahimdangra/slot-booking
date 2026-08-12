// Wrapper around the Apps Script Web App endpoint.

async function fetchState() {
  const res = await fetch(`${APPS_SCRIPT_URL}?action=getState`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Failed to fetch state");
  return data; // { ok, availability, bookings }
}

// NOTE: body is sent as a plain string (not application/json) on purpose.
// Apps Script Web Apps don't respond to CORS preflight (OPTIONS) requests,
// so setting an explicit Content-Type would trigger a preflight and fail.
// Leaving Content-Type unset makes the browser send text/plain, which is a
// "simple request" and skips preflight entirely. The server parses it with
// JSON.parse(e.postData.contents).
async function postAction(action, payload) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify({ action, ...payload }),
  });
  return res.json();
}
