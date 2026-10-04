/*
 * A full-viewport wave field that indexes the page.
 *
 * The same scalar wave equation as before, now at screen scale:
 *
 *     d2u/dt2 = c(x,y)^2 * laplacian(u) - damping * du/dt
 *
 * solved by leapfrog, stable while c^2 <= 0.5 (the 2D CFL condition).
 *
 * What makes it an index rather than a backdrop: every publication and past
 * role is a real region of slower c embedded in the medium. They are not
 * drawn onto the field, they are *in* it, so passing wavefronts bend and
 * reflect around them and you can see where they are by how the wave breaks.
 * Pointing at one drives it into resonance and it re-radiates on its own.
 *
 * Sensing, in other words: the objects are found by their scattering.
 *
 * Nodes are real anchors in the DOM, so hover, keyboard focus and screen
 * readers all reach the same content. Below 960px the field is not built at
 * all and the conventional page carries everything.
 */
(function () {
  'use strict';

  var host = document.getElementById('field');
  var canvas = document.getElementById('field-canvas');
  var nodeLayer = document.getElementById('field-nodes');
  var overlay = document.getElementById('field-overlay');
  var dataTag = document.getElementById('field-data');
  if (!host || !canvas || !canvas.getContext || !nodeLayer || !dataTag) return;

  var items;
  try {
    items = JSON.parse(dataTag.textContent);
  } catch (e) {
    return;
  }
  if (!items || !items.length) return;

  var ctx = canvas.getContext('2d');

  var CONFIG = {
    cellPx: 5,          // target simulation cell size in CSS pixels
    maxCells: 320,      // cap on the long side, so 4K does not melt the CPU
    c2: 0.26,           // CFL requires <= 0.5
    c2Slow: 0.085,      // inside a node
    frequency: 0.017,   // cycles per step; wavelength ~30 cells
    pulseWidth: 62,
    pulseEvery: 4.0,    // simulated s between sweeps (divide by timeScale for real)
    steerMax: 30,       // degrees
    elements: 9,
    timeScale: 0.55,    // simulated seconds per real second; lower is calmer
    gain: 4.2,
    maxAlpha: 0.46,     // the field sits under text; it must stay quiet
    persistence: 0.62,
    baseDamping: 0.0007,
    spongeDepth: 18,
    spongeMax: 0.075,
    resonanceDecay: 0.994
  };

  var STEPS_PER_SEC = 100;
  var STEP = 1 / STEPS_PER_SEC;
  var MAX_FRAME = 0.25;

  var reduced = window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var palette;
  function readPalette() {
    var dark = window.matchMedia &&
               window.matchMedia('(prefers-color-scheme: dark)').matches;
    palette = dark ? [138, 180, 212] : [23, 70, 110];
  }
  readPalette();
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', readPalette);
    else if (mq.addListener) mq.addListener(readPalette);
  }

  /*
   * Node placement is blue noise, drawn fresh on every load by Mitchell's
   * best-candidate algorithm: to place each point, throw CANDIDATES darts at
   * random and keep whichever lands farthest from everything already placed.
   *
   * Uniform random sampling would be genuinely random but ugly — points clump
   * and leave holes, because independent draws have no idea where their
   * neighbours are. Best-candidate keeps the randomness while pushing the
   * spectrum towards blue noise: no clumps, no gaps, no repeating figure, and
   * a different composition every time the page is opened.
   *
   * Points are sampled once in the unit disk and then mapped onto an ellipse
   * inscribed in whatever region the name block leaves free. That is why they
   * can never collide with the text, and why resizing re-maps the same
   * arrangement instead of reshuffling it under you.
   */
  var CANDIDATES = 24;

  function sampleUnitDisk(n) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var best = null, bestD = -1;
      for (var c = 0; c < CANDIDATES; c++) {
        // sqrt on the radius keeps the draw uniform by area, not by radius.
        var r = Math.sqrt(Math.random());
        var a = Math.random() * Math.PI * 2;
        var p = { u: r * Math.cos(a), v: r * Math.sin(a) };

        var d = Infinity;
        for (var k = 0; k < pts.length; k++) {
          var du = pts[k].u - p.u, dv = pts[k].v - p.v;
          var dist = du * du + dv * dv;
          if (dist < d) d = dist;
        }
        if (d > bestD) { bestD = d; best = p; }
      }
      pts.push(best);
    }
    return pts;
  }

  // Drawn once per load; resize re-maps these rather than re-rolling them.
  var seedPoints = sampleUnitDisk(items.length);

  // Measure the name block rather than assuming its size: it grows with the
  // bio text and with the viewport, and a hard-coded margin would eventually
  // let a node land on top of the words.
  function freeRegion(wide) {
    var pad = 0.04;
    var edge = 0.95;
    var box = null;

    if (overlay && overlay.getBoundingClientRect) {
      var o = overlay.getBoundingClientRect();
      var h = host.getBoundingClientRect();
      box = { right: (o.right - h.left) / W, bottom: (o.bottom - h.top) / H };
    }

    if (wide) {
      var x0 = box ? box.right + pad : 0.465;
      if (x0 < 0.42) x0 = 0.42;
      else if (x0 > 0.70) x0 = 0.70;      // always leave a usable band
      return { cx: (x0 + edge) / 2, cy: 0.50, rx: (edge - x0) / 2, ry: 0.36 };
    }

    var y0 = box ? box.bottom + pad : 0.585;
    if (y0 < 0.45) y0 = 0.45;
    else if (y0 > 0.74) y0 = 0.74;
    return { cx: 0.50, cy: (y0 + edge) / 2, rx: 0.34, ry: (edge - y0) / 2 };
  }

  function layoutNodes(wide) {
    var reg = freeRegion(wide);
    return seedPoints.map(function (p) {
      return { x: reg.cx + reg.rx * p.u, y: reg.cy + reg.ry * p.v };
    });
  }

  // Without hover there is no way to preview a node, so the first tap resolves
  // it and only a second tap follows the link.
  var touch = window.matchMedia && window.matchMedia('(hover: none)').matches;
  var revealed = null;

  function reveal(n) {
    if (revealed && revealed !== n) {
      revealed.active = false;
      revealed.el.classList.remove('active');
    }
    revealed = n;
    n.active = true;
    n.energy = 1;
    n.el.classList.add('active');
  }

  function clearReveal() {
    if (!revealed) return;
    revealed.active = false;
    revealed.el.classList.remove('active');
    revealed = null;
  }

  // Build the DOM nodes once; they are the accessible surface of the field.
  var nodes = items.map(function (item, i) {
    var a = document.createElement('a');
    a.className = 'field-node';
    a.href = item.url || '#';
    if (item.url && /^https?:/.test(item.url)) {
      a.target = '_blank';
      a.rel = 'noopener';
    }

    var dot = document.createElement('span');
    dot.className = 'field-dot';
    a.appendChild(dot);

    var label = document.createElement('span');
    label.className = 'field-label';

    var title = document.createElement('span');
    title.className = 'field-title';
    title.textContent = item.title;
    label.appendChild(title);

    if (item.meta) {
      var meta = document.createElement('span');
      meta.className = 'field-meta';
      meta.textContent = item.meta;
      label.appendChild(meta);
    }

    a.appendChild(label);
    nodeLayer.appendChild(a);

    var n = { el: a, x: 0.5, y: 0.5, energy: 0, active: false, radius: 0.030 };

    function on() { reveal(n); }
    function off() { if (!touch) { n.active = false; a.classList.remove('active'); } }

    a.addEventListener('mouseenter', on);
    a.addEventListener('mouseleave', off);
    a.addEventListener('focus', on);
    a.addEventListener('blur', off);

    a.addEventListener('click', function (e) {
      if (!touch) return;
      if (revealed !== n) {     // first tap resolves, second follows the link
        e.preventDefault();
        reveal(n);
      }
    });

    return n;
  });

  // A tap on empty field dismisses whatever is showing.
  if (touch) {
    document.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('.field-node')) clearReveal();
    });
  }

  // Position the nodes for the current viewport shape.
  function placeNodes() {
    var wide = host.clientWidth >= 860 && host.clientWidth > host.clientHeight * 0.9;
    var layout = layoutNodes(wide);
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].x = layout[i].x;
      nodes[i].y = layout[i].y;
      nodes[i].el.style.left = (layout[i].x * 100).toFixed(3) + '%';
      nodes[i].el.style.top = (layout[i].y * 100).toFixed(3) + '%';

      // Labels always hang below the dot, left-aligned. The anchor only shifts
      // for nodes near an edge, where a centred label would run off screen.
      var halfLabel = 150 / Math.max(W, 1);   // ~half a max-width label, in vw
      nodes[i].el.classList.toggle('anchor-right', layout[i].x + halfLabel > 0.98);
      nodes[i].el.classList.toggle('anchor-left', layout[i].x - halfLabel < 0.02);
    }
  }

  // ---- simulation state, rebuilt on resize ----

  var N = 0, M = 0, NN = 0;
  var u, uPrev, uNext, c2, damp, glow;
  var img, pix, buf, bctx;
  var arrayRow = 0, arrayCols = [];
  var cBase = Math.sqrt(CONFIG.c2);
  var W = 0, H = 0;

  function build() {
    W = host.clientWidth;
    H = host.clientHeight;
    if (W < 2 || H < 2) return false;

    // Node positions depend on viewport shape and the medium depends on the
    // node positions, so they must be laid out before the grid is built.
    placeNodes();

    var long = Math.max(W, H);
    var cell = Math.max(CONFIG.cellPx, long / CONFIG.maxCells);
    N = Math.max(40, Math.round(W / cell));   // columns
    M = Math.max(40, Math.round(H / cell));   // rows
    NN = N * M;

    u = new Float32Array(NN);
    uPrev = new Float32Array(NN);
    uNext = new Float32Array(NN);
    c2 = new Float32Array(NN);
    damp = new Float32Array(NN);
    glow = new Float32Array(NN);

    for (var j = 0; j < M; j++) {
      for (var i = 0; i < N; i++) {
        var k = j * N + i;
        c2[k] = CONFIG.c2;

        var fx = i / N, fy = j / M;
        for (var q = 0; q < nodes.length; q++) {
          var nd = nodes[q];
          var dx = (fx - nd.x) * (W / H);   // measure in square units
          var dy = fy - nd.y;
          var d = Math.sqrt(dx * dx + dy * dy);
          var r = nd.radius;
          if (d < r) {
            var t = Math.min(1, (r - d) / (r * 0.5));
            c2[k] = CONFIG.c2 + (CONFIG.c2Slow - CONFIG.c2) * t;
          }
        }

        var edge = Math.min(i, j, N - 1 - i, M - 1 - j);
        var s = edge < CONFIG.spongeDepth
          ? (CONFIG.spongeDepth - edge) / CONFIG.spongeDepth
          : 0;
        damp[k] = CONFIG.baseDamping + CONFIG.spongeMax * s * s;
      }
    }

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    buf = document.createElement('canvas');
    buf.width = N;
    buf.height = M;
    bctx = buf.getContext('2d');
    img = bctx.createImageData(N, M);
    pix = img.data;

    arrayRow = M - CONFIG.spongeDepth - 6;
    arrayCols = [];
    var spacing = Math.max(4, Math.round(N / (CONFIG.elements + 3)));
    var span = (CONFIG.elements - 1) * spacing;
    var start = Math.round((N - span) / 2);
    for (var e = 0; e < CONFIG.elements; e++) arrayCols.push(start + e * spacing);
    elementSpacing = spacing;

    return true;
  }

  var elementSpacing = 8;
  var pulseIndex = 0;
  var tSincePulse = 1e9;
  var steer = 0;
  var waitTimer = 0;

  function beginPulse() {
    steer = (CONFIG.steerMax * Math.PI / 180) * Math.sin(pulseIndex * 0.7);
    pulseIndex++;
    tSincePulse = 0;
  }

  function emit() {
    var center = (CONFIG.elements - 1) / 2;
    for (var k = 0; k < CONFIG.elements; k++) {
      var tau = (k - center) * elementSpacing * Math.sin(steer) / cBase;
      var t = tSincePulse - tau - CONFIG.pulseWidth * 1.6;
      var env = Math.exp(-(t * t) / (CONFIG.pulseWidth * CONFIG.pulseWidth));
      if (env < 1e-4) continue;
      var col = arrayCols[k];
      if (col < 1 || col > N - 2) continue;
      u[arrayRow * N + col] += env * Math.sin(2 * Math.PI * CONFIG.frequency * t) * 0.9;
    }
  }

  // A pointed-at node is driven, so it radiates its own wavelet.
  var resonanceClock = 0;
  function resonate() {
    resonanceClock++;
    for (var q = 0; q < nodes.length; q++) {
      var nd = nodes[q];
      if (nd.active) nd.energy = 1;
      else nd.energy *= CONFIG.resonanceDecay;
      if (nd.energy < 0.004) continue;

      var i = Math.round(nd.x * N);
      var j = Math.round(nd.y * M);
      if (i < 1 || i > N - 2 || j < 1 || j > M - 2) continue;
      u[j * N + i] += nd.energy * 0.5 *
        Math.sin(2 * Math.PI * CONFIG.frequency * resonanceClock);
    }
  }

  function integrate() {
    if (tSincePulse < CONFIG.pulseWidth * 3.4) {
      emit();
      tSincePulse++;
    } else {
      waitTimer += STEP;
      if (waitTimer >= CONFIG.pulseEvery) {
        waitTimer = 0;
        beginPulse();
      }
    }
    resonate();

    for (var j = 1; j < M - 1; j++) {
      var row = j * N;
      for (var i = 1; i < N - 1; i++) {
        var k = row + i;
        var lap = u[k - 1] + u[k + 1] + u[k - N] + u[k + N] - 4 * u[k];
        uNext[k] = 2 * u[k] - uPrev[k] + c2[k] * lap - damp[k] * (u[k] - uPrev[k]);
      }
    }

    var swap = uPrev;
    uPrev = u;
    u = uNext;
    uNext = swap;
  }

  function draw() {
    var r = palette[0], g = palette[1], b = palette[2];
    var top = 255 * CONFIG.maxAlpha;
    var decay = CONFIG.persistence;
    var gain = CONFIG.gain;

    for (var k = 0, p = 0; k < NN; k++, p += 4) {
      var a = u[k];
      if (a < 0) a = -a;
      var gl = glow[k] * decay;
      if (a > gl) gl = a;
      glow[k] = gl;

      pix[p] = r;
      pix[p + 1] = g;
      pix[p + 2] = b;
      pix[p + 3] = top * (1 - Math.exp(-gain * gl));
    }
    bctx.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(buf, 0, 0, W, H);
  }

  // Mirrors the CSS breakpoint below which the field is hidden. On phones the
  // simulation is never built at all — no canvas, no integration, no battery
  // cost — and the conventional page carries everything.
  var wideEnough = window.matchMedia
    ? window.matchMedia('(min-width: 861px)')
    : null;

  function fieldEnabled() { return !wideEnough || wideEnough.matches; }

  var last = 0;
  var accumulator = 0;
  var running = true;
  var started = false;

  function frame(now) {
    if (!last) last = now;
    var dt = (now - last) / 1000;
    last = now;
    if (dt > MAX_FRAME) dt = MAX_FRAME;

    // Scaling time rather than the wave speed keeps the geometry identical —
    // same wavelength, same interference — and only slows the rate.
    accumulator += dt * CONFIG.timeScale;
    var budget = 0;
    while (accumulator >= STEP && budget < 8) {   // never spiral on a slow frame
      integrate();
      accumulator -= STEP;
      budget++;
    }
    if (accumulator > STEP * 8) accumulator = 0;

    draw();
    if (running) requestAnimationFrame(frame);
  }

  // A single settled frame, for when motion is suppressed.
  function prerender() {
    beginPulse();
    for (var w = 0; w < 420; w++) integrate();
    draw();
  }

  function start() {
    if (started || !fieldEnabled()) return;
    if (!build()) return;

    started = true;
    host.classList.add('ready');

    if (reduced) { prerender(); return; }

    beginPulse();
    last = 0;
    requestAnimationFrame(frame);
  }

  // Stop simulating once the field is scrolled away.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      var visible = entries[0].isIntersecting;
      if (visible && started && !reduced && !running) {
        running = true;
        last = 0;
        requestAnimationFrame(frame);
      } else if (!visible) {
        running = false;
      }
    }, { threshold: 0 }).observe(host);
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) last = 0;
  });

  // A narrow window widened, or a tablet rotated, can cross the breakpoint
  // after load; start then rather than leaving an empty hero.
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!started) { start(); return; }
      if (build()) {
        last = 0;
        if (reduced) prerender();
      }
    }, 180);
  });

  start();
})();
