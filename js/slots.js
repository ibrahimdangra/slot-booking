// Pure logic, no DOM. Shared by client.js and developer.js.

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// List of half-hour unit start times covered by [start, end)
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

// Set of half-hour units already consumed by bookings on a given day
function getOccupiedUnits(bookings, day) {
  const occupied = new Set();
  for (const b of bookings) {
    if (b.day !== day) continue;
    for (const unit of expandRange(b.startTime, b.endTime)) {
      occupied.add(unit);
    }
  }
  return occupied;
}

// Set of half-hour units the tutor has marked available for a given day
function getOpenUnits(availability, day) {
  const open = new Set();
  for (const a of availability) {
    if (a.day === day && a.available) open.add(a.time);
  }
  return open;
}

// Returns [{startTime, endTime}] of valid bookable slots for a day+level
function getBookableSlots(availability, bookings, day, level) {
  const unitsNeeded = LEVEL_UNITS[level];
  if (!unitsNeeded) return [];

  const freeUnits = getFreeUnits(availability, bookings, day);

  const results = [];
  for (const startTime of TIMES) {
    const startMin = timeToMinutes(startTime);
    const neededUnits = [];
    for (let i = 0; i < unitsNeeded; i++) {
      neededUnits.push(minutesToTime(startMin + i * UNIT_MINUTES));
    }
    if (neededUnits.every((u) => freeUnits.has(u))) {
      results.push({
        startTime,
        endTime: minutesToTime(startMin + unitsNeeded * UNIT_MINUTES),
      });
    }
  }
  return results;
}

// Set of half-hour units that are individually open and not yet booked,
// regardless of whether a full level-length slot fits starting there.
function getFreeUnits(availability, bookings, day) {
  const openUnits = getOpenUnits(availability, day);
  const occupiedUnits = getOccupiedUnits(bookings, day);
  return new Set([...openUnits].filter((u) => !occupiedUnits.has(u)));
}

// Checks whether a full level-length slot starting at startTime is free.
// Returns { valid, endTime }.
function getLevelSlotAt(availability, bookings, day, level, startTime) {
  const unitsNeeded = LEVEL_UNITS[level];
  if (!unitsNeeded) return { valid: false };

  const freeUnits = getFreeUnits(availability, bookings, day);
  const startMin = timeToMinutes(startTime);
  const neededUnits = [];
  for (let i = 0; i < unitsNeeded; i++) {
    neededUnits.push(minutesToTime(startMin + i * UNIT_MINUTES));
  }
  return {
    valid: neededUnits.every((u) => freeUnits.has(u)),
    endTime: minutesToTime(startMin + unitsNeeded * UNIT_MINUTES),
  };
}
