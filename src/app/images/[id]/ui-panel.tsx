"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import type { ScreenLayout } from "@/lib/use-screen-layout";
import type { Edge } from "@/lib/view-geometry";

export type ListEntry = { id: string; label: string; more: number };

type Props = {
  layout: ScreenLayout;
  edge: Edge;
  /** Hidden while a card is open (Rule 3.7). */
  hidden: boolean;
  onFlip: () => void;
  /**
   * Zoom one step around the centre: a fallback for mouse and trackpad users whose browser doesn't
   * pass on trackpad pinches (e.g. some on Linux under X11). Not shown on touch screens.
   */
  onZoom: (direction: "in" | "out") => void;
  /** Zoom is off in annotate mode (Rule 2.5). */
  zoomDisabled: boolean;
  title: string;
  /** The Annotate button, or what visitors who can't annotate see instead. */
  annotate: ReactNode;
  /** A hint for the current mode, such as how to draw a box. */
  hint: string | null;
  entries: ListEntry[];
  onPick: (id: string) => void;
  boxesVisible: boolean;
  onToggleBoxes: () => void;
  /** Byline, description, image actions, account and the report link. */
  about: ReactNode;
};

/**
 * Everything that isn't the artwork or an annotation (docs/enrich-UI.md, Rule 3). A constant size
 * on screen, fixed to a short edge of the visible area: top or bottom in portrait, left or right in
 * landscape.
 */
export function UiPanel({
  layout,
  edge,
  hidden,
  onFlip,
  onZoom,
  zoomDisabled,
  title,
  annotate,
  hint,
  entries,
  onPick,
  boxesVisible,
  onToggleBoxes,
  about,
}: Props) {
  const [section, setSection] = useState<"list" | "about" | null>(null);
  const { area, screen, orientation } = layout;
  const portrait = orientation === "portrait";

  const style: CSSProperties = portrait
    ? {
        left: area.x,
        width: area.w,
        maxHeight: area.h * 0.6,
        ...(edge === "start" ? { top: area.y } : { bottom: screen.h - (area.y + area.h) }),
      }
    : {
        top: area.y,
        // Wide enough for the site name and buttons, and the controls, each on one row.
        width: Math.min(420, area.w * 0.45),
        maxHeight: area.h,
        ...(edge === "start" ? { left: area.x } : { right: screen.w - (area.x + area.w) }),
      };

  const toggle = (s: "list" | "about") => setSection(section === s ? null : s);
  const flipLabel = portrait
    ? `Move this panel to the ${edge === "start" ? "bottom" : "top"}`
    : `Move this panel to the ${edge === "start" ? "right" : "left"}`;

  return (
    <div
      role="region"
      aria-label="Image controls"
      hidden={hidden}
      style={style}
      className={`fixed z-20 flex touch-pan-y flex-col overflow-hidden bg-white/90 text-zinc-900 shadow-lg backdrop-blur dark:bg-zinc-900/90 dark:text-zinc-100 ${
        portrait ? (edge === "start" ? "rounded-b-xl" : "rounded-t-xl") : "rounded-xl"
      } ${portrait ? "" : edge === "start" ? "ml-3 mt-3" : "mr-3 mt-3"}`}
    >
      <div className={`flex shrink-0 flex-col gap-2 p-3 ${portrait && edge === "end" && section ? "order-last" : ""}`}>
        <div className="flex items-center gap-2">
          <Link href="/" className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-500 hover:underline">
            A Thousand Words
          </Link>
          <IconButton label="Zoom out" onClick={() => onZoom("out")} disabled={zoomDisabled} className="hidden pointer-fine:grid">
            <MinusIcon />
          </IconButton>
          <IconButton label="Zoom in" onClick={() => onZoom("in")} disabled={zoomDisabled} className="hidden pointer-fine:grid">
            <PlusIcon />
          </IconButton>
          <IconButton label={flipLabel} onClick={onFlip}>
            {portrait ? <FlipVerticalIcon /> : <FlipHorizontalIcon />}
          </IconButton>
        </div>
        {/* Its own line, so the buttons above never squeeze it. Long titles wrap to two lines. */}
        <h1 className="line-clamp-2 font-semibold leading-snug" title={title}>
          {title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {annotate}
          <button
            type="button"
            onClick={() => toggle("list")}
            aria-expanded={section === "list"}
            disabled={entries.length === 0}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700"
          >
            {entries.length === 0 ? "No annotations yet" : `${entries.length} ${entries.length === 1 ? "annotation" : "annotations"}`}
            {entries.length > 0 && <span aria-hidden> {section === "list" ? "▴" : "▾"}</span>}
          </button>
          <IconButton label="Hide boxes" pressed={!boxesVisible} onClick={onToggleBoxes}>
            {boxesVisible ? <BoxesIcon /> : <BoxesOffIcon />}
          </IconButton>
          <IconButton label="About this image" pressed={section === "about"} onClick={() => toggle("about")}>
            <InfoIcon />
          </IconButton>
        </div>
        {hint && <p className="text-sm text-zinc-500">{hint}</p>}
      </div>

      {section && (
        <div
          className={`min-h-0 overflow-y-auto overscroll-contain border-zinc-200 p-3 dark:border-zinc-800 ${
            portrait && edge === "end" ? "border-b" : "border-t"
          }`}
        >
          {section === "list" ? (
            <ul className="flex flex-col gap-1">
              {entries.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSection(null);
                      onPick(e.id);
                    }}
                    className="w-full truncate rounded-md px-2 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    {e.label}
                    {e.more > 0 && <span className="text-zinc-500"> +{e.more}</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            about
          )}
        </div>
      )}
    </div>
  );
}

function IconButton({
  label,
  pressed,
  disabled,
  className = "grid",
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  /** Display classes; `grid` unless the button is sometimes hidden. */
  className?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      title={label}
      className={`${className} size-9 shrink-0 place-items-center rounded-md border border-zinc-300 disabled:opacity-50 dark:border-zinc-700 ${
        pressed ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : ""
      }`}
    >
      {children}
    </button>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

const MinusIcon = () => (
  <Icon>
    <path d="M5 12h14" />
  </Icon>
);

const FlipVerticalIcon = () => (
  <Icon>
    <path d="M7 4v16M7 4 4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3" />
  </Icon>
);

const FlipHorizontalIcon = () => (
  <Icon>
    <path d="M4 7h16M4 7l3-3M4 7l3 3M20 17H4M20 17l-3-3M20 17l-3 3" />
  </Icon>
);

const BoxesIcon = () => (
  <Icon>
    <rect x="3" y="3" width="11" height="9" rx="1" />
    <rect x="10" y="12" width="11" height="9" rx="1" />
  </Icon>
);

const BoxesOffIcon = () => (
  <Icon>
    <rect x="3" y="3" width="11" height="9" rx="1" strokeDasharray="2 2" />
    <rect x="10" y="12" width="11" height="9" rx="1" strokeDasharray="2 2" />
    <path d="M3 21 21 3" />
  </Icon>
);

const InfoIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Icon>
);
