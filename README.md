# Where's Sam? — Berlin Marathon Cheer Planner

Static, client-side only (no backend). 4 files: `index.html`, `style.css`, `app.js`, `route-data.js`.

A plan-ahead spectator tool, not a live tracker: friends enter a runner's start time and goal pace/finish time, and it predicts roughly where on the course they'll be at what clock time — no GPS, no live data.

## Deploy to Cloudflare Pages

1. Push this folder to a git repo (or drag-and-drop the folder in the Cloudflare Pages dashboard: Workers & Pages → Create → Pages → Upload assets).
2. No build command needed — it's static. Output directory: `/` (project root).

## The route

`route-data.js` holds the real BMW Berlin Marathon course — 508 `[lat, lng]` points imported from the official GPX file. If the course changes in a future year, just swap in a new GPX's points in order; everything else (5K markers, km dots, pace math, map overlay, click-for-ETA) rescales automatically to a true 42.195 km, so the source points don't need to be perfectly spaced or exact.

## How sharing works

All state (name, start time, goal type/value) is packed into one opaque `?d=` URL param — nothing is stored server-side, and reloading the page with that link reproduces the exact same view for whoever opens it.
