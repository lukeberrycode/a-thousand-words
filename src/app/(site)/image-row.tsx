"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

export type RowImage = { id: string; title: string; src: string; width: number; height: number };

// Cards share a height and keep each painting's shape, within limits: very tall or very wide
// paintings are cropped to these aspect ratios so one image can't dominate a row.
const MIN_RATIO = 0.6;
const MAX_RATIO = 2;

/**
 * One horizontally scrolling row of images on the home page. Touch and trackpad users swipe;
 * on wider screens, arrow buttons page through the row.
 */
export function ImageRow({ heading, blurb, images }: { heading: string; blurb?: string | null; images: RowImage[] }) {
  const scroller = useRef<HTMLUListElement>(null);
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);

  const update = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setCanBack(el.scrollLeft > 1);
    setCanForward(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    update();
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [update]);

  function page(direction: 1 | -1) {
    const el = scroller.current;
    if (!el) return;
    // Leave part of a card in view, so it's clear where the row continues from.
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" });
  }

  return (
    <section className="mt-10" aria-label={heading}>
      <div className="mx-auto w-full max-w-6xl px-4">
        <h2 className="text-lg font-semibold">{heading}</h2>
        {blurb && <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{blurb}</p>}
      </div>

      <div className="group/row relative mx-auto mt-3 w-full max-w-6xl [--row-h:10rem] sm:[--row-h:13rem]">
        <ul
          ref={scroller}
          onScroll={update}
          className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {images.map((image) => {
            const ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, image.width / image.height));
            return (
              <li key={image.id} className="shrink-0 snap-start">
                <Link href={`/images/${image.id}`} className="group block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.src}
                    alt={image.title}
                    width={image.width}
                    height={image.height}
                    loading="lazy"
                    style={{ aspectRatio: ratio }}
                    className="h-(--row-h) w-auto rounded-md bg-zinc-100 object-cover transition-opacity group-hover:opacity-90 dark:bg-zinc-900"
                  />
                  <span
                    className="mt-2 block truncate text-sm group-hover:underline"
                    style={{ maxWidth: `calc(${ratio} * var(--row-h))` }}
                  >
                    {image.title}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <ArrowButton direction={-1} visible={canBack} onClick={() => page(-1)} />
        <ArrowButton direction={1} visible={canForward} onClick={() => page(1)} />
      </div>
    </section>
  );
}

function ArrowButton({ direction, visible, onClick }: { direction: 1 | -1; visible: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === 1 ? "Scroll right" : "Scroll left"}
      tabIndex={visible ? 0 : -1}
      className={`absolute top-[calc(var(--row-h)/2)] hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white/90 text-zinc-800 shadow-sm backdrop-blur transition-opacity hover:bg-white sm:flex dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-100 dark:hover:bg-zinc-900 ${
        direction === 1 ? "right-1" : "left-1"
      } ${visible ? "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100" : "pointer-events-none opacity-0"}`}
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
        <path d={direction === 1 ? "M7 4l6 6-6 6" : "M13 4l-6 6 6 6"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
