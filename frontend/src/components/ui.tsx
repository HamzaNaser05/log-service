import type { ReactNode } from "react";
import type { LogLevel } from "../api/types";
import { Icon, type IconName } from "./Icons";

export function LevelBadge({ level }: { level: LogLevel }) {
  return <span className={`level-badge level-${level}`}><span />{level}</span>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-notice" role="alert">
      <div className="error-icon"><Icon name="alert" /></div>
      <div>
        <strong>We couldn’t load this data</strong>
        <p>{message}</p>
      </div>
      {onRetry && <button className="button button-secondary button-small" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function EmptyState({
  icon = "logs",
  title,
  description,
}: {
  icon?: IconName;
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name={icon} /></span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="loading-block" aria-label="Loading" aria-busy="true">
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton" key={index} style={{ width: `${92 - index * 7}%` }} />
      ))}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}
