// Vite supports importing CSS for side effects; declare the module so TS is happy.
declare module "*.css";

interface PactkeeperSFXInstance {
  arrow(): void;
  cannonFire(): void;
  frostFire(): void;
  towerHeal(): void;
  orcDie(): void;
  goblinDie(): void;
  skeletonDie(): void;
  batDie(): void;
  /** Played on dragon death. Layered chest rumble + breath + ember crackle. */
  dragonRoar(): void;
  wraithAttack(): void;
  wraithDie(): void;
  /** Played when the octopus slams a tower with a tentacle. Wet meaty hit; distinct from any other SFX. */
  octopusSlam(): void;
  /** Played on octopus death. Deflating wet wheeze with a noise tail. */
  octopusDie(): void;
  wax(): void;
  tick(): void;
  thud(): void;
  seal(): void;
  hover(): void;
  /** Played by the Knight hero on each melee swing. */
  knightAttack(): void;
  /** Played by the Archer hero on each bow shot. Distinct from `arrow()`
   * so the player can hear when the hero (vs. a tower) is firing. */
  archerShoot(): void;
  /** Played by the Frost Magus hero on each chill projectile. */
  mageFreeze(): void;
  /** Played once when the hero's HP reaches zero. Heavy, telegraphs the
   * respawn delay. */
  heroDeath(): void;
  /** Played when the player clicks a hero card on the pact screen. */
  heroSelect(): void;
}

/**
 * Surface of the per-level music engine exposed by `public/music.js`.
 *
 * The engine owns a registry of themes (altar, embergrass, hollowmere,
 * ashen) and crossfades between them on `setTheme`/`playLevel`. Both
 * methods are safe to call before audio has started — the theme is
 * simply queued, and the next user-gesture-triggered `start()` picks it
 * up. Calling `setTheme` with the active theme is a no-op.
 *
 * Only the methods game code actually drives are typed here. The UI
 * toggle (volume, on/off button) lives entirely inside `music.js`.
 */
interface PactkeeperMusicInstance {
  /** Switch to a named theme. Crossfades if currently playing. */
  setTheme(name: "altar" | "embergrass" | "hollowmere" | "ashen"): void;
  /** Convenience: pick the theme for a campaign level id. id 0 → altar. */
  playLevel(id: number): void;
}

/**
 * Surface of the per-level music engine exposed by `public/music.js`.
 *
 * The engine owns a registry of themes (altar, embergrass, hollowmere,
 * ashen) and crossfades between them on `setTheme`/`playLevel`. Both
 * methods are safe to call before audio has started — the theme is
 * simply queued, and the next user-gesture-triggered `start()` picks it
 * up. Calling `setTheme` with the active theme is a no-op.
 *
 * Only the methods game code actually drives are typed here. The UI
 * toggle (volume, on/off button) lives entirely inside `music.js`.
 */
interface PactkeeperMusicInstance {
  /** Switch to a named theme. Crossfades if currently playing. */
  setTheme(name: "altar" | "embergrass" | "hollowmere" | "ashen"): void;
  /** Convenience: pick the theme for a campaign level id. id 0 → altar. */
  playLevel(id: number): void;
}

interface Window {
  PactkeeperSFX?: PactkeeperSFXInstance;
  PactkeeperMusic?: PactkeeperMusicInstance;
}
