// ============================================================================
// Sam's Berlin Marathon Cheer Planner — client-side only, plan-ahead spectator tool.
// All state lives in the URL (?d=... base64 blob) — no backend, no storage.
// Nothing recomputes as you type — only the CALCULATE button updates the
// header, map markers, and splits table.
// ============================================================================

const MARATHON_KM = 42.195;
const RACE_DATE = "2026-09-27"; // BMW Berlin Marathon race day (date only used to anchor the clock-time math)

// ---- geo helpers -----------------------------------------------------------

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Cumulative raw distance (km) at each ROUTE_COORDS vertex, then rescaled
// so the final vertex sits at exactly MARATHON_KM. This means imprecise
// course data still produces a sensible, proportional set of km splits.
function buildCumulativeDistances(coords) {
  const raw = [0];
  for (let i = 1; i < coords.length; i++) {
    raw.push(raw[i - 1] + haversineKm(coords[i - 1], coords[i]));
  }
  const total = raw[raw.length - 1] || 1;
  const scale = MARATHON_KM / total;
  return raw.map((d) => d * scale);
}

const CUM_DIST = buildCumulativeDistances(ROUTE_COORDS);

// Given a cumulative distance (km) along the route, interpolate a lat/lng.
function pointAtDistance(km) {
  const clamped = Math.max(0, Math.min(km, MARATHON_KM));
  for (let i = 1; i < CUM_DIST.length; i++) {
    if (clamped <= CUM_DIST[i]) {
      const segLen = CUM_DIST[i] - CUM_DIST[i - 1];
      const t = segLen === 0 ? 0 : (clamped - CUM_DIST[i - 1]) / segLen;
      const a = ROUTE_COORDS[i - 1];
      const b = ROUTE_COORDS[i];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
  }
  return ROUTE_COORDS[ROUTE_COORDS.length - 1];
}

// Project a clicked/hovered lat/lng onto the nearest point on the route
// polyline, returning the cumulative distance (km) at that point.
// Uses a local equirectangular approximation (fine at city scale).
function nearestDistanceOnRoute(latlng) {
  const lat0 = (ROUTE_COORDS[0][0] * Math.PI) / 180;
  const cosLat = Math.cos(lat0);

  function toXY(p) {
    return [p[1] * cosLat, p[0]]; // lng scaled by cos(lat), lat as-is (proportional, good enough for projection)
  }

  const p = toXY([latlng.lat, latlng.lng]);
  let best = { distKm: Infinity, cum: 0 };

  for (let i = 1; i < ROUTE_COORDS.length; i++) {
    const a = toXY(ROUTE_COORDS[i - 1]);
    const b = toXY(ROUTE_COORDS[i]);
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const lenSq = abx * abx + aby * aby;
    let t = lenSq === 0 ? 0 : ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = a[0] + abx * t;
    const projY = a[1] + aby * t;
    const dx = p[0] - projX;
    const dy = p[1] - projY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < best.distKm) {
      const cum = CUM_DIST[i - 1] + t * (CUM_DIST[i] - CUM_DIST[i - 1]);
      best = { distKm: d, cum };
    }
  }
  return best.cum;
}

// ---- time helpers -----------------------------------------------------------

// Pace field is always mm:ss.
function parseClockToSeconds(str) {
  const parts = str.split(":").map((n) => parseInt(n, 10) || 0);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

// Goal finish time field is always h:mm (e.g. "5:32" = 5h 32m) — no seconds,
// so there's no ambiguity between "hh:mm" and "mm:ss" like a bare clock string has.
function parseHoursMinutesToSeconds(str) {
  const parts = str.split(":").map((n) => parseInt(n, 10) || 0);
  const hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  return hours * 3600 + minutes * 60;
}

function formatClockTime(date) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}


// ---- state (URL <-> form) ---------------------------------------------------

function getState() {
  const goalType = document.getElementById("goalTypeToggle").querySelector(".active").dataset.value;
  return {
    n: document.getElementById("nameInput").value.trim() || "Sam",
    s: document.getElementById("startInput").value,
    gt: goalType,
    gv: goalType === "time"
      ? document.getElementById("goalTimeInput").value.trim()
      : document.getElementById("goalPaceInput").value.trim(),
  };
}

// A native time input requires a strictly zero-padded "HH:MM" value —
// pad old share links that stored an unpadded value like "3:45".
function padTimeValue(str) {
  const parts = str.split(":");
  if (parts.length !== 2) return str;
  return parts.map((p) => p.padStart(2, "0")).join(":");
}

function applyState(state) {
  if (!state) return;
  if (state.n) document.getElementById("nameInput").value = state.n;
  if (state.s) document.getElementById("startInput").value = padTimeValue(state.s);
  if (state.gt) setToggle("goalTypeToggle", state.gt);
  if (state.gv) {
    const padded = padTimeValue(state.gv);
    if (state.gt === "pace") document.getElementById("goalPaceInput").value = padded;
    else document.getElementById("goalTimeInput").value = padded;
  }
}

function setToggle(groupId, value) {
  const group = document.getElementById(groupId);
  group.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === value);
  });
  onGoalTypeChange();
}

function encodeState(state) {
  const json = JSON.stringify(state);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeState(str) {
  try {
    let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = decodeURIComponent(escape(atob(b64)));
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

function updateUrl(state) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("d", encodeState(state));
  window.history.replaceState({}, "", url.toString());
}

// ---- rendering ---------------------------------------------------------------

let map, routeLine, routeHitLine, hoverTooltip, splitMarkersLayer;

function initMap() {
  map = L.map("map", { scrollWheelZoom: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  routeLine = L.polyline(ROUTE_COORDS, {
    color: "#ff4fa8",
    weight: 5,
    opacity: 0.95,
    interactive: false,
  }).addTo(map);

  // Invisible fat line on top of the visible route, purely to make it easy
  // to click/tap/hover accurately — a thin stroke is a hard target.
  routeHitLine = L.polyline(ROUTE_COORDS, {
    color: "#000000",
    weight: 24,
    opacity: 0,
  }).addTo(map);

  map.fitBounds(routeLine.getBounds(), { padding: [8, 8] });
  map.setZoom(map.getZoom() + 1);

  hoverTooltip = L.tooltip({ sticky: true });
  routeHitLine.bindTooltip(hoverTooltip);

  routeHitLine.on("mousemove", (e) => {
    const distKm = nearestDistanceOnRoute(e.latlng);
    routeHitLine.setTooltipContent(etaLabel(distKm));
  });

  routeHitLine.on("click", (e) => {
    const distKm = nearestDistanceOnRoute(e.latlng);
    L.popup()
      .setLatLng(e.latlng)
      .setContent(etaLabel(distKm))
      .openOn(map);
  });

  splitMarkersLayer = L.layerGroup().addTo(map);
}

function etaLabel(distKm) {
  const { paceSecPerKm, startDate } = computeGoal();
  const elapsedSec = paceSecPerKm * distKm;
  const clock = startDate ? formatClockTime(new Date(startDate.getTime() + elapsedSec * 1000)) : "--:--:--";
  return `<strong>${distKm.toFixed(2)} km</strong><br>ETA: ${clock}`;
}

function currentGoalType() {
  return document.getElementById("goalTypeToggle").querySelector(".active").dataset.value;
}

function computeGoal() {
  const goalType = currentGoalType();
  let paceSecPerKm;

  if (goalType === "time") {
    const totalSec = parseHoursMinutesToSeconds(document.getElementById("goalTimeInput").value || "0:00");
    paceSecPerKm = totalSec / MARATHON_KM;
  } else {
    paceSecPerKm = parseClockToSeconds(document.getElementById("goalPaceInput").value || "0");
  }

  const timeVal = document.getElementById("startInput").value || "09:15";
  const startDate = new Date(`${RACE_DATE}T${timeVal}:00`);

  return { paceSecPerKm, startDate };
}

// Big badges: start, every 5K, and the finish line.
function buildBadgeMarkers() {
  const markers = [{ distKm: 0, label: "START", type: "start" }];
  for (let n = 5; n < MARATHON_KM - 1e-6; n += 5) {
    markers.push({ distKm: n, label: `${n}K`, type: "mid" });
  }
  markers.push({ distKm: MARATHON_KM, label: "FINISH", type: "finish" });
  return markers;
}

// Small dots for every other km (the 5K marks already get a big badge).
function buildKmDots() {
  const dots = [];
  for (let n = 1; n < MARATHON_KM - 1e-6; n++) {
    if (n % 5 === 0) continue;
    dots.push(n);
  }
  return dots;
}

const BADGE_COLORS = ["", "blue", "lime"]; // cycles for the 5K markers

function render() {
  const name = document.getElementById("nameInput").value.trim() || "Sam";

  document.getElementById("pageTitle").innerHTML = `Where's <span class="accent">${escapeHtml(name)}</span>?`;
  document.title = `Where's ${name}? — Berlin Marathon Cheer Planner`;

  if (splitMarkersLayer) {
    splitMarkersLayer.clearLayers();

    buildKmDots().forEach((n) => {
      const pt = pointAtDistance(n);
      L.circleMarker(pt, {
        radius: 4,
        color: "#241c4d",
        weight: 2,
        fillColor: "#ffffff",
        fillOpacity: 1,
      })
        .bindPopup(etaLabel(n))
        .addTo(splitMarkersLayer);
    });

    let midIndex = 0;
    buildBadgeMarkers().forEach((sp) => {
      const pt = pointAtDistance(sp.distKm);
      const cls = sp.type === "mid" ? BADGE_COLORS[midIndex++ % BADGE_COLORS.length] : sp.type;
      const icon = L.divIcon({
        className: "",
        html: `<div class="km-badge ${cls}">${sp.label}</div>`,
      });
      L.marker(pt, { icon })
        .bindPopup(etaLabel(sp.distKm))
        .addTo(splitMarkersLayer);
    });
  }

  updateUrl(getState());
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function onGoalTypeChange() {
  const goalType = currentGoalType();
  document.getElementById("goalTimeField").style.display = goalType === "time" ? "" : "none";
  document.getElementById("goalPaceField").style.display = goalType === "pace" ? "" : "none";
}

// ---- wiring --------------------------------------------------------------

function wireToggle(groupId, onChange) {
  const group = document.getElementById(groupId);
  group.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      group.querySelectorAll(".toggle-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      onChange();
    });
  });
}

function wireInputs() {
  wireToggle("goalTypeToggle", onGoalTypeChange);

  document.getElementById("calculateBtn").addEventListener("click", render);

  document.getElementById("shareBtn").addEventListener("click", async () => {
    updateUrl(getState());
    const url = window.location.href;
    const feedback = document.getElementById("shareFeedback");
    try {
      await navigator.clipboard.writeText(url);
      feedback.textContent = "✔ Link copied to clipboard!";
    } catch (e) {
      feedback.textContent = url;
    }
    setTimeout(() => (feedback.textContent = ""), 4000);
  });
}

function init() {
  const params = new URLSearchParams(window.location.search);
  const stateParam = params.get("d");
  const state = stateParam ? decodeState(stateParam) : null;

  if (state) {
    applyState(state);
  } else {
    onGoalTypeChange();
  }

  initMap();
  wireInputs();
  render();
}

document.addEventListener("DOMContentLoaded", init);
