// Mark this file as client code, since it uses state and browser APIs.
"use client";

// Import Next.js's client-side navigation link.
import Link from "next/link";

// Import the React hooks used below.
import { useCallback, useEffect, useRef, useState } from "react";

// What a row needs to know about each image.
export type RowImage = { id: string; title: string; src: string; width: number; height: number };

// Cards share a height and keep each painting's shape, within limits: very tall or very wide
// paintings are cropped to these aspect ratios so one image can't dominate a row.
const MIN_RATIO = 0.6;

// The widest a card may be, as width divided by height.
const MAX_RATIO = 2;

/**
 * One horizontally scrolling row of images on the home page. Touch and trackpad users swipe;
 * on wider screens, arrow buttons page through the row.
 */
export function ImageRow({ heading, blurb, images }: { heading: string; blurb?: string | null; images: RowImage[] }) {
  // A handle on the scrolling list.
  const scroller = useRef<HTMLUListElement>(null);

  // Whether there's more to scroll to on the left.
  const [canBack, setCanBack] = useState(false);

  // Whether there's more to scroll to on the right.
  const [canForward, setCanForward] = useState(false);

  // Work out which arrows should show.
  const update = useCallback(() => {
    // The list element.
    const el = scroller.current;

    // Do nothing until it exists.
    if (!el) return;

    // Back is possible if we've scrolled right at all.
    setCanBack(el.scrollLeft > 1);

    // Forward is possible if the right edge isn't yet visible.
    setCanForward(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  // After rendering, set the arrows and keep them current as the row's size changes.
  useEffect(() => {
    // Set the arrows now.
    update();

    // The list element.
    const el = scroller.current;

    // Do nothing if it doesn't exist.
    if (!el) return;

    // Watch for size changes.
    const observer = new ResizeObserver(update);

    // Start watching the list.
    observer.observe(el);

    // Stop watching when the component goes away.
    return () => observer.disconnect();
  }, [update]);

  // Scroll the row by most of a screen width, forwards (1) or back (-1).
  function page(direction: 1 | -1) {
    // The list element.
    const el = scroller.current;

    // Do nothing if it doesn't exist.
    if (!el) return;

    // Leave part of a card in view, so it's clear where the row continues from.
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" });
  }

  // Return the row's markup.
  return (
    // The row's section, labelled for screen readers.
    <section className="mt-10" aria-label={heading}>
      {/* The heading block, centred and limited in width. */}
      <div className="mx-auto w-full max-w-6xl px-4">
        {/* The row's heading. */}
        <h2 className="text-lg font-semibold">{heading}</h2>
        {/* The row's short description, if it has one. */}
        {blurb && <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{blurb}</p>}
      </div>

      {/* The scroller and its arrows, which show on hover. */}
      <div className="group/row relative mx-auto mt-3 w-full max-w-6xl [--row-h:10rem] sm:[--row-h:13rem]">
        {/* The scrolling list of images. */}
        <ul
          // Keep a handle on it.
          ref={scroller}
          // Update the arrows whenever it scrolls.
          onScroll={update}
          // Lay out in a row, snap to cards, and hide the scrollbar.
          className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* One card per image. */}
          {images.map((image) => {
            // Work out the card's shape, kept within the limits above.
            const ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, image.width / image.height));

            // Return the card.
            return (
              // A list item that snaps to the start of the row.
              <li key={image.id} className="shrink-0 snap-start">
                {/* A link to the image's page. */}
                <Link href={`/images/${image.id}`} className="group block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    // The picture's address.
                    src={image.src}
                    // Its description for screen readers.
                    alt={image.title}
                    // Its natural width, so the browser can reserve space.
                    width={image.width}
                    // Its natural height, so the browser can reserve space.
                    height={image.height}
                    // Load it only when it's near the screen.
                    loading="lazy"
                    // Crop to the card's shape.
                    style={{ aspectRatio: ratio }}
                    // Fixed height, rounded corners, and a hover fade.
                    className="h-(--row-h) w-auto rounded-md bg-zinc-100 object-cover transition-opacity group-hover:opacity-90 dark:bg-zinc-900"
                  />
                  {/* The title under the picture. */}
                  <span
                    // Single line, cut off with an ellipsis, underlined on hover.
                    className="mt-2 block truncate text-sm group-hover:underline"
                    // No wider than the picture.
                    style={{ maxWidth: `calc(${ratio} * var(--row-h))` }}
                  >
                    {/* The title text. */}
                    {image.title}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* The scroll-back arrow. */}
        <ArrowButton direction={-1} visible={canBack} onClick={() => page(-1)} />
        {/* The scroll-forward arrow. */}
        <ArrowButton direction={1} visible={canForward} onClick={() => page(1)} />
      </div>
    </section>
  );
}

// One arrow button, shown on wider screens when there's more to scroll to.
function ArrowButton({ direction, visible, onClick }: { direction: 1 | -1; visible: boolean; onClick: () => void }) {
  // Return the button's markup.
  return (
    // The button.
    <button
      // It doesn't submit a form.
      type="button"
      // Run the paging function when pressed.
      onClick={onClick}
      // Its name for screen readers.
      aria-label={direction === 1 ? "Scroll right" : "Scroll left"}
      // Keep it out of the tab order when hidden.
      tabIndex={visible ? 0 : -1}
      // Position it at the row's side, and fade it in on hover or focus when visible.
      className={`absolute top-[calc(var(--row-h)/2)] hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white/90 text-zinc-800 shadow-sm backdrop-blur transition-opacity hover:bg-white sm:flex dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-100 dark:hover:bg-zinc-900 ${
        direction === 1 ? "right-1" : "left-1"
      } ${visible ? "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100" : "pointer-events-none opacity-0"}`}
    >
      {/* The arrow icon. */}
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
        {/* The chevron, pointing right or left. */}
        <path d={direction === 1 ? "M7 4l6 6-6 6" : "M13 4l-6 6 6 6"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
