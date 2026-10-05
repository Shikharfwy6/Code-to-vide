// Runs renderFrame against a fake 2D context to catch runtime errors and determinism problems.
import * as T from './tokens.js';
import { createRenderer } from './scene.js';

function mockCtx(log) {
  const store = { font: '700 10px x', canvas: { width: 1920, height: 1080 } };
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: [...s].length * parseFloat(/(\d+(?:\.\d+)?)px/.exec(t.font)[1]) * 0.55 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      return (...a) => { log.push(k + ':' + a.map((x) => (typeof x === 'number' ? x.toFixed(2) : typeof x)).join(',')); };
    },
    set(t, k, v) { t[k] = v; if (k === 'fillStyle' || k === 'globalAlpha') log.push(k + '=' + v); return true; },
  });
}
const make = () => {
  const log = [];
  const ctx = mockCtx(log);
  const r = createRenderer({ ctx, makeCanvas: () => ({ getContext: () => mockCtx([]) }) });
  return { r, log };
};

const a = make();
let frames = 0;
for (let t = 0; t <= T.DURATION; t += 0.1) { a.r.renderFrame(t); frames++; }
console.log('ok: rendered', frames, 'sample frames without errors');

// determinism: same t, any order, identical draw calls
const probe = [3.3, 45.1, 76.0, 90.5, 12.2];
const sig = (r, log, t) => { log.length = 0; r.renderFrame(t); return log.join('|'); };
const b = make();
const first = probe.map((t) => sig(a.r, a.log, t));
const second = probe.slice().reverse().map((t) => sig(b.r, b.log, t)).reverse();
console.log(first.every((s, i) => s === second[i]) ? 'ok: frames are order-independent (deterministic)' : 'FAIL: non-deterministic');
console.log('duration', T.DURATION.toFixed(2), 's,', Math.ceil(T.DURATION * T.FPS), 'frames');
