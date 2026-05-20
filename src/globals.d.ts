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
  wraithAttack(): void;
  wraithDie(): void;
  wax(): void;
  tick(): void;
  thud(): void;
  seal(): void;
  hover(): void;
}

interface Window {
  PactkeeperSFX?: PactkeeperSFXInstance;
}
