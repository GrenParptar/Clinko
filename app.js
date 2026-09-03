// Clinko — a physics-driven Plinko-style randomizer built on Matter.js
// All balls drop at the same time through a chaotic peg field, then funnel
// into a single narrow chute. Since only one ball fits through at a time,
// the order in which they pass the funnel's neck IS the finishing order —
// they physically stack up below it, 1st place at the bottom.

(function () {
  const { Engine, Render, Runner, World, Bodies, Body, Events } = Matter;

  const canvas = document.getElementById("board");
  const boardWrap = document.getElementById("boardWrap");
  const ballCountInput = document.getElementById("ballCount");
  const rowCountInput = document.getElementById("rowCount");
  const rowCountOut = document.getElementById("rowCountOut");
  const namesInput = document.getElementById("names");
  const buildBtn = document.getElementById("buildBtn");
  const dropBtn = document.getElementById("dropBtn");
  const resetBtn = document.getElementById("resetBtn");
  const statusLine = document.getElementById("statusLine");
  const resultsList = document.getElementById("resultsList");

  rowCountInput.addEventListener("input", () => (rowCountOut.textContent = rowCountInput.value));

  const W = 1200;
  const PEG_TOP = 170;
  const ROW_GAP = 62;
  const USABLE_WIDTH = W * 0.9;
  const FUNNEL_GAP = 24;
  const FUNNEL_HEIGHT = 260;
  const BOTTOM_MARGIN = 30;

  const BALL_RADIUS = 17;
  const BALL_DIAMETER = BALL_RADIUS * 2;
  const PEG_RADIUS = 11;

  // Exaggerated, slow-motion physics: light gravity + a global slow-mo
  // factor so falls take longer, combined with high restitution so
  // collisions still bounce big and dramatic rather than looking floaty.
  const GRAVITY_Y = 0.7;
  const TIME_SCALE = 0.62;
  const BALL_RESTITUTION = 0.92;

  let engine, render, runner;
  let neckWidth, tubeTop, floorY, H;
  let balls = [];
  let settledOrder = [];
  let boardBuilt = false;
  let finishLineY = 0;

  function colorForIndex(i) {
    const hue = Math.round((360 / 24) * (i % 24));
    return hue;
  }

  function setStatus(msg) {
    statusLine.innerHTML = msg;
  }

  function clearResults() {
    resultsList.innerHTML = '<li class="empty">No balls have finished yet.</li>';
  }

  function teardownBoard() {
    if (runner) Runner.stop(runner);
    if (render) {
      Render.stop(render);
      render.canvas = null;
    }
    if (engine) World.clear(engine.world, false);
    balls = [];
    settledOrder = [];
    boardBuilt = false;
  }

  function computeGeometry(rows, ballCount) {
    const pegBottom = PEG_TOP + (rows - 1) * ROW_GAP;
    const fTop = pegBottom + FUNNEL_GAP;
    // Wide enough to cut down on arch-jamming above the neck, but still
    // strictly under 2 ball-diameters so two balls can never pass side by
    // side — order through the neck stays physically guaranteed.
    neckWidth = BALL_DIAMETER * 1.7;
    const fBottom = fTop + FUNNEL_HEIGHT;
    const tubeHeight = Math.max(160, ballCount * BALL_DIAMETER * 1.06 + 20);
    tubeTop = fBottom;
    floorY = tubeTop + tubeHeight;
    finishLineY = tubeTop + 4;
    H = floorY + BOTTOM_MARGIN;
    return { pegBottom, fTop, fBottom };
  }

  function wallFromPoints(x1, y1, x2, y2, thickness) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    return Bodies.rectangle(cx, cy, length, thickness, {
      isStatic: true,
      angle,
      render: { fillStyle: "#2c3253" },
    });
  }

  function buildBoard() {
    teardownBoard();
    clearResults();

    const rows = parseInt(rowCountInput.value, 10);
    const ballCount = Math.max(1, Math.min(80, parseInt(ballCountInput.value, 10) || 1));
    const { pegBottom, fTop, fBottom } = computeGeometry(rows, ballCount);

    canvas.width = W;
    canvas.height = H;
    // Force exact 1:1 pixel mapping so nothing (e.g. flex stretch) can
    // non-uniformly scale the canvas and distort circles into ovals.
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    engine = Engine.create();
    engine.gravity.y = GRAVITY_Y;
    engine.timing.timeScale = TIME_SCALE;

    render = Render.create({
      canvas,
      engine,
      options: { width: W, height: H, wireframes: false, background: "#0a0c17" },
    });

    const wallOpts = { isStatic: true, render: { fillStyle: "#232849" } };
    const centerLeft = (W - USABLE_WIDTH) / 2;
    // Guide walls run flush with the peg field's outer edge — from the top
    // all the way down into the funnel — so there's no gap beside the pegs
    // for a ball to slip straight down the side without ever touching one.
    const EDGE_PAD = PEG_RADIUS + 8;
    const edgeLeftX = centerLeft - EDGE_PAD;
    const edgeRightX = centerLeft + USABLE_WIDTH + EDGE_PAD;
    const walls = [
      Bodies.rectangle(edgeLeftX, fTop / 2, 12, fTop, wallOpts),
      Bodies.rectangle(edgeRightX, fTop / 2, 12, fTop, wallOpts),
    ];

    // Peg field — a classic alternating Galton-board lattice for chaotic bouncing.
    // Horizontal density is sized off the ball/peg dimensions (not the row
    // count) so bigger balls always have a wide-enough gap to fall through.
    const pegs = [];
    const minPegSpacing = BALL_DIAMETER * 1.35 + PEG_RADIUS * 2;
    const pegsPerRow = Math.max(3, Math.floor(USABLE_WIDTH / minPegSpacing));
    const pegSpacing = USABLE_WIDTH / pegsPerRow;
    for (let r = 0; r < rows; r++) {
      const y = PEG_TOP + r * ROW_GAP;
      const offset = r % 2 === 0 ? pegSpacing / 2 : 0;
      const count = r % 2 === 0 ? pegsPerRow - 1 : pegsPerRow;
      for (let c = 0; c < count; c++) {
        const x = centerLeft + offset + c * pegSpacing;
        pegs.push(
          Bodies.circle(x, y, PEG_RADIUS, {
            isStatic: true,
            restitution: 0.7,
            friction: 0.05,
            render: { visible: false },
            plugin: { isPeg: true },
          })
        );
      }
    }

    // Funnel: two angled walls narrowing from the guide walls down to one neck.
    // Starting points match edgeLeftX/edgeRightX exactly so there's no gap
    // where the boundary meets the taper.
    const funnel = [
      wallFromPoints(edgeLeftX, fTop, W / 2 - neckWidth / 2, fBottom, 8),
      wallFromPoints(edgeRightX, fTop, W / 2 + neckWidth / 2, fBottom, 8),
    ];

    // Single-file tube below the funnel where balls stack in arrival order
    const tube = [
      Bodies.rectangle(W / 2 - neckWidth / 2, (tubeTop + floorY) / 2, 6, floorY - tubeTop, {
        isStatic: true,
        render: { fillStyle: "#2c3253" },
      }),
      Bodies.rectangle(W / 2 + neckWidth / 2, (tubeTop + floorY) / 2, 6, floorY - tubeTop, {
        isStatic: true,
        render: { fillStyle: "#2c3253" },
      }),
    ];

    const floor = Bodies.rectangle(W / 2, floorY + 10, neckWidth + 20, 20, {
      isStatic: true,
      render: { fillStyle: "#232849" },
    });

    World.add(engine.world, [...walls, ...pegs, ...funnel, ...tube, floor]);

    runner = Runner.create();
    Runner.run(runner, engine);
    Render.run(render);

    Events.on(engine, "afterUpdate", checkFinishLine);
    Events.on(render, "afterRender", drawSpheres);

    boardBuilt = true;
    dropBtn.disabled = false;
    buildBtn.textContent = "Rebuild Board";
    setStatus(`Board ready: ${rows} peg rows funneling into one chute. Click <strong>Drop Balls</strong> when ready.`);
  }

  function parseNames(count) {
    const raw = namesInput.value.split("\n").map((s) => s.trim()).filter(Boolean);
    const names = [];
    for (let i = 0; i < count; i++) names.push(raw[i] || `Ball ${i + 1}`);
    return names;
  }

  function dropBalls() {
    if (!boardBuilt) return;
    const count = Math.max(1, Math.min(80, parseInt(ballCountInput.value, 10) || 1));
    const names = parseNames(count);
    balls = [];
    settledOrder = [];
    clearResults();
    dropBtn.disabled = true;
    buildBtn.disabled = true;
    setStatus(`${count} balls dropping at once…`);

    const centerLeft = (W - USABLE_WIDTH) / 2;
    const slotWidth = USABLE_WIDTH / count;
    // Shuffle spawn slots so ball order isn't correlated with starting position
    const slots = Array.from({ length: count }, (_, i) => i);
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }

    for (let i = 0; i < count; i++) {
      const slot = slots[i];
      const x = centerLeft + slotWidth * (slot + 0.5) + (Math.random() - 0.5) * slotWidth * 0.6;
      const y = 20 + Math.random() * 15;
      const hue = colorForIndex(i);
      const body = Bodies.circle(x, y, BALL_RADIUS, {
        restitution: BALL_RESTITUTION,
        friction: 0.01,
        frictionAir: 0.0004,
        density: 0.002,
        render: { visible: false },
      });
      Body.setVelocity(body, { x: (Math.random() - 0.5) * 1.2, y: 0 });
      World.add(engine.world, body);
      balls.push({ body, name: names[i], hue, rank: null, stuckFrames: 0 });
    }
  }

  function checkFinishLine() {
    if (!balls.length || settledOrder.length === balls.length) return;
    for (const b of balls) {
      if (b.rank !== null) continue;
      if (b.body.position.y >= finishLineY) {
        b.rank = settledOrder.length + 1;
        settledOrder.push(b);
        renderStandings();
        continue;
      }
      // Anti-jam: balls funneling above the neck can occasionally arch
      // and lock against each other (a real granular-flow phenomenon).
      // If a ball sits nearly still for too long before reaching the
      // finish line, nudge it to break the arch.
      const speed = Math.hypot(b.body.velocity.x, b.body.velocity.y);
      if (speed < 0.08) {
        b.stuckFrames++;
        if (b.stuckFrames > 70) {
          const m = b.body.mass;
          Body.applyForce(b.body, b.body.position, {
            x: (Math.random() - 0.5) * 0.01 * m,
            y: (0.004 + Math.random() * 0.006) * m,
          });
          b.stuckFrames = 0;
        }
      } else {
        b.stuckFrames = 0;
      }
    }
    if (settledOrder.length === balls.length) {
      dropBtn.disabled = false;
      buildBtn.disabled = false;
      setStatus(`All ${balls.length} balls are through the funnel — final standings below! Click <strong>Drop Balls</strong> to run again.`);
    }
  }

  function renderStandings() {
    resultsList.innerHTML = "";
    settledOrder.forEach((b) => {
      const li = document.createElement("li");
      li.className = `result-row rank-${b.rank}`;
      li.innerHTML = `
        <span class="rank">${b.rank}</span>
        <span class="swatch" style="background:hsl(${b.hue} 80% 62%)"></span>
        <span class="name">${escapeHtml(b.name)}</span>
      `;
      resultsList.appendChild(li);
    });
    const pending = balls.length - settledOrder.length;
    if (pending > 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = `${pending} ball${pending === 1 ? "" : "s"} still falling…`;
      resultsList.appendChild(li);
    }
  }

  // --- 3D-look rendering ---------------------------------------------

  function sphereGradient(ctx, x, y, r, hue) {
    const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.05);
    grad.addColorStop(0, `hsl(${hue} 95% 88%)`);
    grad.addColorStop(0.45, `hsl(${hue} 85% 62%)`);
    grad.addColorStop(1, `hsl(${hue} 70% 32%)`);
    return grad;
  }

  function drawSpheres() {
    if (!render) return;
    const ctx = render.context;

    // pegs as small steel spheres
    const pegBodies = Matter.Composite.allBodies(engine.world).filter((b) => b.plugin && b.plugin.isPeg);
    ctx.save();
    for (const p of pegBodies) {
      ctx.beginPath();
      ctx.fillStyle = sphereGradient(ctx, p.position.x, p.position.y, PEG_RADIUS, 220);
      ctx.arc(p.position.x, p.position.y, PEG_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // balls as glossy 3D spheres, with a rank tag once they've crossed the finish line
    ctx.save();
    for (const b of balls) {
      const { x, y } = b.body.position;
      ctx.beginPath();
      ctx.fillStyle = sphereGradient(ctx, x, y, BALL_RADIUS, b.hue);
      ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `hsl(${b.hue} 60% 20%)`;
      ctx.stroke();

      if (b.rank !== null) {
        ctx.font = "bold 12px system-ui, sans-serif";
        ctx.fillStyle = "#e9ebf7";
        ctx.textBaseline = "middle";
        ctx.fillText(`#${b.rank}`, x + neckWidth / 2 + 10, y);
      }
    }
    ctx.restore();
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  buildBtn.addEventListener("click", buildBoard);
  dropBtn.addEventListener("click", dropBalls);
  resetBtn.addEventListener("click", () => {
    teardownBoard();
    clearResults();
    dropBtn.disabled = true;
    buildBtn.disabled = false;
    buildBtn.textContent = "Build Board";
    setStatus("Set your options and click <strong>Build Board</strong> to begin.");
  });
})();
