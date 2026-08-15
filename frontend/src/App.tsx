import { useEffect, useState, type FormEvent } from "react";
import { getHealth } from "./api/client";
import { Icon, type IconName } from "./components/Icons";
import { Analytics } from "./pages/Analytics";
import { LogsExplorer } from "./pages/LogsExplorer";
import { Overview, type HealthState } from "./pages/Overview";
import { Performance } from "./pages/Performance";

type Page = "overview" | "logs" | "analytics" | "performance";
type Theme = "light" | "dark";

const pages: Array<{ id: Page; label: string; icon: IconName; caption: string }> = [
  { id: "overview", label: "Overview", icon: "overview", caption: "System pulse" },
  { id: "logs", label: "Logs explorer", icon: "logs", caption: "Query events" },
  { id: "analytics", label: "Analytics", icon: "analytics", caption: "Aggregate trends" },
  { id: "performance", label: "Performance", icon: "performance", caption: "Benchmarks" },
];

function readPage(): Page {
  const page = window.location.hash.slice(1);
  return pages.some((item) => item.id === page) ? page as Page : "overview";
}

function initialTheme(): Theme {
  const saved = window.localStorage.getItem("log-dashboard-theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const [page, setPage] = useState<Page>(readPage);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [apiBaseUrl, setApiBaseUrl] = useState(() => window.localStorage.getItem("log-dashboard-api-url") || import.meta.env.VITE_API_BASE_URL || "/api");
  const [refreshInterval, setRefreshInterval] = useState(() => Number(window.localStorage.getItem("log-dashboard-refresh") || 0));
  const [refreshKey, setRefreshKey] = useState(0);
  const [health, setHealth] = useState<HealthState>({ status: "loading" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiDraft, setApiDraft] = useState(apiBaseUrl);
  const [refreshDraft, setRefreshDraft] = useState(refreshInterval);

  useEffect(() => {
    function onHashChange() { setPage(readPage()); }
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash) window.history.replaceState(null, "", "#overview");
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("log-dashboard-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!refreshInterval) return;
    const timer = window.setInterval(() => setRefreshKey((key) => key + 1), refreshInterval);
    return () => window.clearInterval(timer);
  }, [refreshInterval]);

  useEffect(() => {
    const controller = new AbortController();
    setHealth({ status: "loading" });
    getHealth(apiBaseUrl, controller.signal)
      .then((response) => {
        if (response.status === "ok") setHealth({ status: "healthy" });
        else setHealth({ status: "unavailable", message: `Health endpoint returned “${response.status}”.` });
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setHealth({ status: "unavailable", message: reason instanceof Error ? reason.message : "Health check failed." });
      });
    return () => controller.abort();
  }, [apiBaseUrl, refreshKey]);

  function saveSettings(event: FormEvent) {
    event.preventDefault();
    const normalizedApiUrl = apiDraft.trim().replace(/\/+$/, "") || "/api";
    setApiBaseUrl(normalizedApiUrl);
    setRefreshInterval(refreshDraft);
    setRefreshKey((key) => key + 1);
    window.localStorage.setItem("log-dashboard-api-url", normalizedApiUrl);
    window.localStorage.setItem("log-dashboard-refresh", String(refreshDraft));
    setSettingsOpen(false);
  }

  function openSettings() {
    setApiDraft(apiBaseUrl);
    setRefreshDraft(refreshInterval);
    setSettingsOpen(true);
  }

  function refresh() { setRefreshKey((key) => key + 1); }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="PulseLog overview">
          <span className="brand-mark"><span /><span /><span /><span /></span>
          <span><strong>PulseLog</strong><small>Operations console</small></span>
        </a>

        <nav className="primary-nav" aria-label="Dashboard navigation">
          <span className="nav-label">Workspace</span>
          {pages.map((item) => (
            <a href={`#${item.id}`} className={page === item.id ? "active" : ""} key={item.id}>
              <span className="nav-icon"><Icon name={item.icon} /></span>
              <span><strong>{item.label}</strong><small>{item.caption}</small></span>
              {page === item.id && <span className="nav-active-dot" />}
            </a>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="connection-card">
            <div className="connection-title"><span className={`connection-dot ${health.status}`} /><strong>{health.status === "healthy" ? "API connected" : health.status === "unavailable" ? "API unavailable" : "Connecting…"}</strong></div>
            <span title={apiBaseUrl}>{apiBaseUrl}</span>
          </div>
          <div className="sidebar-meta"><span>Fastify + PostgreSQL</span><span>v1.0</span></div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-context"><span>Log service</span><Icon name="chevron" /><strong>{pages.find((item) => item.id === page)?.label}</strong></div>
          <div className="topbar-actions">
            {refreshInterval > 0 && <span className="auto-refresh-indicator"><i />Auto · {refreshInterval / 1000}s</span>}
            <button className="icon-button topbar-button" onClick={refresh} aria-label="Refresh current data" title="Refresh"><Icon name="refresh" /></button>
            <button className="icon-button topbar-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}><Icon name={theme === "dark" ? "sun" : "moon"} /></button>
            <button className="button button-secondary settings-button" onClick={openSettings}><Icon name="settings" />Settings</button>
          </div>
        </header>

        <main className="page-content">
          {page === "overview" && <Overview apiBaseUrl={apiBaseUrl} refreshKey={refreshKey} health={health} onRefresh={refresh} />}
          {page === "logs" && <LogsExplorer apiBaseUrl={apiBaseUrl} refreshKey={refreshKey} onRefresh={refresh} />}
          {page === "analytics" && <Analytics apiBaseUrl={apiBaseUrl} refreshKey={refreshKey} onRefresh={refresh} />}
          {page === "performance" && <Performance />}
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile dashboard navigation">
        {pages.map((item) => <a href={`#${item.id}`} className={page === item.id ? "active" : ""} key={item.id}><Icon name={item.icon} /><span>{item.label.replace(" explorer", "")}</span></a>)}
      </nav>

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="modal-heading"><div><span className="section-kicker">Dashboard configuration</span><h2 id="settings-title">Connection settings</h2></div><button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><Icon name="close" /></button></div>
            <form onSubmit={saveSettings}>
              <label className="field"><span>API base URL</span><input value={apiDraft} onChange={(event) => setApiDraft(event.target.value)} placeholder="/api or http://localhost:8080" autoFocus /><small>Use <code>/api</code> for the bundled proxy, or enter a full URL for another CORS-enabled deployment.</small></label>
              <label className="field"><span>Automatic refresh</span><select value={refreshDraft} onChange={(event) => setRefreshDraft(Number(event.target.value))}><option value={0}>Off</option><option value={5000}>Every 5 seconds</option><option value={10000}>Every 10 seconds</option><option value={30000}>Every 30 seconds</option></select><small>Refreshes the active page and health status. Performance data is documented and static.</small></label>
              <div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setSettingsOpen(false)}>Cancel</button><button className="button button-primary" type="submit"><Icon name="check" />Save and connect</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
