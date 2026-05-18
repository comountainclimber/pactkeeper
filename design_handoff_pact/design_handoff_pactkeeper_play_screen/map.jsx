// Map renderer: tile grid + path + props

// Grass tile generator — returns a sprite array for variation
const TILE = 16; // logical pixels per tile

const grassPalette = {
  '.': null,
  '1': '#3d5e22', // shadow
  '2': '#4a7530', // base dark
  '3': '#5a8a3a', // base
  '4': '#6a9a44', // base light
  '5': '#7aaa54', // highlight
  '6': '#3a4520', // ominous tinge
  '7': '#8aaa60', // bright tuft
};

const pathPalette = {
  '.': null,
  '1': '#2a1a10', // outline
  '2': '#4a2e18', // very dark dirt
  '3': '#6a4520', // dark dirt
  '4': '#8a6030', // mid dirt
  '5': '#a07840', // light dirt
  '6': '#3a2820', // pebble dark
  '7': '#7a6450', // pebble
  '8': '#1a1014', // ominous shadow
};

// Generate varied grass tile (deterministic per coord)
function grassTile(seed) {
  const rng = mulberry32(seed);
  const rows = [];
  for (let y = 0; y < TILE; y++) {
    let r = '';
    for (let x = 0; x < TILE; x++) {
      const n = rng();
      if (n < 0.65) r += '3';
      else if (n < 0.8) r += '4';
      else if (n < 0.9) r += '2';
      else if (n < 0.95) r += '5';
      else r += '1';
    }
    rows.push(r);
  }
  // add a few tufts
  const tufts = Math.floor(rng() * 3);
  for (let t = 0; t < tufts; t++) {
    const tx = Math.floor(rng() * (TILE - 2)) + 1;
    const ty = Math.floor(rng() * (TILE - 2)) + 1;
    rows[ty] = rows[ty].substring(0, tx) + '7' + rows[ty].substring(tx + 1);
    rows[ty + 1] = rows[ty + 1].substring(0, tx) + '5' + rows[ty + 1].substring(tx + 1);
  }
  return rows;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Path tile: dirt with edge shading depending on which neighbours are path
function pathTile(seed, edges) {
  const rng = mulberry32(seed);
  const rows = [];
  for (let y = 0; y < TILE; y++) {
    let r = '';
    for (let x = 0; x < TILE; x++) {
      const n = rng();
      let ch;
      if (n < 0.55) ch = '4';
      else if (n < 0.75) ch = '3';
      else if (n < 0.88) ch = '5';
      else if (n < 0.95) ch = '7';
      else ch = '2';
      r += ch;
    }
    rows.push(r);
  }
  // pebbles
  for (let p = 0; p < 2; p++) {
    const px = 2 + Math.floor(rng() * (TILE - 4));
    const py = 2 + Math.floor(rng() * (TILE - 4));
    rows[py] = rows[py].substring(0, px) + '7' + rows[py].substring(px + 1);
    rows[py + 1] = rows[py + 1].substring(0, px) + '6' + rows[py + 1].substring(px + 1);
  }
  // Edge shading
  const setPix = (x, y, ch) => {
    if (x < 0 || x >= TILE || y < 0 || y >= TILE) return;
    rows[y] = rows[y].substring(0, x) + ch + rows[y].substring(x + 1);
  };
  // Where there's NO neighbour path, draw a darker grass-meeting edge
  if (!edges.n) {
    for (let x = 0; x < TILE; x++) {
      setPix(x, 0, '2');
      setPix(x, 1, '3');
    }
  }
  if (!edges.s) {
    for (let x = 0; x < TILE; x++) {
      setPix(x, TILE - 1, '2');
      setPix(x, TILE - 2, '3');
    }
  }
  if (!edges.w) {
    for (let y = 0; y < TILE; y++) {
      setPix(0, y, '2');
      setPix(1, y, '3');
    }
  }
  if (!edges.e) {
    for (let y = 0; y < TILE; y++) {
      setPix(TILE - 1, y, '2');
      setPix(TILE - 2, y, '3');
    }
  }
  // Corner darkening (where two non-neighbours meet)
  if (!edges.n && !edges.w) setPix(0, 0, '1');
  if (!edges.n && !edges.e) setPix(TILE - 1, 0, '1');
  if (!edges.s && !edges.w) setPix(0, TILE - 1, '1');
  if (!edges.s && !edges.e) setPix(TILE - 1, TILE - 1, '1');
  return rows;
}

// MAP CONFIG ---------------------------------------------------
const COLS = 22;
const ROWS = 14;

// Path waypoints in tile coords (centre of tile)
const WAYPOINTS = [
  [-1, 3],
  [4, 3],
  [4, 7],
  [9, 7],
  [9, 4],
  [14, 4],
  [14, 10],
  [22, 10],
];

// Build set of path tiles by walking the waypoints
function buildPathTiles() {
  const tiles = new Set();
  const order = [];
  for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    const [ax, ay] = WAYPOINTS[i];
    const [bx, by] = WAYPOINTS[i + 1];
    const dx = Math.sign(bx - ax);
    const dy = Math.sign(by - ay);
    let x = ax, y = ay;
    while (x !== bx || y !== by) {
      const key = `${x},${y}`;
      if (!tiles.has(key)) {
        tiles.add(key);
        order.push([x, y]);
      }
      if (x !== bx) x += dx;
      else if (y !== by) y += dy;
    }
    const key = `${bx},${by}`;
    if (!tiles.has(key)) { tiles.add(key); order.push([bx, by]); }
  }
  return { set: tiles, order };
}

const PATH = buildPathTiles();

function pathEdges(x, y) {
  return {
    n: PATH.set.has(`${x},${y - 1}`),
    s: PATH.set.has(`${x},${y + 1}`),
    w: PATH.set.has(`${x - 1},${y}`),
    e: PATH.set.has(`${x + 1},${y}`),
  };
}

// Compute path length in pixels for enemy travel
function pathSegments() {
  const segs = [];
  let total = 0;
  for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    const [ax, ay] = WAYPOINTS[i];
    const [bx, by] = WAYPOINTS[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.abs(dx) + Math.abs(dy);
    segs.push({ ax, ay, bx, by, len, start: total });
    total += len;
  }
  return { segs, total };
}
const PATH_INFO = pathSegments();

// Given progress 0..1, return [tileX, tileY] in floating point along path
function pointOnPath(t) {
  const target = t * PATH_INFO.total;
  for (const s of PATH_INFO.segs) {
    if (target <= s.start + s.len) {
      const local = target - s.start;
      const dx = Math.sign(s.bx - s.ax);
      const dy = Math.sign(s.by - s.ay);
      return [s.ax + dx * local, s.ay + dy * local];
    }
  }
  const last = PATH_INFO.segs[PATH_INFO.segs.length - 1];
  return [last.bx, last.by];
}

Object.assign(window, {
  TILE, COLS, ROWS, PATH, WAYPOINTS, PATH_INFO, pointOnPath,
  grassTile, pathTile, pathEdges, grassPalette, pathPalette,
});
