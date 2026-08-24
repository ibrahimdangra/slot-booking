// Replace with your deployed Apps Script Web App URL (ends in /exec)
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxNiAASkLyxn2hgVv318LTuVMNX6q90XhxjEr-YLg75Yzpem4-XGGObIo7VEOkkVRtBUA/exec";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Half-hour unit starts from 09:00 to 21:00 inclusive (last unit is 21:00-21:30)
const TIMES = (() => {
  const times = [];
  for (let h = 9; h <= 21; h++) {
    times.push(`${String(h).padStart(2, "0")}:00`);
    times.push(`${String(h).padStart(2, "0")}:30`);
  }
  return times;
})();

const UNIT_MINUTES = 30;
const LEVEL_UNITS = { GCSE: 2, "A-Level": 3 };
