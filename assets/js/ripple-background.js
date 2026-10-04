// Dot-and-ripple background adapted from the Simimic website.
// A grid of fine dots; concentric waves spread from a few slowly drifting sources,
// plus a fading ripple wherever the visitor clicks or taps. Dots brighten and shift
// slightly along each wave front. Static frame when reduced motion is requested.
(() => {
  const c = document.getElementById("ripple-background");
  if (!c) return;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const theme = window.matchMedia("(prefers-color-scheme: dark)");
  let dotColor;
  function updateColor() {
    dotColor = getComputedStyle(c).getPropertyValue("--dot-color").trim();
  }
  const still = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = window.matchMedia("(max-width: 960px)");
  const GAP = 22;            // dot spacing (px)
  const WAVELEN = 140;       // distance between ripple crests (px)
  const SPEED = 38;          // crest speed (px/s)
  const K = (2 * Math.PI) / WAVELEN;
  let w = 0, h = 0, dpr = 1, raf = 0;
  const t0 = performance.now();
  const taps = [];           // {x, y, t}

  // Slow Lissajous paths for the ambient sources, in fractions of the viewport.
  const sources = [
    { ax: 0.30, ay: 0.35, fx: 0.021, fy: 0.017, px: 0.0, py: 1.3, amp: 1.0 },
    { ax: 0.72, ay: 0.62, fx: 0.015, fy: 0.023, px: 2.1, py: 0.4, amp: 0.8 },
    { ax: 0.50, ay: 0.85, fx: 0.012, fy: 0.019, px: 4.2, py: 2.7, amp: 0.6 },
  ];

  function size() {
    if (mobile.matches) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = c.clientWidth; h = c.clientHeight;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(now) {
    const t = (now - t0) / 1000;
    ctx.clearRect(0, 0, w, h);

    const src = sources.map(s => ({
      x: w * (s.ax + 0.12 * Math.sin(t * s.fx * 2 * Math.PI + s.px)),
      y: h * (s.ay + 0.12 * Math.sin(t * s.fy * 2 * Math.PI + s.py)),
      amp: s.amp,
    }));
    const diag = Math.hypot(w, h);

    // Drop taps that have fully faded.
    for (let i = taps.length - 1; i >= 0; i--) if (t - taps[i].t > 9) taps.splice(i, 1);

    const cols = Math.ceil(w / GAP) + 1, rows = Math.ceil(h / GAP) + 1;
    for (let j = 0; j < rows; j++) {
      const y0 = j * GAP;
      for (let i = 0; i < cols; i++) {
        const x0 = i * GAP;
        let v = 0, dx = 0, dy = 0;

        for (const s of src) {
          const ex = x0 - s.x, ey = y0 - s.y;
          const r = Math.hypot(ex, ey) + 1e-3;
          const fall = s.amp * (1 - Math.min(r / diag, 1)) ** 2;
          const wave = Math.sin(K * r - K * SPEED * t);
          v += wave * fall;
          const push = Math.cos(K * r - K * SPEED * t) * fall * 2.2;
          dx += (ex / r) * push; dy += (ey / r) * push;
        }

        for (const p of taps) {
          const age = t - p.t;
          const ex = x0 - p.x, ey = y0 - p.y;
          const r = Math.hypot(ex, ey) + 1e-3;
          const front = SPEED * 3.2 * age;                  // tap rings travel faster
          const band = Math.exp(-((r - front) ** 2) / (2 * 60 * 60));
          const fade = Math.exp(-age / 2.6);
          const wave = Math.sin(K * (r - front)) * band * fade * 1.6;
          v += wave;
          dx += (ex / r) * wave * 2.5; dy += (ey / r) * wave * 2.5;
        }

        const b = Math.max(0, Math.min(1, 0.5 + 0.5 * v));
        const a = 0.04 + 0.18 * b * b;
        ctx.fillStyle = "rgba(" + dotColor + "," + a.toFixed(3) + ")";
        const r = 1.2 + 0.7 * b;              // round dots, ~2.4 to 3.8 px across
        ctx.beginPath();
        ctx.arc(x0 + dx, y0 + dy, r, 0, 6.2832);
        ctx.fill();
      }
    }
  }

  function loop(now) { draw(now); raf = requestAnimationFrame(loop); }
  function start() {
    cancelAnimationFrame(raf);
    if (mobile.matches) return;
    if (still.matches || document.hidden) draw(performance.now());
    else raf = requestAnimationFrame(loop);
  }

  window.addEventListener("pointerdown", e => {
    if (mobile.matches || still.matches) return;
    if (e.target.closest && e.target.closest("a")) return;
    taps.push({ x: e.clientX, y: e.clientY, t: (performance.now() - t0) / 1000 });
    if (taps.length > 6) taps.shift();
  });

  updateColor(); size(); start();
  window.addEventListener("resize", () => { size(); start(); });
  document.addEventListener("visibilitychange", start);
  still.addEventListener("change", start);
  theme.addEventListener("change", () => { updateColor(); start(); });
})();
