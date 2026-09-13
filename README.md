# Where's Sam? — Berlin Marathon Tracker

Static, client-side only (no backend). 4 files: `index.html`, `style.css`, `app.js`, `route-data.js`.

## Deploy to Cloudflare Pages

1. Push this folder to a git repo (or drag-and-drop the folder in the Cloudflare Pages dashboard: Workers & Pages → Create → Pages → Upload assets).
2. No build command needed — it's static. Output directory: `/` (project root).

## Replace the placeholder route

`route-data.js` currently has a rough dummy loop through central Berlin, not the real course. Replace the `ROUTE_COORDS` array with the real course points, in order, as `[lat, lng]` pairs. Everything else (km/mile markers, pace math, map overlay, click-for-ETA) rescales automatically to a true 42.195 km — the source points don't need to be perfectly spaced or exactly 42.195 km themselves.

## How sharing works

All state (name, start time, goal, units) is packed into one opaque `?d=` URL param — nothing is stored server-side, and reloading the page with that link reproduces the exact same view for whoever opens it.
