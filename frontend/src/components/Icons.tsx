import type { SVGProps } from "react";

export type IconName =
  | "overview"
  | "logs"
  | "analytics"
  | "performance"
  | "refresh"
  | "settings"
  | "sun"
  | "moon"
  | "database"
  | "alert"
  | "warning"
  | "activity"
  | "search"
  | "plus"
  | "close"
  | "chevron"
  | "check"
  | "server"
  | "cpu"
  | "arrow";

type IconProps = SVGProps<SVGSVGElement> & { name: IconName };

export function Icon({ name, ...props }: IconProps) {
  const content = (() => {
    switch (name) {
      case "overview":
        return <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>;
      case "logs":
        return <><path d="M4 6h16M4 12h16M4 18h11"/><circle cx="2.5" cy="6" r=".5" fill="currentColor"/><circle cx="2.5" cy="12" r=".5" fill="currentColor"/><circle cx="2.5" cy="18" r=".5" fill="currentColor"/></>;
      case "analytics":
        return <><path d="M4 19V9M10 19V5M16 19v-7M22 19V2"/><path d="M2 19h21"/></>;
      case "performance":
        return <><path d="M20 13a8 8 0 1 1-3-6.2"/><path d="m12 13 6-7"/><circle cx="12" cy="13" r="1.5"/></>;
      case "refresh":
        return <><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></>;
      case "settings":
        return <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>;
      case "sun":
        return <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>;
      case "moon":
        return <path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5 8.5 8.5 0 1 0 20.5 14.3Z"/>;
      case "database":
        return <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/></>;
      case "server":
        return <><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01"/></>;
      case "alert":
        return <><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></>;
      case "warning":
        return <><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5M12 18h.01"/></>;
      case "activity":
        return <path d="M3 12h4l2.5-7 5 14 2.5-7h4"/>;
      case "search":
        return <><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></>;
      case "plus":
        return <path d="M12 5v14M5 12h14"/>;
      case "close":
        return <path d="m6 6 12 12M18 6 6 18"/>;
      case "chevron":
        return <path d="m9 18 6-6-6-6"/>;
      case "check":
        return <path d="m5 12 4 4L19 6"/>;
      case "cpu":
        return <><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3M10 10h4v4h-4z"/></>;
      case "arrow":
        return <><path d="M5 12h14M14 7l5 5-5 5"/></>;
    }
  })();

  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      {...props}
    >
      {content}
    </svg>
  );
}
