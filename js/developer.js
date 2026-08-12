let state = null; // { availability, bookings }

const grid = document.getElementById("dev-grid");

async function loadAndRender() {
  grid.innerHTML = "<p>Loading...</p>";
  try {
    state = await fetchState();
  } catch (err) {
    grid.innerHTML = "<p>Couldn't load data. Check APPS_SCRIPT_URL in config.js.</p>";
    return;
  }
  render();
}

// Returns map "day|time" -> booking object, plus which unit index within the booking (0-based)
function bookingUnitMap() {
  const map = new Map();
  state.bookings.forEach((b) => {
    const units = expandRange(b.startTime, b.endTime);
    units.forEach((u, idx) => {
      map.set(`${b.day}|${u}`, { booking: b, index: idx, total: units.length });
    });
  });
  return map;
}

function render() {
  grid.innerHTML = "";
  const bookMap = bookingUnitMap();

  grid.appendChild(makeCell("", "day-header"));
  DAYS.forEach((d) => grid.appendChild(makeCell(d, "day-header")));

  TIMES.forEach((time) => {
    const isHourStart = time.endsWith(":00");
    grid.appendChild(makeCell(formatTime12(time), `time-label${isHourStart ? " hour-start" : ""}`));

    DAYS.forEach((day) => {
      const key = `${day}|${time}`;
      const bookingInfo = bookMap.get(key);
      let cell;

      if (bookingInfo) {
        const { booking, index, total } = bookingInfo;
        if (index === 0) {
          cell = makeCell(booking.studentName, `slot booked-start${isHourStart ? " hour-start" : ""}`);
        } else {
          cell = makeCell("", `slot booked-continue${isHourStart ? " hour-start" : ""}`);
        }
        if (index === total - 1) cell.classList.add("booked-end");
        cell.addEventListener("click", () => openDetailModal(booking));
      } else {
        cell = makeCell("", `slot empty${isHourStart ? " hour-start" : ""}`);
      }

      grid.appendChild(cell);
    });
  });
}

function makeCell(text, cls) {
  const div = document.createElement("div");
  div.className = `cell ${cls}`;
  if (cls.includes("time-label")) {
    const span = document.createElement("span");
    span.textContent = text;
    div.appendChild(span);
  } else {
    div.textContent = text;
  }
  return div;
}

function formatTime12(t) {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}

// ---- Booking detail modal ----
const detailModal = document.getElementById("detail-modal");
const detailBody = document.getElementById("detail-body");
const detailError = document.getElementById("detail-error");
let selectedBooking = null;

function openDetailModal(booking) {
  selectedBooking = booking;
  detailError.classList.add("hidden");
  detailBody.innerHTML = `
    <div class="detail-row"><span>Day</span><span>${booking.day}</span></div>
    <div class="detail-row"><span>Time</span><span>${formatTime12(booking.startTime)}-${formatTime12(booking.endTime)}</span></div>
    <div class="detail-row"><span>Level</span><span>${booking.level}</span></div>
    <div class="detail-row"><span>Student</span><span>${escapeHtml(booking.studentName)}</span></div>
    <div class="detail-row"><span>Parent</span><span>${escapeHtml(booking.parentName)}</span></div>
    <div class="detail-row"><span>Parent #</span><span>${escapeHtml(booking.parentNumber)}</span></div>
    <div class="detail-row"><span>Zoom email</span><span>${escapeHtml(booking.email)}</span></div>
  `;
  detailModal.classList.remove("hidden");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

document.getElementById("btn-close-detail").addEventListener("click", () => {
  detailModal.classList.add("hidden");
});

detailModal.addEventListener("click", (e) => {
  if (e.target === detailModal) detailModal.classList.add("hidden");
});

document.getElementById("btn-cancel-booking").addEventListener("click", async () => {
  if (!selectedBooking) return;
  detailError.classList.add("hidden");
  try {
    const result = await postAction("cancelBooking", { bookingId: selectedBooking.bookingId });
    if (result.ok) {
      detailModal.classList.add("hidden");
      await loadAndRender();
    } else {
      detailError.textContent = "Could not cancel booking. Please try again.";
      detailError.classList.remove("hidden");
    }
  } catch (err) {
    detailError.textContent = "Network error. Please try again.";
    detailError.classList.remove("hidden");
  }
});

loadAndRender();
