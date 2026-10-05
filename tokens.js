// Single source of truth: size, colours, font, copy and timing. Pure data + pure maths.
export const W = 1920;
export const H = 1080;
export const FPS = 30;

export const BG = '#0b0b0f';
export const INK = '#f4f2ec';
export const ACCENT = '#c8ff3d';

export const FONT_FAMILY = 'Space Grotesk';
export const FONT_WEIGHT = 700;
export const MAX_SIZE = 168;      // px, largest text size
export const MARGIN = 144;        // px, safe margin on every side
export const LINE_HEIGHT = 1.08;  // for wrapped lines

// accent = index of the one word drawn in the accent colour
export const LINES = [
  { text: 'Every frame is code', accent: 3 },
  { text: 'Nothing is filmed',   accent: 0 },
  { text: 'Same input',          accent: 1 },
  { text: 'Same pixels',         accent: 1 },
  { text: 'Render it free',      accent: 2 },
];

// Card motion
export const FADE_IN = 0.5;   // s, fade + rise
export const RISE = 40;       // px
export const FADE_OUT = 0.25; // s

// Pacing around the cards (keeps total inside 15-20 s)
export const LEAD_IN = 1.0;
export const GAP = 0.8;
export const TAIL = 1.5;

export const holdFor = (words) => Math.max(1.2, 0.35 + words / 3.2);

// Build the timeline once from constants.
export function buildTimeline(lines = LINES) {
  let t = LEAD_IN;
  const cards = lines.map((l, i) => {
    const words = l.text.trim().split(/\s+/).length;
    const hold = holdFor(words);
    const card = { ...l, i, words, start: t, hold, end: t + FADE_IN + hold + FADE_OUT };
    t = card.end + GAP;
    return card;
  });
  const duration = cards[cards.length - 1].end + TAIL;
  return { cards, duration };
}

export const TIMELINE = buildTimeline();
export const DURATION = TIMELINE.duration;
