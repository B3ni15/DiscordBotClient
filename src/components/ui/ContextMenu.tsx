"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useContextMenu, type MenuItem } from "@/lib/store/contextMenu";

const MENU_WIDTH = 200;
const SUBMENU_WIDTH = 240;
const EDGE_PADDING = 8;
/** A submenu overlaps its parent slightly, so the pointer never leaves a menu. */
const SUBMENU_OVERLAP = 4;

/**
 * Every panel of an open menu is portalled into this one layer. It keeps
 * submenus out of the scroll container of their parent (which would clip them)
 * while leaving them inside the element the dismiss handler tests against.
 */
const MenuLayer = createContext<HTMLElement | null>(null);

/** Where a panel wants to sit: at a point, or beside the row that opened it. */
interface Placement {
  x: number;
  y: number;
  anchor?: React.RefObject<HTMLElement | null>;
}

/**
 * The app's right-click menu, rendered once at the root and driven by the
 * context-menu store. It replaces the browser's own menu everywhere the app
 * defines one, the way the Discord client does.
 */
export function ContextMenuHost() {
  const menu = useContextMenu((state) => state.menu);
  const close = useContextMenu((state) => state.close);

  // A menu only ever opens from a pointer event, so the document is there.
  if (!menu || typeof document === "undefined") return null;

  return createPortal(
    <MenuRoot
      key={menu.key}
      x={menu.x}
      y={menu.y}
      label={menu.label}
      items={menu.items}
      onClose={close}
    />,
    document.body,
  );
}

function MenuRoot({
  x,
  y,
  label,
  items,
  onClose,
}: {
  x: number;
  y: number;
  label: string;
  items: MenuItem[];
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [layer, setLayer] = useState<HTMLElement | null>(null);

  // Any click, scroll, resize or Escape outside the menu dismisses it, and a
  // second right-click elsewhere opens the menu for that target instead.
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    function onScroll(event: Event) {
      // Scrolling inside the menu itself must not close it.
      if (root.current?.contains(event.target as Node)) return;
      onClose();
    }
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("contextmenu", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("contextmenu", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={(element) => {
        root.current = element;
        setLayer(element);
      }}
      className="pointer-events-none fixed inset-0 z-[100]"
    >
      <MenuLayer.Provider value={layer}>
        {layer && (
          <MenuPanel
            placement={{ x, y }}
            label={label}
            items={items}
            onClose={onClose}
            autoFocus
          />
        )}
      </MenuLayer.Provider>
    </div>
  );
}

/**
 * Measures the panel and places it: at the click point for the root menu, beside
 * its parent row for a submenu, and flipped whenever the viewport runs out.
 *
 * The result is written straight onto the node rather than held in state. A
 * panel has to be measured before it can be placed, and a state round-trip
 * would mean one extra render of every menu on every open.
 */
function usePlacement(placement: Placement, revision: unknown) {
  const panel = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    // Measure from the top left corner: against a viewport edge the panel would
    // otherwise be squeezed, and the size read back would not be its own.
    element.style.left = "0px";
    element.style.top = "0px";
    const { width, height } = element.getBoundingClientRect();
    const anchor = placement.anchor?.current?.getBoundingClientRect();

    let left = anchor ? anchor.right - SUBMENU_OVERLAP : placement.x;
    let top = anchor ? anchor.top - 6 : placement.y;

    if (left + width > window.innerWidth - EDGE_PADDING) {
      left = anchor
        ? anchor.left + SUBMENU_OVERLAP - width
        : window.innerWidth - width - EDGE_PADDING;
    }
    if (top + height > window.innerHeight - EDGE_PADDING) {
      top = window.innerHeight - height - EDGE_PADDING;
    }
    left = Math.max(EDGE_PADDING, left);
    top = Math.max(EDGE_PADDING, top);
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;

    // A panel can lay out slightly differently once it has moved (a scrollbar
    // appears, a label stops wrapping), so the placement is checked against the
    // viewport once more and nudged back in if it now sticks out.
    const placed = element.getBoundingClientRect();
    const overflowX = placed.right - (window.innerWidth - EDGE_PADDING);
    const overflowY = placed.bottom - (window.innerHeight - EDGE_PADDING);
    if (overflowX > 0) element.style.left = `${Math.max(EDGE_PADDING, left - overflowX)}px`;
    if (overflowY > 0) element.style.top = `${Math.max(EDGE_PADDING, top - overflowY)}px`;

    element.style.visibility = "visible";
  }, [placement.x, placement.y, placement.anchor, revision]);

  return panel;
}

interface MenuPanelProps {
  placement: Placement;
  label: string;
  items: MenuItem[];
  onClose: () => void;
  autoFocus?: boolean;
}

/** One floating panel: the menu itself, or one of its submenus. */
function MenuPanel({ placement, label, items, onClose, autoFocus }: MenuPanelProps) {
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const [focused, setFocused] = useState(-1);
  const panel = usePlacement(placement, items);

  useEffect(() => {
    if (autoFocus) panel.current?.focus();
  }, [autoFocus, panel]);

  const focusable = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.type !== "separator" && item.type !== "heading");

  function move(step: number) {
    if (focusable.length === 0) return;
    const current = focusable.findIndex(({ index }) => index === focused);
    const next =
      current === -1
        ? step > 0
          ? 0
          : focusable.length - 1
        : (current + step + focusable.length) % focusable.length;
    setFocused(focusable[next].index);
  }

  function run(item: MenuItem) {
    if (item.type === "item") {
      if (item.disabled) return;
      item.onSelect();
      if (!item.keepOpen) onClose();
    } else if (item.type === "toggle") {
      if (item.disabled) return;
      item.onSelect();
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "ArrowRight": {
        const item = items[focused];
        if (item?.type === "submenu" && !item.disabled) {
          event.preventDefault();
          setOpenSubmenu(item.id);
        }
        break;
      }
      case "ArrowLeft":
        if (openSubmenu) {
          event.preventDefault();
          setOpenSubmenu(null);
        }
        break;
      case "Enter":
      case " ": {
        const item = items[focused];
        if (!item) break;
        event.preventDefault();
        if (item.type === "submenu") setOpenSubmenu(item.id);
        else run(item);
        break;
      }
      case "Home":
        event.preventDefault();
        setFocused(focusable[0]?.index ?? -1);
        break;
      case "End":
        event.preventDefault();
        setFocused(focusable[focusable.length - 1]?.index ?? -1);
        break;
    }
  }

  return (
    <FloatingPanel
      panelRef={panel}
      origin={placement}
      minWidth={MENU_WIDTH}
      label={label}
      onKeyDown={handleKeyDown}
      scrollable
    >
      {items.map((item, index) => (
        <MenuRow
          key={item.id}
          item={item}
          focused={focused === index}
          submenuOpen={item.type === "submenu" && openSubmenu === item.id}
          onFocus={() => {
            setFocused(index);
            // Hovering any other row folds an open submenu away again.
            if (item.type !== "submenu") setOpenSubmenu(null);
          }}
          onOpenSubmenu={(open) => setOpenSubmenu(open ? item.id : null)}
          onRun={() => run(item)}
          onClose={onClose}
        />
      ))}
    </FloatingPanel>
  );
}

/** Shared chrome of every panel: portalled into the menu layer and placed by hand. */
function FloatingPanel({
  panelRef,
  origin,
  minWidth,
  label,
  onKeyDown,
  scrollable = false,
  children,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
  /** Starting point; `usePlacement` moves the node once it can be measured. */
  origin: { x: number; y: number };
  minWidth: number;
  label: string;
  onKeyDown?: (event: React.KeyboardEvent) => void;
  scrollable?: boolean;
  children: React.ReactNode;
}) {
  const layer = useContext(MenuLayer);
  if (!layer) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={`pointer-events-auto fixed animate-pop-in rounded border border-black/40 bg-floating p-1.5 shadow-[0_8px_16px_rgba(0,0,0,0.24)] outline-none ${
        scrollable ? "max-h-[min(70vh,640px)] overflow-x-hidden overflow-y-auto" : ""
      }`}
      style={{
        left: origin.x,
        top: origin.y,
        maxWidth: `calc(100vw - ${EDGE_PADDING * 2}px)`,
        minWidth,
        // Hidden until `usePlacement` has measured and moved it.
        visibility: "hidden",
      }}
    >
      {children}
    </div>,
    layer,
  );
}

function MenuRow({
  item,
  focused,
  submenuOpen,
  onFocus,
  onOpenSubmenu,
  onRun,
  onClose,
}: {
  item: MenuItem;
  focused: boolean;
  submenuOpen: boolean;
  onFocus: () => void;
  onOpenSubmenu: (open: boolean) => void;
  onRun: () => void;
  onClose: () => void;
}) {
  const row = useRef<HTMLDivElement>(null);

  if (item.type === "separator") {
    return <div role="separator" className="my-1 h-px bg-line" />;
  }

  if (item.type === "heading") {
    return (
      <div className="px-2 pt-1.5 pb-1 text-[11px] font-bold tracking-wide text-muted uppercase">
        {item.label}
      </div>
    );
  }

  const disabled = item.disabled === true;
  const danger = item.type === "item" && item.danger === true;
  const base =
    "group/menu flex w-full cursor-pointer items-center gap-2 rounded-[3px] px-2 py-[6px] text-left text-sm leading-tight transition-colors";
  const tone = disabled
    ? "cursor-not-allowed text-faint opacity-50"
    : danger
      ? "text-danger hover:bg-danger hover:text-white"
      : "text-text hover:bg-accent hover:text-white";
  const active =
    focused && !disabled ? (danger ? "bg-danger text-white" : "bg-accent text-white") : "";

  if (item.type === "toggle") {
    return (
      <div
        ref={row}
        role="menuitemcheckbox"
        aria-checked={item.checked}
        aria-disabled={disabled}
        title={disabled ? item.reason : undefined}
        tabIndex={-1}
        onMouseEnter={onFocus}
        onClick={() => !disabled && onRun()}
        className={`${base} ${tone} ${active}`}
      >
        <span
          aria-hidden
          className={`grid h-4 w-4 shrink-0 place-items-center rounded-[3px] border text-[10px] ${
            item.checked
              ? "border-transparent bg-accent text-white group-hover/menu:bg-white group-hover/menu:text-accent"
              : "border-muted"
          }`}
        >
          {item.checked ? "✓" : ""}
        </span>
        {item.color && (
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: item.color }}
          />
        )}
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
      </div>
    );
  }

  if (item.type === "submenu") {
    const Content = item.content;
    return (
      <div
        ref={row}
        className="relative"
        onMouseEnter={() => {
          onFocus();
          if (!disabled) onOpenSubmenu(true);
        }}
      >
        <div
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={submenuOpen}
          aria-disabled={disabled}
          title={disabled ? item.reason : undefined}
          tabIndex={-1}
          onClick={() => !disabled && onOpenSubmenu(!submenuOpen)}
          className={`${base} ${tone} ${
            active || (submenuOpen && !disabled ? "bg-accent text-white" : "")
          }`}
        >
          {item.icon && (
            <span aria-hidden className="w-4 shrink-0 text-center text-xs">
              {item.icon}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          <span aria-hidden className="shrink-0 text-[10px] opacity-70">
            ▶
          </span>
        </div>

        {submenuOpen &&
          !disabled &&
          (Content ? (
            <SubmenuShell placement={{ x: 0, y: 0, anchor: row }} label={item.label}>
              <Content close={onClose} />
            </SubmenuShell>
          ) : (
            <MenuPanel
              placement={{ x: 0, y: 0, anchor: row }}
              label={item.label}
              items={item.items ?? []}
              onClose={onClose}
            />
          ))}
      </div>
    );
  }

  return (
    <div
      ref={row}
      role="menuitem"
      aria-disabled={disabled}
      title={disabled ? item.reason : undefined}
      tabIndex={-1}
      onMouseEnter={onFocus}
      onClick={() => !disabled && onRun()}
      className={`${base} ${tone} ${active}`}
    >
      {item.icon && (
        <span aria-hidden className="w-4 shrink-0 text-center text-xs">
          {item.icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.hint && (
        <span className="shrink-0 font-mono text-[10px] text-faint group-hover/menu:text-white/70">
          {item.hint}
        </span>
      )}
    </div>
  );
}

/** The same floating panel as a menu, but filled with a component's own UI. */
function SubmenuShell({
  placement,
  label,
  children,
}: {
  placement: Placement;
  label: string;
  children: React.ReactNode;
}) {
  const panel = usePlacement(placement, label);

  return (
    <FloatingPanel
      panelRef={panel}
      origin={placement}
      minWidth={SUBMENU_WIDTH}
      label={label}
    >
      {children}
    </FloatingPanel>
  );
}
