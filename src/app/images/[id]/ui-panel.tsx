// Mark this file as client code, since it uses state and event handlers.
"use client";

// Import Next.js's client-side navigation link.
import Link from "next/link";

// Import the React state hook and the types used below.
import { useState, type CSSProperties, type ReactNode } from "react";

// Import the screen layout type.
import type { ScreenLayout } from "@/lib/use-screen-layout";

// Import the panel edge type.
import type { Edge } from "@/lib/view-geometry";

// One line in the list of annotations.
export type ListEntry = { id: string; label: string; more: number };

// What the panel is given.
type Props = {
  // The measured screen.
  layout: ScreenLayout;

  // Which edge the panel is on.
  edge: Edge;

  /** Hidden while a card is open (Rule 3.7). */
  hidden: boolean;

  // Called to move the panel to the other edge.
  onFlip: () => void;

  /**
   * Zoom one step around the centre: a fallback for mouse and trackpad users whose browser doesn't
   * pass on trackpad pinches (e.g. some on Linux under X11). Not shown on touch screens.
   */
  onZoom: (direction: "in" | "out") => void;

  /** Zoom is off in annotate mode (Rule 2.5). */
  zoomDisabled: boolean;

  // The image's title.
  title: string;

  /** The Annotate button, or what visitors who can't annotate see instead. */
  annotate: ReactNode;

  /** A hint for the current mode, such as how to draw a box. */
  hint: string | null;

  // The annotations to list.
  entries: ListEntry[];

  // Called with an entry's id when it's picked.
  onPick: (id: string) => void;

  // Whether the boxes are shown.
  boxesVisible: boolean;

  // Called to show or hide the boxes.
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
  // The measured screen.
  layout,
  // Which edge the panel is on.
  edge,
  // Whether the panel is hidden.
  hidden,
  // Called to move the panel to the other edge.
  onFlip,
  // Called to zoom one step.
  onZoom,
  // Whether zoom is off.
  zoomDisabled,
  // The image's title.
  title,
  // The Annotate button, or a substitute.
  annotate,
  // A hint for the current mode.
  hint,
  // The annotations to list.
  entries,
  // Called when a list entry is picked.
  onPick,
  // Whether the boxes are shown.
  boxesVisible,
  // Called to show or hide the boxes.
  onToggleBoxes,
  // The "about" content.
  about,
}: Props) {
  // Which section is open below the controls: the list, the "about" content, or none.
  const [section, setSection] = useState<"list" | "about" | null>(null);

  // Pull out the parts of the layout we use.
  const { area, screen, orientation } = layout;

  // Whether we're in portrait.
  const portrait = orientation === "portrait";

  // The panel's position and size on screen.
  const style: CSSProperties = portrait
    ? {
        // Start at the area's left edge.
        left: area.x,

        // Span the area's full width.
        width: area.w,

        // Take at most 60% of the area's height.
        maxHeight: area.h * 0.6,

        // Stick to the top or the bottom of the area.
        ...(edge === "start" ? { top: area.y } : { bottom: screen.h - (area.y + area.h) }),
      }
    : {
        // Start at the area's top edge.
        top: area.y,

        // Wide enough for the site name and buttons, and the controls, each on one row.
        width: Math.min(420, area.w * 0.45),

        // Take at most the area's full height.
        maxHeight: area.h,

        // Stick to the left or the right of the area.
        ...(edge === "start" ? { left: area.x } : { right: screen.w - (area.x + area.w) }),
      };

  // Open a section, or close it if it's already open.
  const toggle = (s: "list" | "about") => setSection(section === s ? null : s);

  // The label for the button that moves the panel to the other edge.
  const flipLabel = portrait
    ? // In portrait the panel moves between top and bottom.
      `Move this panel to the ${edge === "start" ? "bottom" : "top"}`
    : // In landscape it moves between left and right.
      `Move this panel to the ${edge === "start" ? "right" : "left"}`;

  // Return the panel's markup.
  return (
    // The panel, fixed to the screen above the image.
    <div
      // Mark it as a labelled region for screen readers.
      role="region"
      // Its name for screen readers.
      aria-label="Image controls"
      // Hide it while a card is open.
      hidden={hidden}
      // Its position and size.
      style={style}
      // Frosted background, rounded on the inside corners, with margins in landscape.
      className={`fixed z-20 flex touch-pan-y flex-col overflow-hidden bg-white/90 text-zinc-900 shadow-lg backdrop-blur dark:bg-zinc-900/90 dark:text-zinc-100 ${
        portrait ? (edge === "start" ? "rounded-b-xl" : "rounded-t-xl") : "rounded-xl"
      } ${portrait ? "" : edge === "start" ? "ml-3 mt-3" : "mr-3 mt-3"}`}
    >
      {/* The always-visible controls, placed last when the panel is at the bottom and a section is open. */}
      <div className={`flex shrink-0 flex-col gap-2 p-3 ${portrait && edge === "end" && section ? "order-last" : ""}`}>
        {/* The top row: site name and icon buttons. */}
        <div className="flex items-center gap-2">
          {/* The site name, linking to the home page. */}
          <Link href="/" className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-500 hover:underline">
            {/* The site name text. */}A Thousand Words
          </Link>
          {/* The zoom-out button, shown only with a mouse or trackpad. */}
          <IconButton
            // Its name.
            label="Zoom out"
            // Zoom out one step.
            onClick={() => onZoom("out")}
            // Off in annotate mode.
            disabled={zoomDisabled}
            // Hidden on touch screens.
            className="hidden pointer-fine:grid"
          >
            {/* The minus icon. */}
            <MinusIcon />
          </IconButton>
          {/* The zoom-in button, shown only with a mouse or trackpad. */}
          <IconButton
            // Its name.
            label="Zoom in"
            // Zoom in one step.
            onClick={() => onZoom("in")}
            // Off in annotate mode.
            disabled={zoomDisabled}
            // Hidden on touch screens.
            className="hidden pointer-fine:grid"
          >
            {/* The plus icon. */}
            <PlusIcon />
          </IconButton>
          {/* The button that moves the panel to the other edge. */}
          <IconButton label={flipLabel} onClick={onFlip}>
            {/* The arrows point up and down in portrait, left and right in landscape. */}
            {portrait ? <FlipVerticalIcon /> : <FlipHorizontalIcon />}
          </IconButton>
        </div>
        {/* Its own line, so the buttons above never squeeze it. Long titles wrap to two lines. */}
        <h1 className="line-clamp-2 font-semibold leading-snug" title={title}>
          {/* The title text. */}
          {title}
        </h1>
        {/* The row of main controls. */}
        <div className="flex flex-wrap items-center gap-2">
          {/* The Annotate button, or what visitors see instead. */}
          {annotate}
          {/* The button that opens the list of annotations. */}
          <button
            // It doesn't submit a form.
            type="button"
            // Open or close the list.
            onClick={() => toggle("list")}
            // Tell screen readers whether the list is open.
            aria-expanded={section === "list"}
            // Nothing to open if there are no annotations.
            disabled={entries.length === 0}
            // Bordered button.
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700"
          >
            {/* The button's text: how many annotations there are. */}
            {entries.length === 0
              ? "No annotations yet"
              : `${entries.length} ${entries.length === 1 ? "annotation" : "annotations"}`}
            {/* An arrow showing whether the list is open. */}
            {entries.length > 0 && <span aria-hidden> {section === "list" ? "▴" : "▾"}</span>}
          </button>
          {/* The button that hides or shows the boxes. */}
          <IconButton label="Hide boxes" pressed={!boxesVisible} onClick={onToggleBoxes}>
            {/* The icon shows whether the boxes are on or off. */}
            {boxesVisible ? <BoxesIcon /> : <BoxesOffIcon />}
          </IconButton>
          {/* The button that opens the "about" section. */}
          <IconButton label="About this image" pressed={section === "about"} onClick={() => toggle("about")}>
            {/* The info icon. */}
            <InfoIcon />
          </IconButton>
        </div>
        {/* The hint for the current mode, if there is one. */}
        {hint && <p className="text-sm text-zinc-500">{hint}</p>}
      </div>

      {/* The open section, if any. */}
      {section && (
        // A scrolling area with a border on the side facing the controls.
        <div
          // Scrollable, bordered on the side next to the controls.
          className={`min-h-0 touch-pan-y overflow-y-auto overscroll-contain border-zinc-200 p-3 dark:border-zinc-800 ${
            portrait && edge === "end" ? "border-b" : "border-t"
          }`}
        >
          {/* Show the list or the "about" content. */}
          {section === "list" ? (
            // The list of annotations.
            <ul className="flex flex-col gap-1">
              {/* One item per annotation. */}
              {entries.map((e) => (
                // A list item, keyed by id.
                <li key={e.id}>
                  {/* The button that picks this annotation. */}
                  <button
                    // It doesn't submit a form.
                    type="button"
                    // Close the list and pick this entry.
                    onClick={() => {
                      // Close the list.
                      setSection(null);

                      // Tell the parent which entry was picked.
                      onPick(e.id);
                    }}
                    // Full-width row that highlights on hover.
                    className="w-full truncate rounded-md px-2 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    {/* The entry's label. */}
                    {e.label}
                    {/* How many more annotations the box holds, if any. */}
                    {e.more > 0 && <span className="text-zinc-500"> +{e.more}</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            // The "about" content.
            about
          )}
        </div>
      )}
    </div>
  );
}

// A square icon button, used for the panel's small controls.
function IconButton({
  // The button's name for screen readers and tooltips.
  label,
  // Whether it's shown as pressed.
  pressed,
  // Whether it's disabled.
  disabled,
  // Display classes, `grid` by default.
  className = "grid",
  // Called when it's pressed.
  onClick,
  // The icon inside it.
  children,
}: {
  // The button's name.
  label: string;
  // Whether it's shown as pressed.
  pressed?: boolean;
  // Whether it's disabled.
  disabled?: boolean;
  /** Display classes; `grid` unless the button is sometimes hidden. */
  className?: string;
  // Called when it's pressed.
  onClick: () => void;
  // The icon inside it.
  children: ReactNode;
}) {
  // Return the button's markup.
  return (
    // The button.
    <button
      // It doesn't submit a form.
      type="button"
      // Run the handler when pressed.
      onClick={onClick}
      // Its name for screen readers.
      aria-label={label}
      // Whether it's pressed, for screen readers.
      aria-pressed={pressed}
      // Whether it's disabled.
      disabled={disabled}
      // The tooltip.
      title={label}
      // Square, bordered, and filled when pressed.
      className={`${className} size-9 shrink-0 place-items-center rounded-md border border-zinc-300 disabled:opacity-50 dark:border-zinc-700 ${
        pressed ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : ""
      }`}
    >
      {/* The icon. */}
      {children}
    </button>
  );
}

// The shared wrapper for the icons below.
function Icon({ children }: { children: ReactNode }) {
  // Return the SVG.
  return (
    // An 18-pixel line icon that takes the text colour.
    <svg
      // The drawing area.
      viewBox="0 0 24 24"
      // The width on screen.
      width="18"
      // The height on screen.
      height="18"
      // No fill.
      fill="none"
      // Draw lines in the text colour.
      stroke="currentColor"
      // Line thickness.
      strokeWidth="2"
      // Round line ends.
      strokeLinecap="round"
      // Round line joins.
      strokeLinejoin="round"
      // Hide it from screen readers.
      aria-hidden
    >
      {/* The icon's shapes. */}
      {children}
    </svg>
  );
}

// A plus sign.
const PlusIcon = () => (
  // Wrap the shape in the shared icon.
  <Icon>
    {/* A vertical and a horizontal line. */}
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

// A minus sign.
const MinusIcon = () => (
  // Wrap the shape in the shared icon.
  <Icon>
    {/* A horizontal line. */}
    <path d="M5 12h14" />
  </Icon>
);

// Arrows pointing up and down.
const FlipVerticalIcon = () => (
  // Wrap the shapes in the shared icon.
  <Icon>
    {/* Two vertical arrows pointing opposite ways. */}
    <path d="M7 4v16M7 4 4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3" />
  </Icon>
);

// Arrows pointing left and right.
const FlipHorizontalIcon = () => (
  // Wrap the shapes in the shared icon.
  <Icon>
    {/* Two horizontal arrows pointing opposite ways. */}
    <path d="M4 7h16M4 7l3-3M4 7l3 3M20 17H4M20 17l-3-3M20 17l-3 3" />
  </Icon>
);

// Two overlapping boxes.
const BoxesIcon = () => (
  // Wrap the shapes in the shared icon.
  <Icon>
    {/* The upper-left box. */}
    <rect x="3" y="3" width="11" height="9" rx="1" />
    {/* The lower-right box. */}
    <rect x="10" y="12" width="11" height="9" rx="1" />
  </Icon>
);

// Two dashed boxes crossed out.
const BoxesOffIcon = () => (
  // Wrap the shapes in the shared icon.
  <Icon>
    {/* The upper-left box, dashed. */}
    <rect x="3" y="3" width="11" height="9" rx="1" strokeDasharray="2 2" />
    {/* The lower-right box, dashed. */}
    <rect x="10" y="12" width="11" height="9" rx="1" strokeDasharray="2 2" />
    {/* The diagonal strike-through. */}
    <path d="M3 21 21 3" />
  </Icon>
);

// A circled "i".
const InfoIcon = () => (
  // Wrap the shapes in the shared icon.
  <Icon>
    {/* The circle. */}
    <circle cx="12" cy="12" r="9" />
    {/* The stem and the dot of the "i". */}
    <path d="M12 11v5M12 8h.01" />
  </Icon>
);
