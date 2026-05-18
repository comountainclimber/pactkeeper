/**
 * Multi-realm level configuration.
 *
 * Each level has its own palette, path, props, and boss. The active level is
 * selected by URL param (`?level=N`), then localStorage (`pk-level`), then
 * defaults to 1. The pact screen writes `pk-level=1` on seal; the campaign
 * progression writes `pk-level=N` between levels.
 *
 * `PATH` in `config.ts` is the canonical source for the active path — it reads
 * from the current level at module-load time.
 */

export type LevelId = 1 | 2 | 3;
export type BossKind = "hollow_warden" | "brood_mother" | "cinder_lich";

export type LevelDef = {
  id: LevelId;
  name: string;
  subtitle: string;
  accent: string;
  waves: number;
  boss: BossKind;
  bossName: string;
  /** Palette for grass tiles. Keys '.', '1'..'7'. '.' = transparent. */
  grassPalette: Record<string, string | null>;
  /** Palette for path tiles. Keys '.', '1'..'8'. '.' = transparent. */
  pathPalette: Record<string, string | null>;
  /** Tile-coord waypoints. First and last sit off-grid so enemies enter/exit. */
  waypoints: ReadonlyArray<readonly [number, number]>;
  /** Decorative props: [sprite, tileX, tileY, offsetX, offsetY]. */
  props: ReadonlyArray<readonly [string, number, number, number, number]>;
  portalColor: string;
  portalCore: string;
  ambientHaze: string;
  spawnPos: readonly [number, number];
  castlePos: readonly [number, number];
};

export const LEVELS: Record<LevelId, LevelDef> = {
  1: {
    id: 1,
    name: "Embergrass Pass",
    subtitle: "Where the wardens first walked.",
    accent: "#5a8a3a",
    waves: 5,
    boss: "hollow_warden",
    bossName: "The Hollow Warden",
    grassPalette: {
      ".": null,
      "1": "#3d5e22", "2": "#4a7530", "3": "#5a8a3a",
      "4": "#6a9a44", "5": "#7aaa54", "6": "#3a4520", "7": "#8aaa60",
    },
    pathPalette: {
      ".": null,
      "1": "#2a1a10", "2": "#4a2e18", "3": "#6a4520",
      "4": "#8a6030", "5": "#a07840", "6": "#3a2820", "7": "#7a6450", "8": "#1a1014",
    },
    waypoints: [
      [-1, 3], [4, 3], [4, 7], [9, 7], [9, 4], [14, 4], [14, 10], [22, 10],
    ],
    props: [
      ["tree", 1, 1, 0, 0], ["tree", 2, 0, 4, 4], ["tree", 7, 0, 0, 0],
      ["tree", 12, 1, 0, 0], ["tree", 18, 0, 0, 4], ["tree", 20, 2, 0, 0],
      ["tree", 0, 6, 0, 0], ["tree", 1, 8, 4, 0], ["tree", 12, 12, 0, 0],
      ["tree", 17, 11, 0, 0], ["tree", 19, 12, 4, 0], ["tree", 7, 11, 0, 0],
      ["tree", 6, 12, 6, 4], ["rock", 6, 5, 4, 4], ["rock", 16, 6, 0, 4],
      ["rock", 3, 11, 4, 4], ["rock", 11, 0, 2, 4], ["rock", 13, 8, 0, 4],
      ["torch", 3, 2, 4, 8], ["torch", 5, 6, 8, 4], ["torch", 10, 6, 8, 4],
      ["torch", 14, 5, 4, 8], ["torch", 14, 9, 4, 0],
    ],
    portalColor: "#6b3a8a",
    portalCore: "#2a1040",
    ambientHaze: "#3a2050",
    spawnPos: [-1, 3],
    castlePos: [21, 8],
  },

  2: {
    id: 2,
    name: "Hollowmere Mire",
    subtitle: "Where the dead refuse to lie still.",
    accent: "#5a8a8a",
    waves: 5,
    boss: "brood_mother",
    bossName: "The Brood Mother",
    grassPalette: {
      ".": null,
      "1": "#1f3028", "2": "#2a4030", "3": "#3a5a40",
      "4": "#4a6850", "5": "#5a7860", "6": "#2a2018", "7": "#80a890",
    },
    pathPalette: {
      ".": null,
      "1": "#1a1010", "2": "#2a1f14", "3": "#3a2a18",
      "4": "#4a3825", "5": "#5a4530", "6": "#2a1f14", "7": "#2a4040", "8": "#0a0608",
    },
    waypoints: [
      [-1, 2], [6, 2], [6, 7], [3, 7], [3, 11], [16, 11], [16, 5], [22, 5],
    ],
    props: [
      ["deadTree", 1, 0, 0, 4], ["deadTree", 9, 0, 4, 0], ["deadTree", 18, 1, 0, 0],
      ["deadTree", 0, 5, 4, 4], ["deadTree", 8, 8, 0, 4], ["deadTree", 14, 7, 4, 0],
      ["deadTree", 20, 10, 0, 0], ["deadTree", 12, 0, 0, 4],
      ["mushroom", 5, 1, 4, 8], ["mushroom", 7, 4, 0, 8], ["mushroom", 1, 10, 4, 4],
      ["mushroom", 11, 9, 0, 8], ["mushroom", 19, 7, 4, 4], ["mushroom", 21, 2, 0, 4],
      ["mushroom", 13, 4, 4, 0],
      ["rock", 8, 5, 4, 0], ["rock", 14, 1, 0, 4], ["rock", 2, 13, 4, 0],
      ["rock", 19, 12, 0, 0],
      ["torch", 4, 4, 8, 4], ["torch", 7, 9, 4, 0], ["torch", 17, 3, 4, 8],
      ["torch", 14, 12, 4, 0],
    ],
    portalColor: "#3a5868",
    portalCore: "#0a1a20",
    ambientHaze: "#1a3848",
    spawnPos: [-1, 2],
    castlePos: [21, 3],
  },

  3: {
    id: 3,
    name: "Ashen Reach",
    subtitle: "Where the world ended once.",
    accent: "#c93a3a",
    waves: 5,
    boss: "cinder_lich",
    bossName: "The Cinder Lich",
    grassPalette: {
      ".": null,
      "1": "#2a1f18", "2": "#3a2a20", "3": "#4a3a2a",
      "4": "#5a4838", "5": "#6a5848", "6": "#1a1010", "7": "#7a6855",
    },
    pathPalette: {
      ".": null,
      "1": "#0a0608", "2": "#2a1410", "3": "#3a1810",
      "4": "#5a2818", "5": "#7a3818", "6": "#1a0a08", "7": "#ff8030", "8": "#3a0a08",
    },
    waypoints: [
      [22, 2], [12, 2], [12, 7], [18, 7], [18, 11], [4, 11], [4, 6], [-1, 6],
    ],
    props: [
      ["burntTree", 8, 0, 0, 4], ["burntTree", 16, 0, 4, 0], ["burntTree", 1, 4, 0, 0],
      ["burntTree", 20, 5, 4, 4], ["burntTree", 7, 9, 0, 0], ["burntTree", 14, 9, 4, 0],
      ["burntTree", 1, 12, 0, 0], ["burntTree", 21, 12, 0, 4],
      ["lavaCrystal", 5, 1, 4, 4], ["lavaCrystal", 9, 4, 0, 8], ["lavaCrystal", 14, 4, 4, 0],
      ["lavaCrystal", 6, 8, 4, 4], ["lavaCrystal", 19, 9, 0, 0], ["lavaCrystal", 16, 13, 4, 0],
      ["rock", 10, 5, 0, 8], ["rock", 13, 11, 0, 0], ["rock", 0, 8, 8, 4],
      ["torch", 8, 4, 4, 8], ["torch", 15, 5, 4, 0], ["torch", 7, 12, 4, 4],
      ["torch", 16, 6, 0, 8],
    ],
    portalColor: "#c93a3a",
    portalCore: "#3a0808",
    ambientHaze: "#5a1010",
    spawnPos: [22, 2],
    castlePos: [-1, 5],
  },
};

function readLevelId(): LevelId {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = parseInt(params.get("level") ?? "", 10);
    if (fromUrl === 1 || fromUrl === 2 || fromUrl === 3) return fromUrl;
    const fromLs = parseInt(localStorage.getItem("pk-level") ?? "", 10);
    if (fromLs === 1 || fromLs === 2 || fromLs === 3) return fromLs;
  } catch {
    // window/localStorage may be unavailable in SSR or private mode.
  }
  return 1;
}

/** Active level chosen for this page load. Cached so multiple modules agree. */
export const CURRENT_LEVEL: LevelDef = LEVELS[readLevelId()];

export function getCurrentLevel(): LevelDef {
  return CURRENT_LEVEL;
}
