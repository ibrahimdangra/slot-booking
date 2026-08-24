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
let selectedDayIndex = 0;

// Kick off the availability fetch immediately on page load, rather than
// waiting until the user reaches the slot picker (step 3). Apps Script cold
// starts can take a couple of seconds, so by the time someone has tapped
// through "Book a slot" -> a level, this has often already resolved.
let statePromise = fetchState();
statePromise.catch(() => {}); // avoid an unhandled-rejection warning; the real error is handled where it's awaited

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
    selectedDayIndex = 0;
    showStep("step-3");
    await loadAndRenderList();
  });
});

document.getElementById("day-prev").addEventListener("click", () => {
  selectedDayIndex = (selectedDayIndex - 1 + DAYS.length) % DAYS.length;
  renderList();
});

document.getElementById("day-next").addEventListener("click", () => {
  selectedDayIndex = (selectedDayIndex + 1) % DAYS.length;
  renderList();
});

async function loadAndRenderList() {
  const list = document.getElementById("slot-list");
  const loading = document.getElementById("grid-loading");
  list.innerHTML = "";
  list.style.display = "none";
  list.classList.remove("fade-in");
  loading.classList.remove("hidden");

  try {
    state = await (statePromise || fetchState());
  } catch (err) {
    statePromise = null;
    loading.textContent = "Sorry, couldn't load availability. Please try again later.";
    return;
  }
  // Once consumed, the next visit to the slot picker (new level, or a
  // retry after a slot got taken) should fetch fresh data rather than
  // reusing this snapshot.
  statePromise = null;
  loading.classList.add("hidden");
  loading.textContent = "Loading";
  renderList();
}

function renderList() {
  const list = document.getElementById("slot-list");
  list.innerHTML = "";
  list.style.display = "flex";
  list.classList.add("fade-in");

  const day = DAYS[selectedDayIndex];
  document.getElementById("day-title-text").textContent = DAY_FULL[day];
  document.getElementById("grid-subtitle").textContent =
    selectedLevel === "GCSE" ? "All GCSE slots are 1 hour" : "All A-Level slots are 1.5 hours";
  hideGridError();

  // Only full-length, non-overlapping slots for this level are listed here,
  // so picking one slot automatically removes any other start time that
  // would double-book the same half-hour units (e.g. 6-7pm being taken
  // removes 5:30pm too).
  const slots = getBookableSlots(state.availability, state.bookings, day, selectedLevel);

  if (slots.length === 0) {
    const empty = document.createElement("p");
    empty.className = "list-empty";
    empty.textContent = "No available slots on this day.";
    list.appendChild(empty);
    return;
  }

  slots.forEach((slot) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot-btn";
    btn.textContent = formatTime12(slot.startTime);
    btn.addEventListener("click", () => openBookingModal(day, slot));
    list.appendChild(btn);
  });
}

function showGridError(message) {
  const el = document.getElementById("grid-error");
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideGridError() {
  document.getElementById("grid-error").classList.add("hidden");
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
    startingDate: document.getElementById("startingDate").value,
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
      await loadAndRenderList();
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
