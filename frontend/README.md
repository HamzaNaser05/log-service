# PulseLog Operations Console

React and TypeScript dashboard for the high-throughput log service. The UI reads the existing `/health`, `/logs`, and `/logs/aggregate` contracts; it does not maintain a parallel data model or generate demonstration metrics.

## Local development

Start the backend on port 8080, then run:

```bash
npm install
npm run dev
```

Vite serves the dashboard at `http://localhost:5173` and proxies `/api` to `http://localhost:8080`. Override the development target with `VITE_DEV_API_TARGET` if needed.

## Production build

```bash
npm run build
```

The included multi-stage Dockerfile builds the static bundle and serves it with Nginx. In the repository root, `docker compose up --build` starts PostgreSQL, the API, and this dashboard at `http://localhost:3000`.

The API base URL and automatic refresh interval are also configurable at runtime from the dashboard’s Settings dialog.

## Structure

- `src/api/` — types and request serialization matching the backend contracts
- `src/components/` — reusable UI primitives, icons, and SVG chart rendering
- `src/pages/` — overview, explorer, analytics, and documented performance views
- `src/lib/` — date and number formatting helpers
