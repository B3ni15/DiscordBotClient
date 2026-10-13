"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/components/ui/icons";
import { useContextMenu } from "@/lib/store/contextMenu";
import { useUI } from "@/lib/store/ui";

export interface SettingsNavItem<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  /** A count or dot at the end of the row, e.g. pending interactions. */
  badge?: React.ReactNode;
}

export interface SettingsNavGroup<T extends string> {
  heading: string;
  items: SettingsNavItem<T>[];
}

/**
 * Discord's full-screen settings layout, shared by server settings, user
 * settings and the slash command manager: a sidebar of pages on the left that
 * hugs the centre, the page on the right, and the round ESC button. On a phone
 * the sidebar turns into a page picker at the top.
 *
 * Escape closes it unless a dialog or menu on top of it is open; those take
 * the key first.
 */
export function FullscreenSettings<T extends string>({
  label,
  groups,
  active,
  onSelect,
  onClose,
  footer,
  contentWidth = 740,
  children,
}: {
  label: string;
  groups: SettingsNavGroup<T>[];
  active: T;
  onSelect: (id: T) => void;
  onClose: () => void;
  /** Rows under the last group, such as Leave Server or Log Out. */
  footer?: React.ReactNode;
  /** Most pages read best at Discord's 740px; editors can ask for more room. */
  contentWidth?: number;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (useUI.getState().dialog || useContextMenu.getState().menu) return;
      onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-[80] flex animate-pop-in flex-col bg-chat md:flex-row"
    >
      <aside className="hidden flex-[1_0_218px] justify-end overflow-y-auto bg-panel md:flex">
        <nav aria-label={label} className="w-[218px] py-[60px] pr-1.5 pl-5">
          {groups.map((group, index) => (
            <div key={group.heading} className={index > 0 ? "mt-2 border-t border-line/60 pt-2" : ""}>
              <h2 className="truncate px-2.5 pb-1.5 text-xs font-bold tracking-wide text-muted uppercase">
                {group.heading}
              </h2>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={active === item.id ? "page" : undefined}
                  className={`mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-base font-medium transition-colors ${
                    active === item.id
                      ? "bg-raised text-bright"
                      : "text-muted hover:bg-hover hover:text-text"
                  }`}
                >
                  {item.icon && <span className="shrink-0 opacity-80">{item.icon}</span>}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.badge}
                </button>
              ))}
            </div>
          ))}
          {footer && <div className="mt-2 border-t border-line/60 pt-2">{footer}</div>}
        </nav>
      </aside>

      {/* Phones get a compact bar instead of the sidebar. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-panel px-3 py-2 md:hidden">
        <select
          value={active}
          onChange={(event) => onSelect(event.target.value as T)}
          aria-label={`${label} page`}
          className="min-w-0 flex-1 rounded-md bg-ink px-3 py-2 text-sm font-medium text-bright outline-none"
        >
          {groups.map((group) => (
            <optgroup key={group.heading} label={group.heading}>
              {group.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-hover hover:text-bright"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      <main className="flex min-h-0 flex-1 items-start overflow-y-auto md:flex-[1_1_800px]">
        <div
          className="relative min-h-full w-full px-4 pt-6 pb-20 md:px-10 md:pt-[60px]"
          style={{ maxWidth: contentWidth }}
        >
          {children}
        </div>
        <div className="sticky top-0 hidden shrink-0 pt-[60px] pr-5 md:block">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="group/esc flex flex-col items-center gap-2 text-muted"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-muted transition-colors group-hover/esc:border-bright group-hover/esc:text-bright">
              <CloseIcon size={18} />
            </span>
            <span className="text-[13px] font-semibold">ESC</span>
          </button>
        </div>
      </main>
    </div>,
    document.body,
  );
}

/** A red row for the sidebar footer: Leave Server, Log Out. */
export function SettingsDangerRow({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-base font-medium text-danger transition-colors hover:bg-hover"
    >
      {label}
      {icon}
    </button>
  );
}

/** The page heading every settings page opens with. */
export function SettingsPageTitle({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  /** A button aligned with the title, such as "New command". */
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold text-bright">{title}</h1>
        {children && <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>}
      </div>
      {action}
    </header>
  );
}
