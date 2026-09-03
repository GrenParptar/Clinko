// Clinko — a physics-driven Plinko-style randomizer built on Matter.js
// Drops N balls through a peg field; each ball settles into a bottom chute,
// and finishing places are derived from chute position (left→right by
// default) with arrival order breaking ties within a chute.

(function () {
  const { Engine, Render, Runner, World, Bodies, Body, Events, Composite } = Matter;

  const canvas = document.getElementById("board");
  const ballCountInput = document.getElementById("ballCount");
  const rowCountInput = document.getElementById("rowCount");
  const rowCountOut = document.getElementById("rowCountOut");
  const dropIntervalInput = document.getElementById("dropInterval");
  const dropIntervalOut = document.getElementById("dropIntervalOut");
  const reverseRankInput = document.getElementById("reverseRank");
  const namesInput = document.getElementById("names");
  const buildBtn = document.getElementById("buildBtn");
  const dropBtn = document.getElementById("dropBtn");
  const resetBtn = document.getElementById("resetBtn");
  const statusLine = document.getElementById("statusLine");
  const resultsList = document.getElementById("resultsList");

  rowCountInput.addEventListener("input", () => (rowCountOut.textContent = rowCountInput.value));
  dropIntervalInput.addEventListener("input", () => (dropIntervalOut.textContent = `${dropIntervalInput.value}ms`));

  const W = canvas.width;
  const H = canvas.height;
  const PEG_TOP = 90;
  const PEG_BOTTOM = H - 170;
  const CHUTE_TOP = H - 140;
  const CHUTE_FLOOR = H - 30;

  let engine, render, runner;
  let pegRadius = 6;
  let ballRadius = 9;
  let chuteCount = 11;
  let chuteWidth = W / chuteCount;
  let balls = []; // { body, name, color, settled, settleIndex, chute }
  let settledOrder = [];
  let dropTimer = null;
  let boardBuilt = false;

  const PALETTE_COUNT = 24;
  function colorForIndex(i) {
    const hue = Math.round((360 / PALETTE_COUNT) * (i % PALETTE_COUNT));
    return `hsl(${hue} 80% 62%)`;
  }

  function setStatus(msg) {
    statusLine.innerHTML = msg;
  }

  function clearResults() {
    resultsList.innerHTML = '<li class="empty">No balls have finished yet.</li>';
  }

  function teardownBoard() {
    if (dropTimer) {
      clearInterval(dropTimer);
      dropTimer = null;
    }
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

  function buildBoard() {
    teardownBoard();
    clearResults();

    const rows = parseInt(rowCountInput.value, 10);
    chuteCount = rows + 1;
    chuteWidth = W / chuteCount;

    engine = Engine.create();
    engine.gravity.y = 1;

    render = Render.create({
      canvas,
      engine,
      options: {
        width: W,
        height: H,
        wireframes: false,
        background: "#0a0c17",
      },
    });

    const wallOpts = { isStatic: true, render: { fillStyle: "#232849" } };
    const walls = [
      Bodies.rectangle(-10, H / 2, 20, H, wallOpts),
      Bodies.rectangle(W + 10, H / 2, 20, H, wallOpts),
    ];

    // Peg field: triangular grid, funnel-shaped (rows grow wider going down)
    const pegs = [];
    const rowGap = (PEG_BOTTOM - PEG_TOP) / (rows - 1);
    for (let r = 0; r < rows; r++) {
      const y = PEG_TOP + r * rowGap;
      const count = 3 + r; // widens each row
      const usableWidth = W * 0.86;
      const startX = (W - usableWidth) / 2 + (usableWidth / (count - 1 || 1)) * 0;
      const spacing = usableWidth / (Math.max(chuteCount - 1, count - 1));
      const rowWidth = spacing * (count - 1);
      const left = (W - rowWidth) / 2;
      for (let c = 0; c < count; c++) {
        const x = left + c * spacing;
        pegs.push(
          Bodies.circle(x, y, pegRadius, {
            isStatic: true,
            restitution: 0.5,
            friction: 0.05,
            render: { fillStyle: "#5da2ff" },
          })
        );
      }
    }

    // Bottom chute dividers
    const dividers = [];
    for (let i = 0; i <= chuteCount; i++) {
      const x = i * chuteWidth;
      dividers.push(
        Bodies.rectangle(x, (CHUTE_TOP + CHUTE_FLOOR) / 2, 4, CHUTE_FLOOR - CHUTE_TOP, {
          isStatic: true,
          render: { fillStyle: "#2c3253" },
        })
      );
    }

    const floor = Bodies.rectangle(W / 2, CHUTE_FLOOR + 10, W, 20, {
      isStatic: true,
      render: { fillStyle: "#232849" },
    });

    World.add(engine.world, [...walls, ...pegs, ...dividers, floor]);

    runner = Runner.create();
    Runner.run(runner, engine);
    Render.run(render);

    Events.on(engine, "afterUpdate", checkSettled);

    boardBuilt = true;
    dropBtn.disabled = false;
    buildBtn.textContent = "Rebuild Board";
    setStatus(`Board ready: ${rows} rows, ${chuteCount} chutes. Click <strong>Drop Balls</strong> when ready.`);
  }

  function parseNames(count) {
    const raw = namesInput.value.split("\n").map((s) => s.trim()).filter(Boolean);
    const names = [];
    for (let i = 0; i < count; i++) {
      names.push(raw[i] || `Ball ${i + 1}`);
    }
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
    setStatus(`Dropping ${count} balls…`);

    let i = 0;
    if (dropTimer) clearInterval(dropTimer);
    const interval = parseInt(dropIntervalInput.value, 10);
    dropTimer = setInterval(() => {
      if (i >= count) {
        clearInterval(dropTimer);
        dropTimer = null;
        return;
      }
      spawnBall(i, names[i]);
      i++;
    }, interval);
  }

  function spawnBall(index, name) {
    const jitter = (Math.random() - 0.5) * W * 0.12;
    const x = W / 2 + jitter;
    const y = 20;
    const color = colorForIndex(index);
    const body = Bodies.circle(x, y, ballRadius, {
      restitution: 0.55,
      friction: 0.02,
      frictionAir: 0.0008,
      density: 0.002,
      render: { fillStyle: color },
    });
    Body.setVelocity(body, { x: (Math.random() - 0.5) * 1.5, y: 0 });
    World.add(engine.world, body);
    balls.push({ body, name, color, settled: false, settleIndex: null, chute: null, restFrames: 0 });
  }

  function checkSettled() {
    if (!balls.length) return;
    let allSettled = true;
    for (const b of balls) {
      if (b.settled) continue;
      allSettled = false;
      const speed = Math.hypot(b.body.velocity.x, b.body.velocity.y);
      const nearFloor = b.body.position.y > CHUTE_TOP - 10;
      if (nearFloor && speed < 0.15) {
        b.restFrames++;
      } else {
        b.restFrames = 0;
      }
      if (b.restFrames > 18) {
        settleBall(b);
      }
    }
    if (allSettled && balls.length) {
      finishRound();
    }
  }

  function settleBall(b) {
    b.settled = true;
    b.settleIndex = settledOrder.length;
    b.chute = Math.min(chuteCount - 1, Math.max(0, Math.floor(b.body.position.x / chuteWidth)));
    settledOrder.push(b);
    renderStandings();
  }

  function finishRound() {
    dropBtn.disabled = false;
    buildBtn.disabled = false;
    setStatus(`All balls have settled! Final standings below. Click <strong>Drop Balls</strong> to run again, or <strong>Reset</strong> to reconfigure.`);
  }

  function renderStandings() {
    const reversed = reverseRankInput.checked;
    const sorted = [...settledOrder].sort((a, b) => {
      const chuteA = reversed ? chuteCount - 1 - a.chute : a.chute;
      const chuteB = reversed ? chuteCount - 1 - b.chute : b.chute;
      if (chuteA !== chuteB) return chuteA - chuteB;
      return a.settleIndex - b.settleIndex;
    });

    resultsList.innerHTML = "";
    sorted.forEach((b, i) => {
      const rank = i + 1;
      const li = document.createElement("li");
      li.className = `result-row rank-${rank}`;
      li.innerHTML = `
        <span class="rank">${rank}</span>
        <span class="swatch" style="background:${b.color}"></span>
        <span class="name">${escapeHtml(b.name)}</span>
        <span class="chute">chute ${b.chute + 1}</span>
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
  reverseRankInput.addEventListener("change", renderStandings);
})();
