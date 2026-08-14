const DAY_FULL = {
  Mon: "Mondays",
  Tue: "Tuesdays",
  Wed: "Wednesdays",
  Thu: "Thursdays",
  Fri: "Fridays",
  Sat: "Saturdays",
};

let state = null; // { availability, bookings }
let selectedLevel = null;
let selectedSlot = null; // { day, startTime, endTime }

const steps = ["step-1", "step-2", "step-3", "step-5"];

function showStep(id) {
  steps.forEach((s) => {
    document.getElementById(s).classList.toggle("hidden", s !== id);
  });
}

function formatTime12(t) {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}

document.getElementById("btn-back-2").addEventListener("click", () => {
  showStep("step-1");
});

document.getElementById("btn-back-3").addEventListener("click", () => {
  showStep("step-2");
});

document.getElementById("btn-start").addEventListener("click", () => {
  showStep("step-2");
});

document.querySelectorAll("[data-level]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    selectedLevel = btn.dataset.level;
    showStep("step-3");
    await loadAndRenderGrid();
  });
});

async function loadAndRenderGrid() {
  const grid = document.getElementById("slot-grid");
  const loading = document.getElementById("grid-loading");
  grid.innerHTML = "";
  grid.style.display = "none";
  grid.classList.remove("fade-in");
  loading.classList.remove("hidden");

  try {
    state = await fetchState();
  } catch (err) {
    loading.textContent = "Sorry, couldn't load availability. Please try again later.";
    return;
  }
  loading.classList.add("hidden");
  loading.textContent = "Loading";
  renderGrid();
}

function renderGrid() {
  const grid = document.getElementById("slot-grid");
  grid.innerHTML = "";
  grid.style.display = "grid";
  grid.classList.add("fade-in");

  document.getElementById("grid-subtitle").textContent =
    selectedLevel === "GCSE" ? "All GCSE slots are 1 hour" : "All A-Level slots are 1.5 hours";
  hideGridError();

  // corner
  grid.appendChild(makeCell("", "day-header"));
  DAYS.forEach((d) => grid.appendChild(makeCell(d[0], "day-header")));

  // Precompute individually free (open & not booked) half-hour units per day.
  // A cell is clickable whenever its own unit is free, even if the full
  // level-length slot starting there wouldn't fit — that's validated on click.
  const freeUnitsByDay = {};
  DAYS.forEach((day) => {
    freeUnitsByDay[day] = getFreeUnits(state.availability, state.bookings, day);
  });

  TIMES.forEach((time) => {
    // The border below this row marks the boundary to the next row: a solid
    // hour line if this row is the :30 before the next hour, otherwise a
    // dotted half-hour line.
    const lineCls = time.endsWith(":30") ? "row-hour-line" : "row-half-line";

    grid.appendChild(makeCell(formatTime12(time), `time-label ${lineCls}`));
    DAYS.forEach((day) => {
      if (freeUnitsByDay[day].has(time)) {
        const cell = makeCell("", `bookable ${lineCls}`);
        cell.addEventListener("click", () => attemptSelectSlot(day, time));
        grid.appendChild(cell);
      } else {
        grid.appendChild(makeCell("", `empty ${lineCls}`));
      }
    });
  });
}

function attemptSelectSlot(day, time) {
  const { valid, endTime } = getLevelSlotAt(state.availability, state.bookings, day, selectedLevel, time);
  if (!valid) {
    showGridError(
      selectedLevel === "GCSE"
        ? "GCSE slots are 1 hour each. Please choose another time."
        : "A-Level slots are 1.5 hours each. Please choose another time."
    );
    return;
  }
  hideGridError();
  openBookingModal(day, { startTime: time, endTime });
}

function showGridError(message) {
  const el = document.getElementById("grid-error");
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideGridError() {
  document.getElementById("grid-error").classList.add("hidden");
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

// ---- Booking modal ----
const modal = document.getElementById("booking-modal");
const form = document.getElementById("booking-form");
const errorEl = document.getElementById("booking-error");

function openBookingModal(day, slot) {
  selectedSlot = { day, startTime: slot.startTime, endTime: slot.endTime };
  document.getElementById("modal-title").textContent =
    `${DAY_FULL[day]} ${formatTime12(slot.startTime)}-${formatTime12(slot.endTime)}`;
  document.getElementById("modal-level").textContent = selectedLevel;
  form.reset();
  errorEl.classList.add("hidden");
  modal.classList.remove("hidden");
}

function closeBookingModal() {
  modal.classList.add("hidden");
}

modal.addEventListener("click", (e) => {
  if (e.target === modal) closeBookingModal();
});

document.getElementById("btn-close-booking").addEventListener("click", closeBookingModal);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.classList.add("hidden");
  const submitBtn = form.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "Please wait...";

  const payload = {
    day: selectedSlot.day,
    startTime: selectedSlot.startTime,
    endTime: selectedSlot.endTime,
    level: selectedLevel,
    subject: document.getElementById("subject").value,
    studentName: document.getElementById("studentName").value.trim(),
    parentName: document.getElementById("parentName").value.trim(),
    parentNumber: document.getElementById("parentNumber").value.trim(),
    email: document.getElementById("email").value.trim(),
  };

  try {
    const result = await postAction("bookSlot", payload);
    if (result.ok) {
      closeBookingModal();
      showStep("step-5");
    } else if (result.error === "slot_taken") {
      errorEl.textContent = "Sorry, that slot was just booked. Please pick another.";
      errorEl.classList.remove("hidden");
      closeBookingModal();
      await loadAndRenderGrid();
    } else {
      errorEl.textContent = "Something went wrong. Please try again.";
      errorEl.classList.remove("hidden");
    }
  } catch (err) {
    errorEl.textContent = "Network error. Please try again.";
    errorEl.classList.remove("hidden");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Book";
  }
});

document.getElementById("btn-book-another").addEventListener("click", () => {
  showStep("step-2");
});
