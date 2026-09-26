// Fancy-mode background: a tree graph growing around the logo, with data packets and code rain.
// Loaded by switches.js only when fancy mode gets turned on.
window.fancyBackground = (function () {
  "use strict";

  const root = document.documentElement;
  const canvas = document.getElementById("fancy-background");
  const ctx = canvas.getContext("2d");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const GLYPHS = "01{}<>/=;:$#λ*+ABCDEF";
  const GROW_SPEED = 0.09; // px per ms
  const PACKET_SPEED = 0.25; // px per ms
  const HOLD_TIME = 25000; // how long the grown tree stays before regrowing, ms
  const FADE_TIME = 2500; // ms

  let width = 0;
  let height = 0;
  let edges = [];
  let grownAt = 0; // ms since the tree was planted, when its last branch finishes growing
  let plantedAt = null;
  let packets = [];
  let drops = [];
  let frame = null;
  let running = false;
  let lastTime = 0;
  let nodeColor = "";
  let glyphColor = "";

  function readColors() {
    const style = getComputedStyle(root);
    nodeColor = style.getPropertyValue("--fancy-node").trim();
    glyphColor = style.getPropertyValue("--fancy-glyph").trim();
    if (running && reducedMotion) draw(0);
  }

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  const MARGIN = 16; // px, kept free at the screen edges
  const SHRINK = 0.9; // how much smaller each retry is, when a tree doesn't fit the screen
  let logo = null; // the circle the crown grows around: {x, y, r}
  let shape = null; // tree proportions for the current screen, see shapeFor()
  let clipped = 0; // branches dropped in the current attempt, for leaving the screen at the sides

  function mix(from, to, t) {
    return from + (to - from) * t;
  }

  // Tree proportions depend on the screen's aspect ratio: t = 0 for a tall phone screen, 1 for a laptop or wider.
  // Tall screens get a slim tree with long branches that climbs up beside the logo;
  // wide screens get a broad tree with quickly shortening branches that forms a dome over it.
  function shapeFor(width, height) {
    const t = Math.min(1, Math.max(0, (width / height - 0.5) / 0.8));
    return {
      spread: mix(0.3, 0.62, t), // how far apart sibling branches point, radians
      decay: mix(0.86, 0.78, t), // a branch's length relative to its parent
      logoClearance: mix(10, 22, t), // px, kept free around the logo
      // share of branches that may be dropped for poking out at the sides; a tall screen's sides are always close
      maxClipped: mix(0.3, 0.03, t),
      maxDepth: width * height < 600000 ? 7 : 9, // fewer levels on small screens, where they'd get crowded
    };
  }

  function distanceToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const t = Math.min(1, Math.max(0, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function clearOfLogo(x1, y1, x2, y2) {
    return distanceToSegment(logo.x, logo.y, x1, y1, x2, y2) > logo.r;
  }

  function withinSides(x) {
    return x >= MARGIN && x <= width - MARGIN;
  }

  function fitsScreen() {
    return edges.every((edge) => edge.y2 >= MARGIN) && clipped <= edges.length * shape.maxClipped;
  }

  // A branch that would cross the logo gets bent, then shortened, until it clears it.
  // A branch poking out at the side of the screen doesn't grow at all.
  function place(x, y, angle, length) {
    if (!withinSides(x + Math.cos(angle) * length)) {
      clipped++;
      return null;
    }
    const side = Math.random() < 0.5 ? 1 : -1;
    for (const scale of [1, 0.6]) {
      for (let bend = 0; bend <= 1.4; bend += 0.2) {
        for (const direction of bend ? [side, -side] : [1]) {
          const a = angle + bend * direction;
          const x2 = x + Math.cos(a) * length * scale;
          const y2 = y + Math.sin(a) * length * scale;
          if (withinSides(x2) && clearOfLogo(x, y, x2, y2)) return { angle: a, x2: x2, y2: y2, length: length * scale };
        }
      }
    }
    return null;
  }

  function branch(x, y, angle, length, depth) {
    const spot = place(x, y, angle, length);
    if (!spot) return null;
    const edge = {
      x1: x,
      y1: y,
      x2: spot.x2,
      y2: spot.y2,
      depth: depth,
      delay: random(0, 350),
      children: [],
      phase: random(0, Math.PI * 2),
    };
    edges.push(edge);

    if (depth < shape.maxDepth) {
      const count = depth > 1 && Math.random() < 0.2 ? 3 : 2;
      const spread = shape.spread * random(0.8, 1.2);
      for (let i = 0; i < count; i++) {
        // leave some gaps higher up, so the crown looks grown rather than generated
        if (depth > 3 && Math.random() < 0.12) continue;
        const childAngle = spot.angle + spread * (i - (count - 1) / 2) * (count === 3 ? 1 : 1.4) + random(-0.12, 0.12);
        const child = branch(edge.x2, edge.y2, childAngle, spot.length * shape.decay * random(0.94, 1.06), depth + 1);
        if (child) edge.children.push(child);
      }
    }
    return edge;
  }

  // Each edge grows from its parent's tip once the parent is done, so the tree unfolds depth by depth.
  function schedule(edge, start) {
    edge.length = Math.hypot(edge.x2 - edge.x1, edge.y2 - edge.y1);
    edge.start = start;
    edge.end = start + edge.length / GROW_SPEED;
    grownAt = Math.max(grownAt, edge.end);
    for (const child of edge.children) schedule(child, edge.end + child.delay);
  }

  function plant(time) {
    edges = [];
    packets = [];
    grownAt = 0;
    plantedAt = time;
    shape = shapeFor(width, height);
    const rect = document.querySelector(".logo").getBoundingClientRect();
    logo = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, r: rect.width / 2 + shape.logoClearance };
    // the trunk forks well below the logo, so the crown has room to grow around it
    let trunkLength = Math.min(height * 0.25, Math.max(40, (height - logo.y - logo.r) * 0.45));
    let trunk = null;
    // grow the tree freely, and if its crown doesn't fit on the screen, grow a smaller one
    for (let attempt = 0; attempt < 25; attempt++, trunkLength *= SHRINK) {
      edges = [];
      clipped = 0;
      trunk = branch(width / 2, height + 4, -Math.PI / 2 + random(-0.05, 0.05), trunkLength, 0);
      if (fitsScreen()) break;
    }
    if (trunk) schedule(trunk, 0);
  }

  function newDrop(fromTop) {
    return {
      x: Math.floor(random(0, width / 18)) * 18,
      y: fromTop ? random(-height, 0) : random(0, height),
      speed: random(0.4, 1.2),
      length: Math.floor(random(4, 12)),
      glyphs: Array.from({ length: 12 }, () => GLYPHS[Math.floor(random(0, GLYPHS.length))]),
    };
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drops = Array.from({ length: Math.round(width / 60) }, () => newDrop(false));
    plantedAt = null;
  }

  function drawRain() {
    ctx.font = '13px "JetBrains Mono", ui-monospace, monospace';
    for (const drop of drops) {
      for (let i = 0; i < drop.length; i++) {
        const alpha = 0.12 * (1 - i / drop.length);
        ctx.fillStyle = `rgba(${glyphColor}, ${alpha})`;
        ctx.fillText(drop.glyphs[i], drop.x, drop.y - i * 16);
      }
      drop.y += drop.speed;
      if (Math.random() < 0.02) {
        drop.glyphs[Math.floor(random(0, drop.length))] = GLYPHS[Math.floor(random(0, GLYPHS.length))];
      }
      if (drop.y - drop.length * 16 > height) {
        Object.assign(drop, newDrop(true));
      }
    }
  }

  function progress(edge, age) {
    return Math.min(1, Math.max(0, (age - edge.start) / (edge.end - edge.start)));
  }

  function drawTree(age, time, delta) {
    ctx.lineCap = "round";
    for (const edge of edges) {
      const t = progress(edge, age);
      if (t === 0) continue;
      const x = edge.x1 + (edge.x2 - edge.x1) * t;
      const y = edge.y1 + (edge.y2 - edge.y1) * t;

      ctx.strokeStyle = `rgba(${nodeColor}, ${0.4 - edge.depth * 0.025})`;
      ctx.lineWidth = Math.max(0.7, 3.2 - edge.depth * 0.35);
      ctx.beginPath();
      ctx.moveTo(edge.x1, edge.y1);
      ctx.lineTo(x, y);
      ctx.stroke();

      if (t < 1) {
        // the growing tip
        ctx.fillStyle = `rgba(${nodeColor}, 0.95)`;
        ctx.shadowColor = `rgba(${nodeColor}, 1)`;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        const leaf = edge.children.length === 0;
        const pulse = leaf ? 0.5 + 0.5 * Math.sin(time / 800 + edge.phase) : 0;
        ctx.fillStyle = `rgba(${nodeColor}, ${0.45 + 0.4 * pulse})`;
        ctx.beginPath();
        ctx.arc(edge.x2, edge.y2, Math.max(1.2, 3 - edge.depth * 0.25) + pulse, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // packets travel from the root towards the leaves along already grown branches
    if (packets.length < 24 && Math.random() < 0.06 && edges.length && progress(edges[0], age) === 1) {
      packets.push({ edge: edges[0], travelled: 0 });
    }
    for (const packet of packets) {
      packet.travelled += PACKET_SPEED * delta;
      while (packet.edge && packet.travelled >= packet.edge.length) {
        packet.travelled -= packet.edge.length;
        const next = packet.edge.children.filter((child) => progress(child, age) === 1);
        packet.edge = next.length ? next[Math.floor(random(0, next.length))] : null;
      }
      if (!packet.edge) continue;
      const t = packet.travelled / packet.edge.length;
      ctx.fillStyle = `rgba(${nodeColor}, 0.95)`;
      ctx.shadowColor = `rgba(${nodeColor}, 1)`;
      ctx.shadowBlur = 8;
      ctx.fillRect(packet.edge.x1 + (packet.edge.x2 - packet.edge.x1) * t - 1.5, packet.edge.y1 + (packet.edge.y2 - packet.edge.y1) * t - 1.5, 3, 3);
      ctx.shadowBlur = 0;
    }
    packets = packets.filter((packet) => packet.edge);
  }

  function draw(time) {
    if (plantedAt === null) plant(time);
    // with reduced motion, show a single frame of the fully grown tree
    const age = reducedMotion ? grownAt : time - plantedAt;
    const delta = Math.min(50, time - lastTime);
    lastTime = time;

    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    drawRain();
    ctx.globalAlpha = Math.min(1, Math.max(0, 1 - (age - grownAt - HOLD_TIME) / FADE_TIME));
    drawTree(age, time, delta);
    ctx.globalAlpha = 1;

    if (age > grownAt + HOLD_TIME + FADE_TIME) plantedAt = null;
    frame = reducedMotion ? null : requestAnimationFrame(draw);
  }

  function start() {
    if (running) return;
    readColors();
    resize();
    running = true;
    frame = requestAnimationFrame(draw);
  }

  function stop() {
    running = false;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }

  window.addEventListener("resize", function () {
    if (!running) return;
    resize();
    if (reducedMotion) draw(0);
  });

  return { start, stop, readColors };
})();
