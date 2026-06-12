import { useEffect, type ReactNode } from "react";

export function EyeMark({ size = 26, live = false, eyes = 0, stroke = 6 }: { size?: number; live?: boolean; eyes?: number; stroke?: number }) {
  const ticks = [];
  if (eyes) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ticks.push(<circle key={i} className="tick" cx={50 + Math.cos(a) * 44} cy={50 + Math.sin(a) * 44} r="1.7" />);
    }
  }
  return (
    <svg className="eyemark" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      {eyes ? <g>{ticks}</g> : null}
      <path className="lid" d="M14 50 Q50 22 86 50 Q50 78 14 50 Z" strokeWidth={stroke} strokeLinejoin="round" />
      <g style={live ? { animation: "irisShift 7s ease-in-out infinite", transformOrigin: "center" } : undefined}>
        <circle className="iris" cx="50" cy="50" r="15" strokeWidth={stroke} />
        <circle className="pupil" cx="50" cy="50" r="6" />
      </g>
    </svg>
  );
}

const ICON_PATHS: Record<string, ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.3" /><rect x="14" y="3" width="7" height="7" rx="1.3" /><rect x="3" y="14" width="7" height="7" rx="1.3" /><rect x="14" y="14" width="7" height="7" rx="1.3" /></>,
  plug: <path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0zM12 16v6" />,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M19 17H6a2 2 0 0 0-2 2" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  minus: <path d="M5 12h14" />,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  git: <><circle cx="6" cy="6" r="2.3" /><circle cx="6" cy="18" r="2.3" /><circle cx="18" cy="9" r="2.3" /><path d="M6 8.3v7.4M15.7 9.4A6 6 0 0 1 9 15.4" /></>,
  pr: <><circle cx="6" cy="6" r="2.3" /><circle cx="6" cy="18" r="2.3" /><circle cx="18" cy="18" r="2.3" /><path d="M6 8.3v7.4M18 8v8M15 5h2a2 2 0 0 1 2 2" /></>,
  refresh: <path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v4h-4" />,
  flask: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3" /><path d="M7.5 14h9" /></>,
  shield: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M17.7 6.3l-2.4 2.4M8.7 15.3l-2.4 2.4" />,
  edit: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />,
  trash: <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8M17 6l2 2M15 8l2 2" /></>,
  link: <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  alert: <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />,
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[name] ?? null}
    </svg>
  );
}

export function Btn({
  children,
  kind = "",
  sm,
  icon,
  onClick,
  disabled,
  title,
}: {
  children?: ReactNode;
  kind?: string;
  sm?: boolean;
  icon?: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  const cls = ["c-btn", kind, sm ? "sm" : "", icon && !children ? "icon" : ""].filter(Boolean).join(" ");
  return (
    <button className={cls} onClick={onClick} disabled={disabled} title={title} aria-label={!children ? title : undefined}>
      {icon && <Icon name={icon} size={sm ? 14 : 16} />}
      {children}
    </button>
  );
}

export function Progress({ value, indeterminate }: { value?: number; indeterminate?: boolean }) {
  return (
    <div className={"progress" + (indeterminate ? " indeterminate" : "")}>
      <i style={{ width: `${value ?? 0}%` }}></i>
    </div>
  );
}

export function Toggle({ on, onClick, label, disabled }: { on: boolean; onClick?: () => void; label: string; disabled?: boolean }) {
  return <button className={"toggle" + (on ? " on" : "")} role="switch" aria-checked={on} aria-label={label} onClick={onClick} disabled={disabled}></button>;
}

export function Modal({
  open,
  title,
  children,
  footer,
  lg,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  lg?: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={"modal" + (lg ? " lg" : "")} role="dialog" aria-modal="true">
        <div className="modal-head"><h3>{title}</h3></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel} footer={<>
      <Btn onClick={onCancel}>Cancel</Btn>
      <Btn kind={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Btn>
    </>}>
      {body}
    </Modal>
  );
}
