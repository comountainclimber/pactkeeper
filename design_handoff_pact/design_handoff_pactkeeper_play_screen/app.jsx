// Main App: pixel TD play screen

const SCALE = 3; // CSS scale: 1 logical px → 3 screen px
const MAP_W = COLS * TILE; // 22*16 = 352 logical, 1056 screen
const MAP_H = ROWS * TILE; // 14*16 = 224 logical, 672 screen

// --------- Static map canvas ---------
function MapCanvas() {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    // Draw every tile
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const isPath = PATH.set.has(`${x},${y}`);
        const sprite = isPath
          ? pathTile(x * 73 + y * 31 + 7, pathEdges(x, y))
          : grassTile(x * 91 + y * 17 + 13);
        const pal = isPath ? pathPalette : grassPalette;
        for (let py = 0; py < TILE; py++) {
          for (let px = 0; px < TILE; px++) {
            const ch = sprite[py][px];
            const col = pal[ch];
            if (!col) continue;
            ctx.fillStyle = col;
            ctx.fillRect(x * TILE + px, y * TILE + py, 1, 1);
          }
        }
      }
    }
  }, []);
  return (
    <canvas
      ref={ref}
      width={MAP_W}
      height={MAP_H}
      style={{
        width: MAP_W * SCALE,
        height: MAP_H * SCALE,
        imageRendering: 'pixelated',
        display: 'block',
        position: 'absolute',
        top: 0,
        left: 0,
      }}
    />
  );
}

// --------- Props: trees, rocks, torches ---------
const PROPS = [
  // [type, tileX, tileY, offsetX, offsetY]
  ['tree', 1, 1, 0, 0],
  ['tree', 2, 0, 4, 4],
  ['tree', 7, 0, 0, 0],
  ['tree', 12, 1, 0, 0],
  ['tree', 18, 0, 0, 4],
  ['tree', 20, 2, 0, 0],
  ['tree', 0, 6, 0, 0],
  ['tree', 1, 8, 4, 0],
  ['tree', 12, 12, 0, 0],
  ['tree', 17, 11, 0, 0],
  ['tree', 19, 12, 4, 0],
  ['tree', 7, 11, 0, 0],
  ['tree', 6, 12, 6, 4],
  ['rock', 6, 5, 4, 4],
  ['rock', 16, 6, 0, 4],
  ['rock', 3, 11, 4, 4],
  ['rock', 11, 0, 2, 4],
  ['rock', 13, 8, 0, 4],
  ['torch', 3, 2, 4, 8],
  ['torch', 5, 6, 8, 4],
  ['torch', 10, 6, 8, 4],
  ['torch', 14, 5, 4, 8],
  ['torch', 14, 9, 4, 0],
];

function PropsLayer() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      width: MAP_W * SCALE, height: MAP_H * SCALE,
      pointerEvents: 'none',
    }}>
      {PROPS.map((p, i) => {
        const [name, tx, ty, ox, oy] = p;
        return (
          <div key={i} style={{
            position: 'absolute',
            left: (tx * TILE + ox) * SCALE,
            top: (ty * TILE + oy) * SCALE,
          }}>
            <Sprite name={name} scale={SCALE} />
            {name === 'torch' && (
              <div style={{
                position: 'absolute',
                width: 80, height: 80,
                left: -28, top: -28,
                background: 'radial-gradient(circle, rgba(255,160,60,0.35), rgba(255,140,40,0) 60%)',
                pointerEvents: 'none',
                animation: `flicker 0.4s ease-in-out infinite alternate`,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// --------- Ominous path glow overlay ---------
function PathGlow() {
  // Sample a few points along path and draw soft purple haze
  const samples = [];
  for (let i = 0; i < 30; i++) {
    samples.push(pointOnPath(i / 29));
  }
  return (
    <svg
      width={MAP_W * SCALE}
      height={MAP_H * SCALE}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'multiply', opacity: 0.55 }}
    >
      <defs>
        <radialGradient id="ompoint" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#3a2050" stopOpacity="0.0" />
          <stop offset="40%" stopColor="#1a1030" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#0a0a18" stopOpacity="0" />
        </radialGradient>
      </defs>
      {samples.map(([x, y], i) => (
        <circle
          key={i}
          cx={(x + 0.5) * TILE * SCALE}
          cy={(y + 0.5) * TILE * SCALE}
          r={TILE * SCALE * 1.6}
          fill="url(#ompoint)"
        />
      ))}
    </svg>
  );
}

// Vignette covering whole map
function Vignette() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      width: MAP_W * SCALE, height: MAP_H * SCALE,
      background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.45) 100%)',
      pointerEvents: 'none',
    }} />
  );
}

// --------- Towers ---------
const TOWERS = [
  { type: 'archer',  tx: 2,  ty: 5, range: 4.2, rate: 700, dmg: 8 },
  { type: 'archer',  tx: 11, ty: 2, range: 4,   rate: 700, dmg: 8 },
  { type: 'cannon',  tx: 7,  ty: 8, range: 3.4, rate: 1400, dmg: 22 },
  { type: 'frost',   tx: 12, ty: 6, range: 3.6, rate: 1100, dmg: 4 },
];

const TOWER_META = {
  archer: { name: 'Archer Roost', cost: 60, sprite: 'archerTower', accent: '#c93a3a',
            desc: 'Quick single-target arrows. Cheap.', hotkey: '1' },
  cannon: { name: 'Bombard',      cost: 110, sprite: 'cannonTower', accent: '#c98a3a',
            desc: 'Heavy splash damage. Slow.', hotkey: '2' },
  frost:  { name: 'Frost Spire',  cost: 140, sprite: 'frostTower', accent: '#7ad4e8',
            desc: 'Chills enemies, slowing them.', hotkey: '3' },
};

function Tower({ t }) {
  const meta = TOWER_META[t.type];
  // Anchor: tower occupies a 1x1 tile, but sprite is 16x16 placed centered with a small upward offset
  const px = (t.tx * TILE) * SCALE;
  const py = (t.ty * TILE - 6) * SCALE; // lift slightly for "perspective"
  return (
    <div style={{ position: 'absolute', left: px, top: py, pointerEvents: 'none' }}>
      {/* Range ring */}
      <div style={{
        position: 'absolute',
        left: TILE * SCALE / 2 - t.range * TILE * SCALE,
        top:  (TILE * SCALE / 2 + 6 * SCALE) - t.range * TILE * SCALE,
        width:  t.range * 2 * TILE * SCALE,
        height: t.range * 2 * TILE * SCALE,
        borderRadius: '50%',
        border: `2px dashed ${meta.accent}66`,
        background: `radial-gradient(circle, ${meta.accent}10 30%, ${meta.accent}05 70%, transparent 100%)`,
        boxShadow: `inset 0 0 30px ${meta.accent}22`,
      }} />
      {/* Shadow */}
      <div style={{
        position: 'absolute',
        left: 2 * SCALE, top: 14 * SCALE,
        width: 12 * SCALE, height: 4 * SCALE,
        borderRadius: '50%',
        background: 'rgba(0,0,0,0.45)',
        filter: 'blur(2px)',
      }} />
      <Sprite name={meta.sprite} scale={SCALE} />
    </div>
  );
}

// --------- Enemies ---------
function Enemy({ e }) {
  const [x, y] = pointOnPath(e.t);
  const left = (x * TILE + 0) * SCALE;
  const top  = (y * TILE - 6) * SCALE;
  const hpPct = Math.max(0, e.hp / e.maxHp);
  const isChilled = e.chillUntil && e.chillUntil > performance.now();
  return (
    <div style={{
      position: 'absolute',
      left, top,
      pointerEvents: 'none',
      transform: 'translateZ(0)',
      filter: isChilled ? 'hue-rotate(180deg) brightness(1.05)' : 'none',
    }}>
      {/* Shadow */}
      <div style={{
        position: 'absolute',
        left: 4 * SCALE, top: 14 * SCALE,
        width: 8 * SCALE, height: 3 * SCALE,
        borderRadius: '50%',
        background: 'rgba(0,0,0,0.5)',
        filter: 'blur(1.5px)',
      }} />
      <div style={{
        animation: `bob 0.4s ease-in-out infinite alternate`,
        animationDelay: `${(e.id * 73) % 400}ms`,
      }}>
        <Sprite name={e.type} scale={SCALE} />
      </div>
      {/* HP bar */}
      <div style={{
        position: 'absolute', left: 2 * SCALE, top: -2 * SCALE,
        width: 12 * SCALE, height: 2 * SCALE,
        background: '#1a1010', border: '1px solid #000',
      }}>
        <div style={{
          width: `${hpPct * 100}%`,
          height: '100%',
          background: hpPct > 0.5 ? '#5acc3a' : hpPct > 0.25 ? '#e8c440' : '#e83a3a',
        }} />
      </div>
      {isChilled && (
        <div style={{
          position: 'absolute', left: 6 * SCALE, top: 4 * SCALE,
          width: 4 * SCALE, height: 4 * SCALE,
          fontSize: 14, color: '#9ae0ec', textShadow: '0 0 4px #4a9ab8',
        }}>❄</div>
      )}
    </div>
  );
}

// --------- Projectiles ---------
function Projectile({ p }) {
  const left = p.x * SCALE;
  const top  = p.y * SCALE;
  const colors = {
    arrow: '#3a2510',
    cannon: '#1a1010',
    frost: '#7ad4e8',
  };
  if (p.kind === 'arrow') {
    return (
      <div style={{
        position: 'absolute', left, top,
        width: 5 * SCALE, height: 1 * SCALE,
        background: colors.arrow,
        transform: `rotate(${p.angle}rad)`,
        transformOrigin: 'left center',
        boxShadow: '0 0 2px rgba(0,0,0,0.4)',
      }} />
    );
  }
  if (p.kind === 'cannon') {
    return (
      <div style={{
        position: 'absolute', left, top,
        width: 3 * SCALE, height: 3 * SCALE,
        background: colors.cannon,
        borderRadius: '50%',
        boxShadow: `0 0 ${4 * SCALE}px rgba(255,140,40,0.6), inset -1px -1px 0 #555`,
      }} />
    );
  }
  if (p.kind === 'frost') {
    return (
      <div style={{
        position: 'absolute', left, top,
        width: 4 * SCALE, height: 4 * SCALE,
        background: colors.frost,
        clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
        boxShadow: `0 0 ${4 * SCALE}px #7ad4e8`,
      }} />
    );
  }
  return null;
}

// --------- Floating damage numbers ---------
function FloatingText({ f }) {
  return (
    <div style={{
      position: 'absolute',
      left: f.x * SCALE, top: f.y * SCALE,
      color: f.color || '#ffe070',
      fontFamily: '"Press Start 2P", monospace',
      fontSize: 11,
      textShadow: '1px 1px 0 #000',
      pointerEvents: 'none',
      animation: 'floatUp 0.9s ease-out forwards',
    }}>
      {f.text}
    </div>
  );
}

// --------- Castle gate at end of path ---------
function CastleGate() {
  // last waypoint is (22, 10) — that's off the right edge. Place a small castle at right edge.
  return (
    <div style={{
      position: 'absolute',
      left: (21 * TILE - 4) * SCALE,
      top: (8 * TILE - 4) * SCALE,
      pointerEvents: 'none',
    }}>
      <Sprite data={CASTLE} palette={PALETTES.castle} scale={SCALE} />
    </div>
  );
}

// --------- Spawn portal at start of path ---------
function SpawnPortal() {
  return (
    <div style={{
      position: 'absolute',
      left: (-1 * TILE + 4) * SCALE,
      top: (3 * TILE) * SCALE,
      pointerEvents: 'none',
    }}>
      <div style={{
        width: 14 * SCALE, height: 14 * SCALE,
        borderRadius: '50%',
        background: 'radial-gradient(circle, #6b3a8a 20%, #2a1040 60%, transparent 100%)',
        boxShadow: '0 0 24px #6b3a8a, inset 0 0 12px #1a0828',
        animation: 'pulse 1.6s ease-in-out infinite',
      }} />
    </div>
  );
}

// --------- Game state hook ---------
function useGame() {
  const [enemies, setEnemies] = React.useState(() => seedEnemies());
  const [projectiles, setProjectiles] = React.useState([]);
  const [floats, setFloats] = React.useState([]);
  const lastFire = React.useRef({});

  function seedEnemies() {
    return [
      { id: 1, type: 'orc',      t: 0.08, speed: 0.018, hp: 60, maxHp: 60 },
      { id: 2, type: 'goblin',   t: 0.18, speed: 0.026, hp: 30, maxHp: 30 },
      { id: 3, type: 'goblin',   t: 0.24, speed: 0.026, hp: 30, maxHp: 30 },
      { id: 4, type: 'orc',      t: 0.36, speed: 0.018, hp: 60, maxHp: 50 },
      { id: 5, type: 'skeleton', t: 0.48, speed: 0.022, hp: 45, maxHp: 45 },
      { id: 6, type: 'goblin',   t: 0.58, speed: 0.026, hp: 30, maxHp: 30 },
      { id: 7, type: 'orc',      t: 0.72, speed: 0.018, hp: 60, maxHp: 60 },
      { id: 8, type: 'skeleton', t: 0.83, speed: 0.022, hp: 45, maxHp: 30 },
    ];
  }

  React.useEffect(() => {
    let raf;
    let last = performance.now();
    let nextId = 100;
    function loop(now) {
      const dt = Math.min(50, now - last) / 1000;
      last = now;
      // Move enemies
      setEnemies(prev => prev
        .map(e => {
          const chilled = e.chillUntil && e.chillUntil > now;
          const speed = chilled ? e.speed * 0.45 : e.speed;
          return { ...e, t: e.t + speed * dt };
        })
        .filter(e => e.t < 1 && e.hp > 0)
      );

      // Tower firing
      setEnemies(prevEnemies => {
        if (prevEnemies.length === 0) return prevEnemies;
        const newProjectiles = [];
        TOWERS.forEach((tw, i) => {
          const meta = TOWER_META[tw.type];
          const key = `tw${i}`;
          const last = lastFire.current[key] || 0;
          if (now - last < tw.rate) return;
          // Find nearest enemy in range
          const twCx = tw.tx + 0.5;
          const twCy = tw.ty + 0.5;
          let target = null, bestDist = tw.range;
          for (const e of prevEnemies) {
            const [ex, ey] = pointOnPath(e.t);
            const d = Math.hypot(ex + 0.5 - twCx, ey + 0.5 - twCy);
            if (d < bestDist) { bestDist = d; target = e; }
          }
          if (!target) return;
          lastFire.current[key] = now;
          const [ex, ey] = pointOnPath(target.t);
          const fromX = (tw.tx + 0.5) * TILE;
          const fromY = (tw.ty - 0.2) * TILE; // a bit above top
          const toX = (ex + 0.5) * TILE;
          const toY = (ey + 0.3) * TILE;
          newProjectiles.push({
            id: nextId++,
            kind: tw.type === 'archer' ? 'arrow' : tw.type === 'cannon' ? 'cannon' : 'frost',
            x: fromX, y: fromY, toX, toY,
            angle: Math.atan2(toY - fromY, toX - fromX),
            speed: tw.type === 'cannon' ? 220 : tw.type === 'frost' ? 280 : 380,
            dmg: tw.dmg,
            tower: tw.type,
            targetId: target.id,
          });
        });
        if (newProjectiles.length) {
          setProjectiles(p => [...p, ...newProjectiles]);
        }
        return prevEnemies;
      });

      // Move projectiles
      setProjectiles(prev => {
        const survivors = [];
        const hits = [];
        for (const p of prev) {
          const dx = p.toX - p.x;
          const dy = p.toY - p.y;
          const dist = Math.hypot(dx, dy);
          const step = p.speed * dt;
          if (dist <= step) {
            hits.push(p);
          } else {
            p.x += (dx / dist) * step;
            p.y += (dy / dist) * step;
            survivors.push(p);
          }
        }
        if (hits.length) {
          setEnemies(es => es.map(e => {
            for (const h of hits) {
              if (h.targetId === e.id) {
                const newHp = Math.max(0, e.hp - h.dmg);
                const chillUntil = h.tower === 'frost' ? now + 1500 : e.chillUntil;
                setFloats(f => [...f, {
                  id: Math.random(),
                  x: h.toX, y: h.toY - 8,
                  text: `-${h.dmg}`,
                  color: h.tower === 'frost' ? '#9ae0ec' : h.tower === 'cannon' ? '#ffb060' : '#ffe070',
                  born: now,
                }]);
                return { ...e, hp: newHp, chillUntil };
              }
            }
            return e;
          }));
        }
        return survivors;
      });

      // Clean floats
      setFloats(f => f.filter(x => now - x.born < 900));

      // Respawn dead enemies (loop the demo)
      setEnemies(prev => {
        if (prev.length < 4 && Math.random() < 0.012) {
          const types = ['orc', 'goblin', 'skeleton'];
          const type = types[Math.floor(Math.random() * 3)];
          const hp = type === 'orc' ? 60 : type === 'skeleton' ? 45 : 30;
          const speed = type === 'orc' ? 0.018 : type === 'skeleton' ? 0.022 : 0.026;
          return [...prev, { id: nextId++, type, t: 0, hp, maxHp: hp, speed }];
        }
        return prev;
      });

      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { enemies, projectiles, floats };
}

// --------- HUD ---------
function HUD({ selected, setSelected, gold }) {
  const lives = 18;
  const wave = 3;
  const totalWaves = 5;
  const waveProgress = 0.42;

  return (
    <div className="hud">
      <div className="hud-header">
        <div className="hud-title">
          <div className="hud-title-main">PACTKEEPER</div>
          <div className="hud-title-sub">— Defend the Pact —</div>
        </div>
      </div>

      <div className="stat-row">
        <Stat icon="❤" label="LIVES" value={lives} color="#e84040" />
        <Stat icon="◈" label="GOLD" value={gold} color="#e8c440" />
      </div>

      <div className="wave-card">
        <div className="wave-card-top">
          <div>
            <div className="wave-label">WAVE</div>
            <div className="wave-count">
              <span className="wave-big">{wave}</span>
              <span className="wave-of">/{totalWaves}</span>
            </div>
          </div>
          <div className="wave-pip-row">
            {Array.from({ length: totalWaves }).map((_, i) => (
              <div
                key={i}
                className={`wave-pip ${i < wave - 1 ? 'done' : i === wave - 1 ? 'active' : ''}`}
              />
            ))}
          </div>
        </div>
        <div className="wave-bar">
          <div className="wave-bar-fill" style={{ width: `${waveProgress * 100}%` }} />
          <div className="wave-bar-shimmer" />
        </div>
        <div className="wave-meta">
          <span className="enemy-dot" /> 12 remaining
          <span className="dot-sep">·</span>
          <span style={{ color: '#7a3050' }}>Boss in Wave 5</span>
        </div>
      </div>

      <div className="picker">
        <div className="picker-label">
          <span>BUILD</span>
          <span className="picker-hint">[1] [2] [3]</span>
        </div>
        {Object.entries(TOWER_META).map(([type, meta]) => {
          const affordable = gold >= meta.cost;
          const isSelected = selected === type;
          return (
            <button
              key={type}
              className={`tower-card ${isSelected ? 'selected' : ''} ${!affordable ? 'locked' : ''}`}
              onClick={() => setSelected(isSelected ? null : type)}
              style={{ '--accent': meta.accent }}
            >
              <div className="tower-card-sprite">
                <Sprite name={meta.sprite} scale={2} />
              </div>
              <div className="tower-card-body">
                <div className="tower-card-name">{meta.name}</div>
                <div className="tower-card-desc">{meta.desc}</div>
                <div className="tower-card-cost">
                  <span className="coin">◈</span>
                  <span className={affordable ? '' : 'cost-bad'}>{meta.cost}</span>
                </div>
              </div>
              <div className="tower-card-key">{meta.hotkey}</div>
            </button>
          );
        })}
      </div>

      <div className="hud-footer">
        <button className="btn btn-ghost">
          <span className="btn-icon">⏸</span>
          PAUSE
        </button>
        <button className="btn btn-primary">
          <span className="btn-icon">▶▶</span>
          FAST FORWARD
        </button>
      </div>

      <div className="hud-tip">
        <div className="tip-glyph">!</div>
        <div>
          <b>Goblins</b> are fast but fragile. <br />
          Use <span style={{ color: '#7ad4e8' }}>Frost Spires</span> on the long stretches.
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, color }) {
  return (
    <div className="stat">
      <div className="stat-icon" style={{ color }}>{icon}</div>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
      </div>
    </div>
  );
}

// --------- App ---------
function App() {
  const [selected, setSelected] = React.useState('frost');
  const [gold, setGold] = React.useState(245);
  const { enemies, projectiles, floats } = useGame();

  // Cursor follow for ghost preview
  const [cursor, setCursor] = React.useState(null);
  function onMapMove(ev) {
    if (!selected) { setCursor(null); return; }
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / SCALE;
    const y = (ev.clientY - rect.top) / SCALE;
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    setCursor({ tx, ty });
  }
  function onMapLeave() { setCursor(null); }
  function onMapClick() {
    if (!selected || !cursor) return;
    const meta = TOWER_META[selected];
    if (gold < meta.cost) return;
    if (PATH.set.has(`${cursor.tx},${cursor.ty}`)) return;
    setGold(g => g - meta.cost);
    TOWERS.push({ type: selected, tx: cursor.tx, ty: cursor.ty, range: 4, rate: 800, dmg: 10 });
  }

  return (
    <div className="game">
      <div
        className="map-frame"
        onMouseMove={onMapMove}
        onMouseLeave={onMapLeave}
        onClick={onMapClick}
        style={{ width: MAP_W * SCALE, height: MAP_H * SCALE }}
      >
        <MapCanvas />
        <PathGlow />
        <SpawnPortal />
        <CastleGate />
        <PropsLayer />
        {TOWERS.map((t, i) => <Tower key={i} t={t} />)}
        {enemies.map(e => <Enemy key={e.id} e={e} />)}
        {projectiles.map(p => <Projectile key={p.id} p={p} />)}
        {floats.map(f => <FloatingText key={f.id} f={f} />)}
        {cursor && selected && (
          <GhostTower
            type={selected}
            tx={cursor.tx}
            ty={cursor.ty}
            valid={!PATH.set.has(`${cursor.tx},${cursor.ty}`) && gold >= TOWER_META[selected].cost}
          />
        )}
        <Vignette />
        <MapBadge wave={3} />
      </div>
      <HUD selected={selected} setSelected={setSelected} gold={gold} />
    </div>
  );
}

function MapBadge({ wave }) {
  return (
    <div className="map-badge">
      <div className="map-badge-wave">WAVE {wave}</div>
      <div className="map-badge-name">— Embergrass Pass —</div>
    </div>
  );
}

function GhostTower({ type, tx, ty, valid }) {
  const meta = TOWER_META[type];
  return (
    <div style={{
      position: 'absolute',
      left: tx * TILE * SCALE,
      top: (ty * TILE - 6) * SCALE,
      pointerEvents: 'none',
      opacity: 0.75,
      filter: valid ? 'none' : 'sepia(1) hue-rotate(-50deg) brightness(0.9)',
    }}>
      <div style={{
        position: 'absolute',
        left: TILE * SCALE / 2 - 4 * TILE * SCALE,
        top:  (TILE * SCALE / 2 + 6 * SCALE) - 4 * TILE * SCALE,
        width:  8 * TILE * SCALE,
        height: 8 * TILE * SCALE,
        borderRadius: '50%',
        border: `2px dashed ${valid ? meta.accent : '#e83a3a'}aa`,
        background: `radial-gradient(circle, ${valid ? meta.accent : '#e83a3a'}15 30%, transparent 70%)`,
      }} />
      <Sprite name={meta.sprite} scale={SCALE} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
