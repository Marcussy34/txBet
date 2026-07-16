type Point = {
  x: number;
  y: number;
};

type Bolt = {
  paths: Point[][];
  color: string;
  duration: number;
  lineWidth: number;
  shadowBlur: number;
  startedAt: number;
};

type BeamArcBurstOptions = {
  yFraction: number;
  count?: number;
};

const ARC_RENDERING = {
  defaultCount: 2,
  dprCap: 2,
  durationMin: 150,
  durationMax: 220,
  lineWidthMin: 0.75,
  lineWidthMax: 1.5,
  shadowBlurMin: 4,
  shadowBlurMax: 6,
  boltLengthMin: 28,
  boltLengthMax: 48,
  mainDrift: 10,
  mainJitter: 8,
  branchLengthMin: 10,
  branchLengthMax: 20,
  branchCountMin: 1,
  branchCountMax: 2,
  subdivisionMin: 2,
  subdivisionMax: 3,
} as const;

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function randomInteger(min: number, max: number) {
  return Math.floor(randomBetween(min, max + 1));
}

function displaceMidpoints(start: Point, end: Point, levels: number, initialJitter: number) {
  let points = [start, end];
  let jitter = initialJitter;

  for (let level = 0; level < levels; level += 1) {
    const displaced: Point[] = [points[0]!];

    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index]!;
      const to = points[index + 1]!;
      const deltaX = to.x - from.x;
      const deltaY = to.y - from.y;
      const length = Math.hypot(deltaX, deltaY) || 1;
      const offset = randomBetween(-jitter, jitter);

      displaced.push({
        x: (from.x + to.x) / 2 + (-deltaY / length) * offset,
        y: (from.y + to.y) / 2 + (deltaX / length) * offset,
      });
      displaced.push(to);
    }

    points = displaced;
    jitter *= 0.52;
  }

  return points;
}

function createBolt(width: number, height: number, yFraction: number, color: string, startedAt: number): Bolt {
  const centerX = width / 2 + randomBetween(-3, 3);
  const anchorY = height * yFraction;
  const boltLength = randomBetween(ARC_RENDERING.boltLengthMin, ARC_RENDERING.boltLengthMax);
  const start = { x: centerX, y: anchorY - boltLength * 0.45 };
  const end = {
    x: centerX + randomBetween(-ARC_RENDERING.mainDrift, ARC_RENDERING.mainDrift),
    y: anchorY + boltLength * 0.55,
  };
  const mainPath = displaceMidpoints(
    start,
    end,
    randomInteger(ARC_RENDERING.subdivisionMin, ARC_RENDERING.subdivisionMax),
    ARC_RENDERING.mainJitter,
  );
  const branches = Array.from(
    { length: randomInteger(ARC_RENDERING.branchCountMin, ARC_RENDERING.branchCountMax) },
    () => {
      const branchStart = mainPath[randomInteger(1, mainPath.length - 2)]!;
      const direction = Math.random() < 0.5 ? -1 : 1;
      const branchLength = randomBetween(ARC_RENDERING.branchLengthMin, ARC_RENDERING.branchLengthMax);

      return displaceMidpoints(
        branchStart,
        {
          x: branchStart.x + direction * branchLength,
          y: branchStart.y + randomBetween(branchLength * 0.25, branchLength * 0.7),
        },
        ARC_RENDERING.subdivisionMin,
        ARC_RENDERING.mainJitter * 0.45,
      );
    },
  );

  return {
    paths: [mainPath, ...branches],
    color,
    duration: randomBetween(ARC_RENDERING.durationMin, ARC_RENDERING.durationMax),
    lineWidth: randomBetween(ARC_RENDERING.lineWidthMin, ARC_RENDERING.lineWidthMax),
    shadowBlur: randomBetween(ARC_RENDERING.shadowBlurMin, ARC_RENDERING.shadowBlurMax),
    startedAt,
  };
}

export function createBeamArcs(canvas: HTMLCanvasElement): {
  burst(opts: BeamArcBurstOptions): void;
  destroy(): void;
} {
  const context = canvas.getContext("2d");
  if (!context) return { burst: () => undefined, destroy: () => undefined };

  let activeBolts: Bolt[] = [];
  let animationFrame: number | null = null;
  let destroyed = false;
  let width = 1;
  let height = 1;
  let dpr = 1;

  const clear = () => context.clearRect(0, 0, width, height);

  const resize = () => {
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    dpr = Math.min(window.devicePixelRatio || 1, ARC_RENDERING.dprCap);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const render = (now: number) => {
    activeBolts = activeBolts.filter((bolt) => now - bolt.startedAt < bolt.duration);
    clear();

    if (activeBolts.length === 0) {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
      return;
    }

    context.save();
    for (const bolt of activeBolts) {
      const progress = (now - bolt.startedAt) / bolt.duration;
      // A restrained flicker keeps the tiny discharge from reading as a static line.
      context.globalAlpha = Math.max(0, 1 - progress) * randomBetween(0.72, 1);
      context.strokeStyle = bolt.color;
      context.lineWidth = bolt.lineWidth;
      context.shadowColor = bolt.color;
      context.shadowBlur = bolt.shadowBlur;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();

      for (const path of bolt.paths) {
        const first = path[0];
        if (!first) continue;
        context.moveTo(first.x, first.y);
        for (const point of path.slice(1)) context.lineTo(point.x, point.y);
      }

      context.stroke();
    }
    context.restore();
    animationFrame = window.requestAnimationFrame(render);
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  return {
    burst({ yFraction, count = ARC_RENDERING.defaultCount }) {
      if (destroyed) return;
      const color = getComputedStyle(canvas).color;
      const startedAt = performance.now();
      const boltCount = Math.max(1, Math.round(count));

      activeBolts.push(
        ...Array.from({ length: boltCount }, () => createBolt(width, height, yFraction, color, startedAt)),
      );

      // The canvas owns no idle loop; a burst is the only thing that wakes rAF.
      if (animationFrame === null) animationFrame = window.requestAnimationFrame(render);
    },
    destroy() {
      destroyed = true;
      activeBolts = [];
      resizeObserver.disconnect();
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
      clear();
    },
  };
}
