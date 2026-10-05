// Single source of truth: size, palette, font, the story script and its timing.
// Everything here is pure data + pure maths, so the video is fully deterministic.
export const W = 1920;
export const H = 1080;
export const FPS = 30;

export const BG = '#050507';
export const INK = '#ece8df';
export const ACCENT = '#e0262b';     // blood red
export const GLOW = '#9fc4ff';       // cold phone light
export const DOOR_TONE = '#e8b9a8';  // the voice outside the door

export const FONT_FAMILY = 'Noto Sans Devanagari';
export const FONT_WEIGHT = 700;
export const MARGIN = 144;

export const FADE_IN = 0.45;
export const FADE_OUT = 0.3;
export const RISE = 24;

export const LEAD_IN = 1.0;
export const GAP_DEFAULT = 0.35;
export const END_FADE_DUR = 2.0;

// style: narr | rohan | phone | door | whisper | sfx | final
// mode : which visual scene starts with this cue (carries forward)
// tension: 0..1 target dread level (drives heartbeat, vignette, flicker, shake)
// events: seconds after cue start where a knock lands
export const SCRIPT = [
  { style: 'narr', text: 'रात के ठीक २:१३ बजे', mode: 'clock', tension: 0.05, dur: 3.4 },
  { style: 'narr', text: 'रोहन के फोन की घंटी बजी।', mode: 'ring', tension: 0.2, pause: 0.5 },
  { style: 'narr', text: 'स्क्रीन पर उसकी माँ का नाम था।', tension: 0.25 },
  { style: 'narr', text: 'रोहन ने फोन उठाया—', mode: 'call', tension: 0.3, pause: 0.5 },
  { style: 'rohan', text: '“हैलो माँ?”', tension: 0.3 },
  { style: 'narr', text: 'दूसरी तरफ़ कुछ सेकंड तक खामोशी रही।', wave: 0, tension: 0.3, pause: 0.5 },
  { style: 'narr', text: 'फिर धीमी आवाज़ आई—', tension: 0.4, pause: 0.6 },
  { style: 'phone', text: '“बेटा… दरवाज़ा मत खोलना।”', tension: 0.55, dur: 3.8 },
  { style: 'narr', text: 'रोहन डर गया।', tension: 0.65 },
  { style: 'rohan', text: '“लेकिन माँ… आप कहाँ हो?”', tension: 0.65 },
  { style: 'narr', text: 'आवाज़ फिर आई—', tension: 0.6 },
  { style: 'phone', text: '“मैं अस्पताल में हूँ… तुम्हारे पापा के साथ।”', tension: 0.7, dur: 4.2 },
  { style: 'narr', text: 'रोहन का दिल तेजी से धड़कने लगा।', tension: 0.9, pause: 0.5 },
  { style: 'narr', text: 'तभी…', tension: 0.9, pause: 0.8, dur: 1.8 },
  { style: 'sfx', text: 'ठक… ठक… ठक…', mode: 'door', tension: 1, pause: 0.4, dur: 3.4, events: [0.5, 1.4, 2.3] },
  { style: 'narr', text: 'मुख्य दरवाज़े पर किसी ने दस्तक दी।', tension: 0.9 },
  { style: 'door', text: '“बेटा, दरवाज़ा खोल… मैं घर आ गई।”', tension: 0.9, dur: 3.8 },
  { style: 'narr', text: 'रोहन ने फोन को कान से हटाया।', tension: 0.85 },
  { style: 'narr', text: 'फोन पर अभी भी माँ की आवाज़ आ रही थी—', tension: 0.9 },
  { style: 'phone', text: '“बेटा… जो बाहर है, वो मैं नहीं हूँ।”', tension: 1, dur: 4.0 },
  { id: 'stop', style: 'narr', text: 'दस्तक अचानक बंद हो गई।', tension: 0.3, pause: 0.7, dur: 3.0 },
  { style: 'narr', text: 'रोहन ने राहत की साँस ली।', tension: 0.15, pause: 0.7, dur: 3.0 },
  { style: 'narr', text: 'लेकिन तभी उसके पीछे से फुसफुसाहट आई—', mode: 'behind', tension: 0.8, pause: 0.9 },
  { style: 'whisper', text: '“तो फिर फोन पर कौन है?”', tension: 1, glitch: 1.0, pause: 0.5, dur: 4.0 },
  { style: 'narr', text: 'रोहन धीरे-धीरे पीछे मुड़ा…', mode: 'turn', tension: 0.9, pause: 0.6, dur: 3.8 },
  { style: 'narr', text: 'और फोन की स्क्रीन पर देखा—', mode: 'screen', tension: 0.8, pause: 0.6 },
  { id: 'final', style: 'final', text: 'कॉल अभी शुरू ही नहीं हुई थी।', tension: 1, glitch: 1.3, pause: 1.0, dur: 5.0 },
];

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const glyphs = (s) => Array.from(s.replace(/[“”"]/g, '')).length;

function build(script) {
  let t = LEAD_IN;
  let tension = 0.05;
  const cues = script.map((c, i) => {
    const dur = c.dur ?? clamp(1.1 + glyphs(c.text) * 0.06, 1.8, 4.2);
    const start = t + (i === 0 ? 0 : (c.pause ?? GAP_DEFAULT));
    t = start + dur;
    const tFrom = tension;
    tension = c.tension ?? tension;
    return { ...c, i, start, end: start + dur, dur, tFrom, tTo: tension };
  });
  const lastEnd = cues[cues.length - 1].end;
  const duration = lastEnd + 1.2;

  const modes = [];
  cues.forEach((c) => {
    if (c.mode && (!modes.length || modes[modes.length - 1].mode !== c.mode)) {
      modes.push({ mode: c.mode, start: modes.length ? c.start : 0 });
    }
  });
  modes.forEach((m, k) => { m.end = k + 1 < modes.length ? modes[k + 1].start : duration; });

  return { cues, modes, duration };
}

const built = build(SCRIPT);
export const STORY = built.cues;
export const MODES = built.modes;
export const DURATION = built.duration;
export const END_FADE_START = DURATION - END_FADE_DUR;
export const KNOCKS = STORY.flatMap((c) => (c.events || []).map((e) => c.start + e));
export const CUE_START = Object.fromEntries(STORY.filter((c) => c.id).map((c) => [c.id, c.start]));

export function tensionAt(t) {
  let c = null;
  for (const x of STORY) { if (x.start <= t) c = x; else break; }
  if (!c) return STORY[0].tFrom;
  return lerp(c.tFrom, c.tTo, smooth((t - c.start) / 1.0));
}

// One representative time per scene, plus the final reveal, for the stills check.
export const STILLS = [
  ...MODES.map((m) => ({ name: m.mode, t: m.start + 0.6 * (m.end - m.start) })),
  { name: 'final', t: CUE_START.final + 2.2 },
];
