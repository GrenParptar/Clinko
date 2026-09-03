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

  const W = 900;
  const PEG_TOP = 70;
  const ROW_GAP = 30;
  const USABLE_WIDTH = W * 0.82;
  const FUNNEL_GAP = 16;
  const FUNNEL_HEIGHT = 140;
  const BOTTOM_MARGIN = 30;

  const BALL_RADIUS = 9;
  const BALL_DIAMETER = BALL_RADIUS * 2;
  const PEG_RADIUS = 6;

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

    engine = Engine.create();
    engine.gravity.y = 1;

    render = Render.create({
      canvas,
      engine,
      options: { width: W, height: H, wireframes: false, background: "#0a0c17" },
    });

    const wallOpts = { isStatic: true, render: { fillStyle: "#232849" } };
    const walls = [
      Bodies.rectangle(-10, H / 2, 20, H, wallOpts),
      Bodies.rectangle(W + 10, H / 2, 20, H, wallOpts),
    ];

    // Peg field — a classic alternating Galton-board lattice for chaotic bouncing
    const pegs = [];
    const pegsPerRow = rows + 1;
    const pegSpacing = USABLE_WIDTH / pegsPerRow;
    const centerLeft = (W - USABLE_WIDTH) / 2;
    for (let r = 0; r < rows; r++) {
      const y = PEG_TOP + r * ROW_GAP;
      const offset = r % 2 === 0 ? pegSpacing / 2 : 0;
      const count = r % 2 === 0 ? pegsPerRow - 1 : pegsPerRow;
      for (let c = 0; c < count; c++) {
        const x = centerLeft + offset + c * pegSpacing;
        pegs.push(
          Bodies.circle(x, y, PEG_RADIUS, {
            isStatic: true,
            restitution: 0.5,
            friction: 0.05,
            render: { visible: false },
            plugin: { isPeg: true },
          })
        );
      }
    }

    // Funnel: two angled walls narrowing from the full peg field down to one neck
    const funnel = [
      wallFromPoints(centerLeft, fTop, W / 2 - neckWidth / 2, fBottom, 8),
      wallFromPoints(centerLeft + USABLE_WIDTH, fTop, W / 2 + neckWidth / 2, fBottom, 8),
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
        restitution: 0.55,
        friction: 0.02,
        frictionAir: 0.0008,
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
      if (speed < 0.12) {
        b.stuckFrames++;
        if (b.stuckFrames > 45) {
          Body.applyForce(b.body, b.body.position, {
            x: (Math.random() - 0.5) * 0.006,
            y: 0.002 + Math.random() * 0.004,
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
