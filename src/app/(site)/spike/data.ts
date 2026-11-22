// Import the types for image size and region.
import type { ImageSize, Region } from "@/lib/regions";

// Hard-coded stand-ins for the Image and Annotation rows that later come from Postgres.

// The painting shown on the spike page.
export const image = {
  // Where the file is served from.
  src: "/spike/ambassadors.jpg",

  // The painting's title.
  title: "The Ambassadors",

  // The credit line shown under the image.
  credit: "Hans Holbein the Younger, 1533. National Gallery, London. Public domain, via Wikimedia Commons.",

  // The file's pixel size, checked against the ImageSize type.
  size: { width: 1920, height: 1892 } satisfies ImageSize,
};

// The shape of one hard-coded annotation.
export type SpikeAnnotation = { id: string; title: string; body: string; region: Region };

// The hard-coded annotations.
export const annotations: SpikeAnnotation[] = [
  {
    // Identifier for the skull annotation.
    id: "skull",

    // Heading shown for it.
    title: "The anamorphic skull",

    // Explanation shown for it.
    body: "This smear across the floor is a skull painted in extreme perspective. Viewed from the lower right, close to the picture's surface, it snaps into shape: a memento mori hidden in plain sight.",

    // Where it sits, as fractions of the image.
    region: { x: 0.21, y: 0.76, w: 0.51, h: 0.23 },
  },
  {
    // Identifier for the French ambassador.
    id: "dinteville",

    // Heading shown for it.
    title: "Jean de Dinteville",

    // Explanation shown for it.
    body: "The French ambassador to England, who commissioned the painting. His dagger is inscribed with his age, 29.",

    // Where it sits, as fractions of the image.
    region: { x: 0.16, y: 0.09, w: 0.13, h: 0.13 },
  },
  {
    // Identifier for the bishop.
    id: "de-selve",

    // Heading shown for it.
    title: "Georges de Selve",

    // Explanation shown for it.
    body: "Bishop of Lavaur and Dinteville's friend. The book under his elbow gives his age as 25.",

    // Where it sits, as fractions of the image.
    region: { x: 0.79, y: 0.1, w: 0.1, h: 0.13 },
  },
  {
    // Identifier for the globe.
    id: "globe",

    // Heading shown for it.
    title: "Celestial globe and instruments",

    // Explanation shown for it.
    body: "The upper shelf holds instruments for reading the heavens: the realm of learning and the sky.",

    // Where it sits, as fractions of the image.
    region: { x: 0.38, y: 0.17, w: 0.11, h: 0.13 },
  },
  {
    // Identifier for the lute.
    id: "lute",

    // Heading shown for it.
    title: "The lute with a broken string",

    // Explanation shown for it.
    body: "One of the lute's strings has snapped, often read as a symbol of discord, such as the religious divisions of the Reformation.",

    // Where it sits, as fractions of the image.
    region: { x: 0.515, y: 0.55, w: 0.245, h: 0.12 },
  },
  {
    // Identifier for the crucifix.
    id: "crucifix",

    // Heading shown for it.
    title: "The hidden crucifix",

    // Explanation shown for it.
    body: "In the top-left corner, half hidden behind the curtain, is a small silver crucifix. A tiny region like this tests that small annotations stay clickable.",

    // Where it sits, as fractions of the image.
    region: { x: 0, y: 0, w: 0.025, h: 0.08 },
  },
];
