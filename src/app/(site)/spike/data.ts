import type { ImageSize, Region } from "@/lib/regions";

// Hard-coded stand-ins for the Image and Annotation rows that later come from Postgres.

export const image = {
  src: "/spike/ambassadors.jpg",
  title: "The Ambassadors",
  credit: "Hans Holbein the Younger, 1533. National Gallery, London. Public domain, via Wikimedia Commons.",
  size: { width: 1920, height: 1892 } satisfies ImageSize,
};

export type SpikeAnnotation = { id: string; title: string; body: string; region: Region };

export const annotations: SpikeAnnotation[] = [
  {
    id: "skull",
    title: "The anamorphic skull",
    body: "This smear across the floor is a skull painted in extreme perspective. Viewed from the lower right, close to the picture's surface, it snaps into shape: a memento mori hidden in plain sight.",
    region: { x: 0.21, y: 0.76, w: 0.51, h: 0.23 },
  },
  {
    id: "dinteville",
    title: "Jean de Dinteville",
    body: "The French ambassador to England, who commissioned the painting. His dagger is inscribed with his age, 29.",
    region: { x: 0.16, y: 0.09, w: 0.13, h: 0.13 },
  },
  {
    id: "de-selve",
    title: "Georges de Selve",
    body: "Bishop of Lavaur and Dinteville's friend. The book under his elbow gives his age as 25.",
    region: { x: 0.79, y: 0.1, w: 0.1, h: 0.13 },
  },
  {
    id: "globe",
    title: "Celestial globe and instruments",
    body: "The upper shelf holds instruments for reading the heavens: the realm of learning and the sky.",
    region: { x: 0.38, y: 0.17, w: 0.11, h: 0.13 },
  },
  {
    id: "lute",
    title: "The lute with a broken string",
    body: "One of the lute's strings has snapped, often read as a symbol of discord, such as the religious divisions of the Reformation.",
    region: { x: 0.515, y: 0.55, w: 0.245, h: 0.12 },
  },
  {
    id: "crucifix",
    title: "The hidden crucifix",
    body: "In the top-left corner, half hidden behind the curtain, is a small silver crucifix. A tiny region like this tests that small annotations stay clickable.",
    region: { x: 0, y: 0, w: 0.025, h: 0.08 },
  },
];
