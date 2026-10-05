// All drawing lives here. renderFrame(t) is a pure function of t + constants:
// no Math.random, Date.now, performance.now, timers or rAF. "Randomness" is a seeded hash.
import * as T from './tokens.js';

const { W, H, FPS } = T;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
const hash = (n) => {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
};
const rnd = (a, b = 0, c = 0) =>
  hash((Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)) | 0);

const font = (px) => `${T.FONT_WEIGHT} ${px}px "${T.FONT_FAMILY}", sans-serif`;

const STYLE = {
  narr:    { base: 76,  y: 850, color: T.INK, reveal: true },
  rohan:   { base: 88,  y: 850, color: T.INK, reveal: true, label: 'रोहन', labelColor: '#8d897f' },
  phone:   { base: 90,  y: 850, color: '#cfe1ff', reveal: true, label: 'माँ · फोन पर', labelColor: T.GLOW },
  door:    { base: 90,  y: 850, color: T.DOOR_TONE, reveal: true, label: 'दरवाज़े के बाहर से', labelColor: T.ACCENT },
  whisper: { base: 104, y: 560, color: T.ACCENT, reveal: false },
  sfx:     { base: 150, y: 540, color: T.INK, reveal: false },
  final:   { base: 112, y: 860, color: T.ACCENT, reveal: false },
};

export function createRenderer({ ctx, makeCanvas }) {
  let ready = false;
  let layouts = [];
  let grain = null;
  let heart = null;

  // ---------- small helpers ----------
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  const frameOf = (t) => Math.floor(t * FPS + 1e-6);

  function activeCue(t) {
    for (const c of T.STORY) if (t >= c.start && t < c.end) return c;
    return null;
  }

  function knockEnergy(t) {
    let e = 0;
    for (const k of T.KNOCKS) { const l = t - k; if (l >= 0 && l < 0.8) e += Math.exp(-l * 10); }
    return Math.min(1.4, e);
  }

  function glitchAt(t) {
    let g = 0;
    const f = frameOf(t);
    for (const c of T.STORY) {
      if (c.glitch) {
        const l = t - c.start;
        if (l >= 0 && l < c.glitch) g = Math.max(g, Math.pow(1 - l / c.glitch, 1.4) * (0.55 + 0.45 * rnd(f, 3)));
      }
      if ((c.style === 'whisper' || c.style === 'final') && t >= c.start && t < c.end && rnd(Math.floor(t * 20), 4) > 0.88) {
        g = Math.max(g, 0.18);
      }
    }
    return g;
  }

  function voiceAmp(t) {
    const c = activeCue(t);
    if (!c) return 0.05;
    if (c.wave === 0) return 0;
    if (c.style === 'phone') {
      const l = t - c.start;
      return clamp(l / 0.2) * (1 - clamp((l - (c.dur - 0.3)) / 0.3));
    }
    return 0.05;
  }

  function flicker(t, tension) {
    const s = Math.floor(t * 14);
    if (tension > 0.55 && rnd(s, 7) > 0.94) return 0.25 + 0.35 * rnd(s, 8);
    return 1 - 0.08 * tension * rnd(Math.floor(t * 30), 9);
  }

  // ---------- heartbeat (continuous phase integrated from tension) ----------
  function buildHeart() {
    const N = Math.ceil(T.DURATION * 100) + 3;
    const a = new Float64Array(N);
    for (let i = 1; i < N; i++) {
      const ten = T.tensionAt((i - 1) / 100);
      a[i] = a[i - 1] + ((54 + 90 * ten) / 60) * 0.01;
    }
    return a;
  }
  function heartPulse(t) {
    const x = clamp(t * 100, 0, heart.length - 2);
    const i = Math.floor(x);
    const ph = lerp(heart[i], heart[i + 1], x - i);
    const f = ph % 1;
    return clamp(Math.exp(-Math.pow(f / 0.045, 2)) + 0.55 * Math.exp(-Math.pow((f - 0.2) / 0.055, 2)), 0, 1);
  }

  // ---------- text layout (computed once, after fonts are loaded) ----------
  function wrapLines(text, px, maxW) {
    ctx.font = font(px);
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (cur && ctx.measureText(test).width > maxW) { lines.push(cur); cur = w; } else cur = test;
    }
    lines.push(cur);
    return lines;
  }

  function layoutCue(c) {
    const st = STYLE[c.style];
    const maxW = W - 2 * T.MARGIN;
    let px = st.base;
    let lines;
    for (;;) {
      lines = wrapLines(c.text, px, maxW);
      ctx.font = font(px);
      const wide = Math.max(...lines.map((l) => ctx.measureText(l).width));
      if ((lines.length <= 2 && wide <= maxW) || px <= 36) break;
      px -= 2;
    }
    ctx.font = font(px);
    const space = ctx.measureText(' ').width;
    const lh = px * 1.38;
    let k = 0;
    const outLines = lines.map((l) => {
      const ws = l.split(' ');
      const widths = ws.map((w) => ctx.measureText(w).width);
      const total = widths.reduce((a, b) => a + b, 0) + space * (ws.length - 1);
      let x = -total / 2;
      const words = ws.map((w, j) => { const o = { w, x, k: k++ }; x += widths[j] + space; return o; });
      return { words, total };
    });
    const blockH = lh * outLines.length;
    const cy = Math.min(st.y, H - T.MARGIN - blockH / 2); // keeps text inside the 144 px margin
    return { px, lh, lines: outLines, blockH, cy };
  }

  function makeGrain() {
    const c = makeCanvas(256, 256);
    const g = c.getContext('2d');
    const img = g.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) {
      const v = Math.floor(rnd(i, 99) * 255);
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  function prepare() {
    layouts = T.STORY.map(layoutCue);
    grain = makeGrain();
    heart = buildHeart();
    ready = true;
  }

  // ---------- captions ----------
  function paintWords(c, L, t, o) {
    const st = STYLE[c.style];
    const local = t - c.start;
    const f = frameOf(t);
    const out = 1 - clamp((local - (c.dur - T.FADE_OUT)) / T.FADE_OUT);
    ctx.font = font(L.px);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const top = L.cy - L.blockH / 2;
    L.lines.forEach((ln, i) => {
      for (const w of ln.words) {
        const delay = st.reveal ? w.k * 0.09 : 0;
        const wa = easeOut((local - delay) / (st.reveal ? 0.35 : T.FADE_IN));
        if (wa <= 0) continue;
        let dx = o.ox;
        let dy = o.oy + (1 - wa) * T.RISE;
        if (o.jit) { dx += (rnd(f, w.k, 1) - 0.5) * o.jit * 2; dy += (rnd(f, w.k, 2) - 0.5) * o.jit; }
        ctx.globalAlpha = wa * out * o.alpha;
        ctx.fillText(w.w, W / 2 + w.x + dx, top + i * L.lh + L.px * 1.05 + dy);
      }
    });
    ctx.globalAlpha = 1;
  }

  function drawCue(c, L, t) {
    const local = t - c.start;
    if (local < 0 || local > c.dur) return;
    const st = STYLE[c.style];
    const f = frameOf(t);
    const g = glitchAt(t);
    const out = 1 - clamp((local - (c.dur - T.FADE_OUT)) / T.FADE_OUT);
    const top = L.cy - L.blockH / 2;

    ctx.save();
    if (c.style === 'sfx') {
      const pop = Math.min(1, knockEnergy(t));
      ctx.translate(W / 2, L.cy); ctx.scale(1 + 0.07 * pop, 1 + 0.07 * pop); ctx.translate(-W / 2, -L.cy);
    }
    if (st.label) {
      ctx.font = font(34);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = st.labelColor;
      ctx.globalAlpha = easeOut(local / 0.4) * out;
      ctx.fillText(st.label, W / 2, top - 6);
      ctx.globalAlpha = 1;
    }
    const split = (c.style === 'whisper' || c.style === 'final') && g > 0.02;
    if (split) {
      const d = g * 16;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgb(255,0,40)'; paintWords(c, L, t, { ox: -d, oy: 0, alpha: 0.7, jit: 0 });
      ctx.fillStyle = 'rgb(0,200,255)'; paintWords(c, L, t, { ox: d, oy: 0, alpha: 0.6, jit: 0 });
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 22;
    ctx.fillStyle = st.color;
    paintWords(c, L, t, { ox: 0, oy: 0, alpha: 1, jit: c.style === 'whisper' ? 2 + g * 10 : g * 8 });
    ctx.shadowBlur = 0;
    if (g > 0.1) {
      for (let s = 0; s < 3; s++) {
        const sy = top + rnd(f, s, 5) * L.blockH;
        const sh = 8 + rnd(f, s, 6) * 30;
        ctx.save();
        ctx.beginPath(); ctx.rect(0, sy, W, sh); ctx.clip();
        ctx.fillStyle = st.color;
        paintWords(c, L, t, { ox: (rnd(f, s, 7) - 0.5) * g * 120, oy: 0, alpha: 1, jit: 0 });
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // ---------- scene pieces ----------
  function drawRoom(t, tension, gx, gy, rgb, ga, gr = 900) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d0e15');
    g.addColorStop(1, '#040406');
    ctx.fillStyle = g;
    ctx.fillRect(-120, -120, W + 240, H + 240);
    const fl = flicker(t, tension);
    const rg = ctx.createRadialGradient(gx, gy, 10, gx, gy, gr);
    rg.addColorStop(0, `rgba(${rgb},${(ga * fl).toFixed(4)})`);
    rg.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = rg;
    ctx.fillRect(-120, -120, W + 240, H + 240);
  }

  function drawDust(t) {
    ctx.save();
    for (let i = 0; i < 70; i++) {
      const x = rnd(i, 1) * W + Math.sin(t * 0.3 + i) * 20;
      const y = (((rnd(i, 2) * H - t * (8 + rnd(i, 3) * 14)) % H) + H) % H;
      const r = 0.8 + rnd(i, 4) * 1.8;
      const a = (0.05 + 0.12 * rnd(i, 5)) * (0.6 + 0.4 * Math.sin(t + i));
      ctx.fillStyle = `rgba(200,210,230,${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawWave(cx, cy, width, amp, t, color) {
    const N = 96;
    const bw = width / N;
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;
    if (amp <= 0.001) {
      ctx.globalAlpha *= 0.55;
      ctx.fillRect(cx - width / 2, cy - 1.5, width, 3);
    } else {
      for (let i = 0; i < N; i++) {
        const env = Math.sin(Math.PI * i / (N - 1));
        const v = Math.sin(t * 9 + i * 0.7) * 0.5 + Math.sin(t * 13.7 + i * 1.9) * 0.35 + Math.sin(t * 5.3 + i * 0.23) * 0.4;
        const h = (Math.abs(v) * 0.9 + 0.08 * rnd(frameOf(t), i)) * amp * env + 2;
        ctx.fillRect(cx - width / 2 + i * bw, cy - h, bw * 0.6, h * 2);
      }
    }
    ctx.restore();
  }

  function handset(x, y, r, rot, col) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.strokeStyle = col;
    ctx.lineCap = 'round';
    const a1 = Math.PI * 1.18;
    const a2 = Math.PI * 1.82;
    const rad = r * 0.62;
    const cyy = r * 0.35;
    ctx.lineWidth = r * 0.3;
    ctx.beginPath(); ctx.arc(0, cyy, rad, a1, a2); ctx.stroke();
    ctx.lineWidth = r * 0.46;
    for (const a of [a1, a2]) {
      const px = Math.cos(a) * rad;
      const py = Math.sin(a) * rad + cyy;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + r * 0.2); ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.restore();
  }

  // Phone in its own centred coordinate space: body 360x740, screen 332x712.
  function drawPhone(cx, cy, s, rot, glow, screenFn) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(s, s);
    ctx.shadowColor = `rgba(159,196,255,${(0.55 * glow).toFixed(3)})`;
    ctx.shadowBlur = 120;
    ctx.fillStyle = '#101015';
    rr(-180, -370, 360, 740, 56); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#2b2c36'; ctx.lineWidth = 3; ctx.stroke();
    rr(-166, -356, 332, 712, 44); ctx.clip();
    screenFn();
    ctx.restore();
  }

  function centered(text, y, px, color) {
    ctx.font = font(px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.fillText(text, 0, y);
  }

  function screenBg() {
    const g = ctx.createLinearGradient(0, -356, 0, 356);
    g.addColorStop(0, '#16213a');
    g.addColorStop(1, '#05070c');
    ctx.fillStyle = g;
    ctx.fillRect(-170, -360, 340, 720);
  }

  function avatar(y, rpx) {
    ctx.fillStyle = '#223455';
    ctx.beginPath(); ctx.arc(0, y, rpx, 0, Math.PI * 2); ctx.fill();
    centered('म', y + rpx * 0.34, rpx * 1.05, '#dbe7ff');
  }

  function screenRinging(t) {
    screenBg();
    for (let k = 0; k < 3; k++) {
      const ph = ((t / 1.2) + k / 3) % 1;
      ctx.strokeStyle = `rgba(159,196,255,${(0.3 * (1 - ph)).toFixed(3)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, -130, 70 + ph * 130, 0, Math.PI * 2); ctx.stroke();
    }
    avatar(-130, 70);
    centered('माँ', 24, 76, T.INK);
    centered('कॉल आ रही है…', 78, 30, '#8fa7cf');
    ctx.fillStyle = '#e0453f'; ctx.beginPath(); ctx.arc(-95, 262, 46, 0, Math.PI * 2); ctx.fill();
    handset(-95, 262, 28, Math.PI * 0.75, '#fff');
    ctx.fillStyle = '#3ddc84'; ctx.beginPath(); ctx.arc(95, 262, 46, 0, Math.PI * 2); ctx.fill();
    handset(95, 262, 28, -0.5, '#fff');
  }

  function screenIdle(t, showStatus, g) {
    screenBg();
    const f = frameOf(t);
    const jx = g * (rnd(f, 41) - 0.5) * 30;
    ctx.save();
    ctx.translate(jx, 0);
    avatar(-190, 70);
    centered('माँ', -64, 80, T.INK);
    centered('००:००', 28, 64, '#9fb4d8');
    if (showStatus) {
      const a = 0.75 + 0.25 * rnd(Math.floor(t * 18), 5);
      ctx.globalAlpha = a;
      centered('कॉल शुरू नहीं हुई', 100, 38, T.ACCENT);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#3ddc84'; ctx.beginPath(); ctx.arc(0, 262, 54, 0, Math.PI * 2); ctx.fill();
    handset(0, 262, 32, -0.5, '#fff');
    ctx.restore();
    if (showStatus) { ctx.fillStyle = 'rgba(224,38,43,0.10)'; ctx.fillRect(-170, -360, 340, 720); }
  }

  // Rohan as a back-lit silhouette. Origin is the head/shoulder axis at x=cx.
  function drawRohan(cx, t, o) {
    const f = frameOf(t);
    const jx = (rnd(f, 51) - 0.5) * o.tremble * 3;
    const jy = (rnd(f, 52) - 0.5) * o.tremble * 3;
    ctx.save();
    ctx.translate(cx + jx, jy);
    const rg = ctx.createRadialGradient(0, 560, 20, 0, 560, 520);
    rg.addColorStop(0, `rgba(110,150,220,${(0.30 * o.glow).toFixed(3)})`);
    rg.addColorStop(1, 'rgba(110,150,220,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(-900, 0, 1800, H);

    ctx.fillStyle = '#030305';
    ctx.beginPath();
    ctx.moveTo(-330, H + 10);
    ctx.bezierCurveTo(-330, H - 220, -150, H - 300, -52, H - 340);
    ctx.lineTo(52, H - 340);
    ctx.bezierCurveTo(150, H - 300, 330, H - 220, 330, H + 10);
    ctx.closePath(); ctx.fill();
    ctx.fillRect(-44, 690, 88, 60);
    const rx = 108 * (1 - 0.62 * o.turn);
    const hx = -o.turn * 18;
    ctx.beginPath(); ctx.ellipse(hx, 590, rx, 124, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(159,196,255,${(0.5 * o.glow).toFixed(3)})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(hx, 590, rx, 124, 0, Math.PI * 0.6, Math.PI * 1.4); ctx.stroke();

    if (o.ear) {
      ctx.save();
      ctx.translate(hx - rx - 14, 590);
      ctx.rotate(-0.1);
      ctx.shadowColor = 'rgba(159,196,255,0.9)';
      ctx.shadowBlur = 50 * o.glow;
      ctx.fillStyle = '#0a0b10';
      rr(-18, -62, 36, 124, 10); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(159,196,255,0.65)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(-215, 880);
      ctx.rotate(0.25);
      ctx.shadowColor = 'rgba(159,196,255,0.9)';
      ctx.shadowBlur = 60 * o.glow;
      ctx.fillStyle = '#0a0b10';
      rr(-40, -80, 80, 160, 14); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(159,196,255,${(0.55 * o.glow).toFixed(3)})`;
      rr(-34, -74, 68, 148, 10); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawFigure(cx, alpha, t, scale) {
    ctx.save();
    ctx.translate(cx + Math.sin(t * 0.7) * 6, H);
    ctx.scale(scale, scale);
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(-95, 10);
    ctx.lineTo(-70, -520);
    ctx.quadraticCurveTo(0, -640, 70, -520);
    ctx.lineTo(95, 10);
    ctx.closePath(); ctx.fill();
    ctx.fillRect(-26, -690, 52, 90);
    ctx.beginPath(); ctx.ellipse(0, -720, 52, 68, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(224,38,43,0.55)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, -720, 52, 68, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-70, -520); ctx.lineTo(-95, 10); ctx.stroke();
    ctx.restore();
  }

  // ---------- modes ----------
  function drawClock(mt, t, tension) {
    drawRoom(t, tension, W / 2, 500, '255,40,50', 0.16, 800);
    const base = ctx.globalAlpha;
    ctx.save();
    ctx.globalAlpha = base * easeOut((t - 0.4) / 1.2) * (0.9 + 0.1 * rnd(Math.floor(t * 24), 2));
    ctx.font = font(300);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const wA = ctx.measureText('२').width;
    const wC = ctx.measureText(':').width;
    const wB = ctx.measureText('१३').width;
    const gap = 14;
    let x = W / 2 - (wA + gap + wC + gap + wB) / 2;
    const y = 560;
    ctx.shadowColor = 'rgba(255,50,60,0.9)';
    ctx.shadowBlur = 70;
    ctx.fillStyle = '#ff3b44';
    ctx.fillText('२', x, y);
    if (t % 1 < 0.6) ctx.fillText(':', x + wA + gap, y);
    ctx.fillText('१३', x + wA + gap + wC + gap, y);
    ctx.restore();
  }

  function drawRing(mt, t, tension) {
    const beat = Math.sin((t * Math.PI * 2) / 1.2) * 0.5 + 0.5;
    drawRoom(t, tension, W / 2, 420, '120,170,255', 0.22 * (0.7 + 0.3 * beat), 900);
    for (let k = 0; k < 3; k++) {
      const ph = ((t / 1.2) + k / 3) % 1;
      ctx.strokeStyle = `rgba(159,196,255,${(0.2 * (1 - ph)).toFixed(3)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(W / 2, 420, 260 + ph * 420, 0, Math.PI * 2); ctx.stroke();
    }
    const e = easeOut(mt / 0.8);
    const v = Math.max(0, Math.sin((t * Math.PI * 2) / 1.2));
    const base = ctx.globalAlpha;
    ctx.globalAlpha = base * e;
    drawPhone(W / 2 + Math.sin(t * 120) * 5 * v, 420 + (1 - e) * 90, 0.85, Math.sin(t * 110) * 0.012 * v, 1, () => screenRinging(t));
    ctx.globalAlpha = base;
  }

  function drawCall(mt, t, tension) {
    const cx = W * 0.3;
    drawRoom(t, tension, cx, 560, '110,150,220', 0.2, 900);
    drawRohan(cx, t, { turn: 0, glow: 1, ear: true, tremble: tension });
    drawWave(1260, 430, 820, voiceAmp(t) * 130, t, T.GLOW);
  }

  function drawDoor(mt, t, tension, m) {
    drawRoom(t, tension, W / 2, 420, '255,190,130', 0.1, 800);
    const stopT = T.CUE_START.stop;
    const still = t >= stopT;
    const kn = knockEnergy(t);
    const feetA = still ? 1 - clamp((t - stopT) / 0.12) : easeOut(mt / 0.6);
    const lightA = still ? 0.55 : 1;
    const c = activeCue(t);
    const jig = c && c.style === 'door' ? Math.sin(t * 38) * 3 : 0;

    ctx.save();
    ctx.translate(W / 2 + Math.sin(t * 110) * 11 * kn, 460 + Math.cos(t * 93) * 5 * kn);

    // light spilling under the door
    const sp = ctx.createLinearGradient(0, 335, 0, 620);
    sp.addColorStop(0, `rgba(255,200,140,${(0.22 * lightA).toFixed(3)})`);
    sp.addColorStop(1, 'rgba(255,200,140,0)');
    ctx.fillStyle = sp;
    ctx.beginPath(); ctx.moveTo(-250, 335); ctx.lineTo(250, 335); ctx.lineTo(560, 620); ctx.lineTo(-560, 620); ctx.closePath(); ctx.fill();

    // frame + leaf
    ctx.fillStyle = '#07070a'; rr(-290, -340, 580, 680, 8); ctx.fill();
    const lg = ctx.createLinearGradient(-260, 0, 260, 0);
    lg.addColorStop(0, '#1b1b22'); lg.addColorStop(1, '#121217');
    ctx.fillStyle = lg; ctx.fillRect(-260, -330, 520, 660);
    ctx.fillStyle = '#16161c'; ctx.strokeStyle = '#0c0c10'; ctx.lineWidth = 3;
    for (const [px, py, pw, ph] of [[-200, -270, 180, 230], [20, -270, 180, 230], [-200, 0, 180, 250], [20, 0, 180, 250]]) {
      rr(px, py, pw, ph, 8); ctx.fill(); ctx.stroke();
    }
    ctx.strokeStyle = `rgba(255,200,140,${(0.12 * lightA).toFixed(3)})`; ctx.lineWidth = 2;
    ctx.strokeRect(-260, -330, 520, 660);

    // knob
    ctx.fillStyle = '#b59a5a'; ctx.beginPath();
