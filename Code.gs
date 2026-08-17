// Google Apps Script Web App backend for the slot-booking site.
// Standalone script — set SPREADSHEET_ID below to your Sheet's ID (from its URL).
// Sheet must have two tabs: "Availability" and "Bookings" with headers as described in README.md.

const SPREADSHEET_ID = "PASTE_YOUR_SHEET_ID_HERE";
const SHEET_AVAILABILITY = "Availability";
const SHEET_BOOKINGS = "Bookings";
const UNIT_MINUTES = 30;
const LEVEL_UNITS = { "GCSE": 2, "A-Level": 3 };

function doGet(e) {
  const action = e.parameter.action;
  if (action === "getState") {
    return jsonResponse(getState());
  }
  return jsonResponse({ ok: false, error: "unknown_action" });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ ok: false, error: "invalid_body" });
  }

  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(10000);
  if (!gotLock) {
    return jsonResponse({ ok: false, error: "busy", message: "Please try again in a moment." });
  }

  try {
    switch (body.action) {
      case "bookSlot":
        return jsonResponse(bookSlot(body));
      case "cancelBooking":
        return jsonResponse(cancelBooking(body));
      case "setAvailability":
        return jsonResponse(setAvailability(body));
      default:
        return jsonResponse({ ok: false, error: "unknown_action" });
    }
  } finally {
    lock.releaseLock();
  }
}

// ---- Read helpers ----

function getState() {
  const availability = readAvailability();
  const bookings = readBookings();
  return { ok: true, availability, bookings };
}

function readAvailability() {
  const sheet = getSheet(SHEET_AVAILABILITY);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const [day, time, available] = rows[i];
    if (!day) continue;
    out.push({ day: String(day), time: formatTimeCell(time), available: available === true || available === "TRUE" });
  }
  return out;
}

function readBookings() {
  const sheet = getSheet(SHEET_BOOKINGS);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const [bookingId, day, startTime, endTime, level, subject, startingDate, studentName, parentName, parentNumber, email, createdAt] = rows[i];
    if (!bookingId) continue;
    out.push({
      bookingId: String(bookingId),
      day: String(day),
      startTime: formatTimeCell(startTime),
      endTime: formatTimeCell(endTime),
      level: String(level),
      subject: String(subject),
      startingDate: String(startingDate),
      studentName: String(studentName),
      parentName: String(parentName),
      parentNumber: String(parentNumber),
      email: String(email),
      createdAt: createdAt instanceof Date ? createdAt.toISOString() : String(createdAt),
    });
  }
  return out;
}

// Sheet auto-converts strings like "10:00" into time values, which come back from
// getValues() as Date objects. `instanceof Date` unreliably detects these in Apps
// Script, so use the more robust toString-tag check instead.
function formatTimeCell(val) {
  if (Object.prototype.toString.call(val) === "[object Date]") {
    const h = val.getHours();
    const m = val.getMinutes();
    return Utilities.formatString("%02d:%02d", h, m);
  }
  return String(val);
}

// ---- Write actions ----

function bookSlot(body) {
  const { day, startTime, endTime, level, subject, startingDate, studentName, parentName, parentNumber, email } = body;
  if (!day || !startTime || !endTime || !level || !subject || !startingDate || !studentName || !parentName || !parentNumber || !email) {
    return { ok: false, error: "missing_fields" };
  }

  const availability = readAvailability();
  const bookings = readBookings();
  const neededUnits = expandRange(startTime, endTime);

  // Every needed unit must be marked available
  const availSet = new Set(
    availability.filter((a) => a.day === day && a.available).map((a) => a.time)
  );
  const allAvailable = neededUnits.every((u) => availSet.has(u));
  if (!allAvailable) {
    return { ok: false, error: "slot_taken", message: "That slot is not available." };
  }

  // No overlap with existing bookings on that day
  const occupied = new Set();
  bookings.filter((b) => b.day === day).forEach((b) => {
    expandRange(b.startTime, b.endTime).forEach((u) => occupied.add(u));
  });
  const overlaps = neededUnits.some((u) => occupied.has(u));
  if (overlaps) {
    return { ok: false, error: "slot_taken", message: "That slot was just booked. Please pick another." };
  }

  const bookingId = "b_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  const sheet = getSheet(SHEET_BOOKINGS);
  sheet.appendRow([
    bookingId, day, startTime, endTime, level, subject, startingDate,
    studentName, parentName, parentNumber, email,
    new Date().toISOString(),
  ]);

  return { ok: true, bookingId };
}

function cancelBooking(body) {
  const { bookingId } = body;
  if (!bookingId) return { ok: false, error: "missing_fields" };

  const sheet = getSheet(SHEET_BOOKINGS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === bookingId) {
      sheet.deleteRow(i + 1); // +1 because getValues is 0-indexed but sheet rows are 1-indexed
      return { ok: true };
    }
  }
  return { ok: false, error: "not_found" };
}

function setAvailability(body) {
  const updates = body.updates || [];
  if (!updates.length) return { ok: false, error: "missing_fields" };

  const bookings = readBookings();
  const occupiedByDay = {};
  bookings.forEach((b) => {
    if (!occupiedByDay[b.day]) occupiedByDay[b.day] = new Set();
    expandRange(b.startTime, b.endTime).forEach((u) => occupiedByDay[b.day].add(u));
  });

  const sheet = getSheet(SHEET_AVAILABILITY);
  const rows = sheet.getDataRange().getValues();
  const rowIndexByKey = {}; // "day|time" -> sheet row number (1-indexed)
  for (let i = 1; i < rows.length; i++) {
    const key = `${rows[i][0]}|${formatTimeCell(rows[i][1])}`;
    rowIndexByKey[key] = i + 1;
  }

  const applied = [];
  const skipped = [];

  updates.forEach((u) => {
    const occupied = occupiedByDay[u.day] && occupiedByDay[u.day].has(u.time);
    if (occupied) {
      skipped.push({ day: u.day, time: u.time, reason: "booked" });
      return;
    }
    const key = `${u.day}|${u.time}`;
    const rowNum = rowIndexByKey[key];
    if (!rowNum) {
      skipped.push({ day: u.day, time: u.time, reason: "not_found" });
      return;
    }
    sheet.getRange(rowNum, 3).setValue(u.available === true);
    applied.push({ day: u.day, time: u.time });
  });

  return { ok: true, applied, skipped };
}

// ---- Shared helpers ----

function expandRange(startTime, endTime) {
  const units = [];
  let cur = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  while (cur < end) {
    units.push(minutesToTime(cur));
    cur += UNIT_MINUTES;
  }
  return units;
}

function timeToMinutes(t) {
  const parts = String(t).split(":").map(Number);
  return parts[0] * 60 + parts[1];
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return Utilities.formatString("%02d:%02d", h, m);
}

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(`Sheet tab "${name}" not found`);
  return sheet;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---- One-time setup helper: run this manually from the Apps Script editor ----
// (Select "seedAvailability" in the function dropdown, then click Run.)
function seedAvailability() {
  const sheet = getSheet(SHEET_AVAILABILITY);
  sheet.clear();
  sheet.appendRow(["Day", "Time", "Available"]);

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const rows = [];
  for (let h = 10; h <= 21; h++) {
    ["00", "30"].forEach((mm) => {
      const time = Utilities.formatString("%02d:%s", h, mm);
      days.forEach((day) => {
        rows.push([day, time, false]);
      });
    });
  }
  sheet.getRange(2, 1, rows.length, 3).setValues(rows);
}
