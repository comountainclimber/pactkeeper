// Pixel art sprite data + pre-renderer.
// Each sprite is an array of 16 strings of 16 chars (or 32x32 for the castle).
// Each char maps to a palette entry; '.' means transparent.
// Ported from the design handoff so palettes/shapes match the design 1:1.

type Palette = Record<string, string | null>;

const PALETTES: Record<string, Palette> = {
  archer: {
    ".": null,
    "1": "#3d2a1a",
    "2": "#6b3e1a",
    "3": "#8a5a2a",
    "4": "#5a5552",
    "5": "#8a8480",
    "6": "#b5ada6",
    "7": "#c93a3a",
    "8": "#7a1f1f",
    "9": "#f0d090",
    a: "#2a1f12",
    b: "#4a7530",
    c: "#e8c870",
  },
  // Tier-2 archer: silver banner trim. Palette ported from the design handoff
  // (testing/project/towers.jsx, TIER_PALETTES.archer[2]).
  archerT2: {
    ".": null,
    a: "#1a1014",
    "1": "#2a1f12",
    "2": "#5a3820",
    "3": "#8a5a2a",
    "4": "#4a4858",
    "5": "#7a7488",
    "6": "#a8a4b8",
    "7": "#e8c440",
    "8": "#c98a3a",
    "9": "#f0d090",
    b: "#4a90b0",
    c: "#fff080",
  },
  // Tier-3 archer: gold trim + crown. Palette ported from the design handoff.
  archerT3: {
    ".": null,
    a: "#0a0608",
    "1": "#1a0814",
    "2": "#3a1820",
    "3": "#c98a3a",
    "4": "#3a3848",
    "5": "#7a7488",
    "6": "#d4c8a0",
    "7": "#e8c440",
    "8": "#c93a3a",
    "9": "#fff0a0",
    b: "#7ad4e8",
    c: "#fff080",
  },
  cannon: {
    ".": null,
    "1": "#2a2724",
    "2": "#3a3530",
    "3": "#5a5552",
    "4": "#7a7470",
    "5": "#9a948f",
    "6": "#1a1814",
    "7": "#3d3530",
    "8": "#6b3e1a",
    "9": "#c98a3a",
    a: "#e8b860",
    b: "#f0e060",
    c: "#ff8030",
  },
  cannonT2: {
    ".": null,
    a: "#0e0a08",
    "1": "#1a1614",
    "2": "#3a3530",
    "3": "#5a5552",
    "4": "#7a7470",
    "5": "#aaa49f",
    "6": "#1a0a08",
    "7": "#3a1808",
    "8": "#8a3818",
    "9": "#e8c440",
    b: "#ffe080",
    c: "#ff8030",
  },
  cannonT3: {
    ".": null,
    a: "#0a0608",
    "1": "#14080a",
    "2": "#3a2024",
    "3": "#5a3038",
    "4": "#7a484c",
    "5": "#c8b890",
    "6": "#0a0608",
    "7": "#3a0a08",
    "8": "#c93a3a",
    "9": "#e8c440",
    b: "#fff080",
    c: "#ff6020",
  },
  frost: {
    ".": null,
    "1": "#1a3848",
    "2": "#2a5870",
    "3": "#4a90b0",
    "4": "#7ad4e8",
    "5": "#c8f0fa",
    "6": "#ffffff",
    "7": "#3a4858",
    "8": "#5a6878",
    "9": "#1a2030",
    a: "#9ae0ec",
  },
  frostT2: {
    ".": null,
    a: "#a8e8f4",
    "1": "#0a2838",
    "2": "#1a4858",
    "3": "#3a8090",
    "4": "#7ad4e8",
    "5": "#c8f0fa",
    "6": "#ffffff",
    "7": "#2a384c",
    "8": "#5a7088",
    "9": "#0a1018",
    b: "#a8c8ec",
  },
  frostT3: {
    ".": null,
    a: "#c8f0fa",
    "1": "#1a0838",
    "2": "#2a1858",
    "3": "#4a3890",
    "4": "#7ad4e8",
    "5": "#c8f0fa",
    "6": "#ffffff",
    "7": "#2a2848",
    "8": "#6a68a8",
    "9": "#0a0820",
    b: "#a890f0",
  },
  bat: {
    ".": null, "1": "#0a060a", "2": "#1a0e1a", "3": "#2a182a",
    "4": "#4a3850", "5": "#6a5070", "6": "#e83a3a",
  },
  orc: {
    ".": null,
    "1": "#1a2a18",
    "2": "#3a5a28",
    "3": "#5a8038",
    "4": "#7aa048",
    "5": "#3a2a1a",
    "6": "#6b4a26",
    "7": "#8a3030",
    "8": "#c8c0b0",
    "9": "#7a7470",
    a: "#b5ada6",
    b: "#e84040",
  },
  goblin: {
    ".": null,
    "1": "#2a1a10",
    "2": "#7a4520",
    "3": "#a06030",
    "4": "#c08048",
    "5": "#3a2818",
    "6": "#5a4030",
    "7": "#c8a040",
    "8": "#e0c870",
    "9": "#c8c0b0",
    a: "#e84040",
  },
  skeleton: {
    ".": null,
    "1": "#1a1814",
    "2": "#6a6258",
    "3": "#9a948f",
    "4": "#d4ccc0",
    "5": "#1a3848",
    "6": "#3a5868",
    "7": "#7a3030",
    "8": "#3affd0",
    "9": "#e84040",
  },
  ghost: {
    ".": null,
    "1": "#1a1410",
    "2": "#6a6a8a",
    "3": "#c8c8d8",
    "4": "#f0f0f8",
    "5": "#1a1a3a",
    "6": "#3affd0",
    "7": "#8a4aaa",
  },
  castle: {
    ".": null,
    "1": "#2a2520",
    "2": "#4a4540",
    "3": "#6a6560",
    "4": "#8a857f",
    "5": "#1a1814",
    "6": "#3a2820",
    "7": "#5a3820",
    "8": "#c93a3a",
    "9": "#e8c870",
    a: "#6b3a8a",
  },
  tree: {
    ".": null,
    "1": "#1a2a10",
    "2": "#2a4018",
    "3": "#3a5a20",
    "4": "#5a8030",
    "5": "#3a2410",
    "6": "#5a3820",
  },
  rock: {
    ".": null,
    "1": "#3a3530",
    "2": "#5a5552",
    "3": "#7a7470",
    "4": "#9a948f",
  },
  torch: {
    ".": null,
    "1": "#2a1810",
    "2": "#4a2818",
    "3": "#ff8030",
    "4": "#ffc040",
    "5": "#fff080",
    "6": "#1a1010",
  },
  // Level 2 (Hollowmere Mire) props
  deadTree: {
    ".": null,
    "1": "#0a0608",
    "2": "#2a1f14",
    "3": "#4a3825",
    "4": "#6a5040",
    "5": "#1a3030",
  },
  mushroom: {
    ".": null,
    "1": "#0a0608",
    "2": "#2a1810",
    "3": "#5a2438",
    "4": "#8a3a58",
    "5": "#c84878",
    "6": "#f8a8d0",
    "7": "#f0e0c0",
    "8": "#7ad4e8",
  },
  // Level 3 (Ashen Reach) props
  burntTree: {
    ".": null,
    "1": "#0a0408",
    "2": "#2a1410",
    "3": "#4a2010",
    "4": "#6a3018",
    "5": "#ff8030",
  },
  lavaCrystal: {
    ".": null,
    "1": "#0a0408",
    "2": "#2a0810",
    "3": "#5a1010",
    "4": "#8a1818",
    "5": "#c93a3a",
    "6": "#ff8030",
    "7": "#ffe070",
  },
  // ─── Hero palettes ──────────────────────────────────────────────
  // Each hero sprite uses a kind-specific palette. Suffix convention:
  // sprite `<kind>Hero` → palette `<kind>Hero`, resolved in `paletteFor()`.
  knightHero: {
    ".": null,
    "1": "#0a0810", "2": "#1a2a48", "3": "#3a4878", "4": "#7a90c0",
    "5": "#e0b090", "6": "#3a2818", "7": "#c93a3a", "8": "#e85a4a",
    "9": "#e8c440", "a": "#c8c8d0", "b": "#ffffff", "c": "#a8a8b0",
  },
  archerHero: {
    ".": null,
    "1": "#0a0608", "2": "#1a3818", "3": "#2a5028", "4": "#3a2410",
    "5": "#e0b090", "6": "#5a8a3a", "7": "#8a5a2a", "8": "#f0e8d0",
    "9": "#6a4520",
  },
  mageHero: {
    ".": null,
    "1": "#0a0820", "2": "#2a1858", "3": "#4a3890", "4": "#4a90b0",
    "5": "#d0a890", "6": "#7ad4e8", "7": "#c8f0fa", "8": "#ffffff",
    "9": "#5a3820", "a": "#a0e0f0",
  },
  // ─── Boss palettes ─────────────────────────────────────────────
  // One palette per realm boss. Sprite name → palette is wired in
  // `paletteFor()` below. Bosses render at 2× scale (see `isBossKind`
  // in `src/config.ts` and `drawEnemy` in `src/enemy.ts`).
  hollowWarden: {
    ".": null,
    "1": "#0a0f06", // deep shadow
    "2": "#2a1810", // dark bark
    "3": "#4a2e18", // mid bark
    "4": "#6b3e1a", // warm bark
    "5": "#2a4018", // moss-dark
    "6": "#5a8030", // moss-bright
    "7": "#ffc040", // ember amber
    "8": "#fff080", // ember highlight
    "9": "#c8c0a0", // antler bone
  },
  broodMother: {
    ".": null,
    "1": "#0a0810", // shadow
    "2": "#1a1020", // dark chitin
    "3": "#3a2030", // mid chitin
    "4": "#5a3050", // carapace
    "5": "#8a4870", // carapace highlight
    "6": "#c850a0", // egg-sac deep
    "7": "#f0a0e0", // egg-sac glow
    "8": "#ff6060", // eye-fire red
    "9": "#d4c8a0", // fangs / chelicerae
  },
  cinderLich: {
    ".": null,
    "1": "#050208", // deepest shadow
    "2": "#2a0a14", // cloak shadow
    "3": "#5a1018", // cloak deep red
    "4": "#8a2010", // cloak fire-trim
    "5": "#c93a3a", // cloak ember trim
    "6": "#5a4030", // bone shadow
    "7": "#d0c0a0", // bone
    "8": "#ff8030", // ember orange
    "9": "#e8c440", // crown gold
    a: "#fff080", // lava-bright core
    b: "#ff4020", // eye-fire
  },
};

/** All 16×16 sprites, keyed by name. Towers use the `<kind>Tower` convention
 * so {@link paletteFor} can strip the suffix to find the palette. Exported
 * so `scripts/doc-check.ts` can verify every registry reference resolves. */
export const SPRITES_16: Record<string, readonly string[]> = {
  archerTower: [
    "....aaaaaa......",
    "...a7777ca......",
    "...a78b87a......",
    "...a78787a......",
    "...aaaaaaa......",
    "..a99a9a9aa.....",
    "..a9aaaaa9a.....",
    "..aaaaaaaaa.....",
    "..a5665665a.....",
    "..a5454545a.....",
    "..a5664664a.....",
    "..a4545454a.....",
    "..a5664665a.....",
    "..a4444444a.....",
    "..aaaaaaaaa.....",
    "................",
  ],
  cannonTower: [
    ".....11111......",
    "....1777771.....",
    "...177777771....",
    "..17666666671...",
    "..1666666666661.",
    "..16666aa9a9a61.",
    "..1666666666661.",
    "...17777777771..",
    "...12222222221..",
    "..125333333521..",
    "..123444444321..",
    "..125344443521..",
    "..123444444321..",
    "..125333333521..",
    "..1222222222221.",
    "..11111111111111",
  ],
  frostTower: [
    ".......99.......",
    "......9669......",
    "......9669......",
    ".....966aa69....",
    "....966a4a4a69..",
    "....96a44a44a9..",
    "....96a4aa4a69..",
    ".....96a4a4a9...",
    "......96aa69....",
    ".....9966699....",
    "....97778877....",
    "...977888888779.",
    "..97788888888879",
    "..9778ab87b8779.",
    "...97777777779..",
    "....99999999....",
  ],
  // ─── Tower tier-2 & tier-3 sprites ─────────────────────────────
  // Each pair adds detail/embellishment over the previous tier — T2 picks up
  // silver banner/trim, T3 picks up gold trim plus a more elaborate silhouette
  // so the upgrade reads at a glance against the busy map. Pixel layouts ported
  // from the design handoff (testing/project/towers.jsx, TIER_SPRITES).
  archerTowerT2: [
    ".....aaaaaa.....",
    "....ac7777ca....",
    "....a7bbbb7a....",
    "....a7bccb7a....",
    "....a7bbbb7a....",
    "....aaaaaaaa....",
    "...a9a99a9a9a...",
    "...a99aaaa99a...",
    "...aaaaaaaaaaa..",
    "...a566cc665a...",
    "...a565555c5a...",
    "...a566cc665a...",
    "...a565555c5a...",
    "...a566cc665a...",
    "...aaaaaaaaaaa..",
    "................",
  ],
  archerTowerT3: [
    "....c......c....",
    "...ac7aaaa7ca...",
    "...a7333333c7a..",
    "..ac7344b443c7a.",
    "..a7333bb333c7a.",
    "..aaaaaaaaaaaaa.",
    ".a9a99a9a99a9a9.",
    ".a9aaaaaaaaaaa9.",
    ".aaaaaaaaaaaaaaa",
    ".a5667c5c667c65a",
    ".a565cb5b56c565a",
    ".a566cccccc665a.",
    ".a565b5cc5b5565a",
    ".a566cc55cc665a.",
    ".aaaaaaaaaaaaaaa",
    "................",
  ],
  cannonTowerT2: [
    ".....11ccc11....",
    "....1c77777c1...",
    "..1c77777777c1..",
    ".16666666666661.",
    ".166666b9b9b661.",
    ".166cba9999bc661",
    ".1666666666b661.",
    "..177777777b71..",
    "..1bbbbbbbbbb1..",
    ".1b54344443454b1",
    ".1b53cc4444cc5b1",
    ".1b54344443454b1",
    ".1b53444b444c5b1",
    ".1b54cc44c4cc4b1",
    ".1bbbbbbbbbbbb1.",
    "..11111111111111",
  ],
  cannonTowerT3: [
    "...11111.11111..",
    "..177771a177771.",
    ".17666671b766671",
    "1666b66666b66661",
    "1666c99c9c99c661",
    "16666bb9b9bb6661",
    "16b6666666666661",
    ".1b777b777b777b1",
    "..18888c8c8888..",
    ".1c54344c34c45c1",
    ".1c5cb4cc4c4bc51",
    ".1c54c34334c45c1",
    ".1c5cbc4cc4cbc51",
    ".1c54c4c4c4c45c1",
    "..1cccccccccccc.",
    "...11111111111..",
  ],
  frostTowerT2: [
    ".......99.......",
    "......9669......",
    ".....966669.....",
    "....96a44a69....",
    "...96a5446a69...",
    "..96a5445544a69.",
    "..96a44aa44a69..",
    "...9a554a55a9...",
    "....96a44a69....",
    ".....966669.....",
    "....97778877....",
    "...97888bb887...",
    "..978888bb888879",
    ".97888abbba88879",
    "..977777777779..",
    "...99999999999..",
  ],
  frostTowerT3: [
    ".......6........",
    "......565.......",
    ".....565a5......",
    "....565aaa5.....",
    "...565aa4aa5....",
    "..565a44a44a5...",
    ".565a44aa44a5...",
    "..56a4aaaa4a65..",
    "...565a44a5a5...",
    "....5aa54a55....",
    "...97777bbb77...",
    "..978888aaa887..",
    "..97888abbba887.",
    ".97b888aaaa888b7",
    "..9777777777779.",
    "...99bb9999bb99.",
  ],
  bat: [
    "................",
    "................",
    "................",
    "................",
    "11............11",
    ".22..........22.",
    ".232........232.",
    "..2322....2232..",
    "....23344332....",
    ".....246642.....",
    "......2552......",
    ".......22.......",
    "................",
    "................",
    "................",
    "................",
  ],
  orc: [
    "................",
    ".....11111......",
    "....1233321.....",
    "....1888881.....",
    "....1b88b81.....",
    "....1238321.....",
    ".....11111......",
    "....1577751.....",
    "...157777751....",
    "...155333551....",
    "....11333311....",
    ".....19a91......",
    "....1934a91.....",
    "....16666661....",
    "....1611161.....",
    ".....11.11......",
  ],
  goblin: [
    "................",
    "................",
    ".....11111......",
    "....1234441.....",
    "....1aaaaa1.....",
    ".....1aa91......",
    "....177771......",
    "...17777771.....",
    "...155555551....",
    "...165656561....",
    "....1666661.....",
    ".....11111......",
    "....16..661.....",
    "....66..661.....",
    "................",
    "................",
  ],
  skeleton: [
    "................",
    ".....11111......",
    "....1333331.....",
    "....1393931.....",
    "....1333331.....",
    "....1133311.....",
    "....1555551.....",
    "...155555551....",
    "...165666661....",
    "...166666661....",
    "....16666661....",
    "....16333661....",
    "....16333661....",
    "....13...331....",
    "....13...331....",
    ".....1...11.....",
  ],
  ghost: [
    "................",
    "................",
    ".....11111......",
    "....1333331.....",
    "....1333331.....",
    "....1366611.....",
    "....1333331.....",
    "...13333333l...",
    "...13333333l...",
    "...13333333l...",
    "...13333333l...",
    "....1355351....",
    "....1355351....",
    "....1333331....",
    "...13..3..31...",
    ".....1.1.1......",
  ],
  ghostAttack: [
    "................",
    "................",
    ".....11111......",
    "....1333331.....",
    "....1366631.....",
    "...13666631.....",
    "...13366331.....",
    "..1333363331....",
    "..1366666661....",
    "..1333666331....",
    "..1333333331....",
    "...13555531.....",
    "...13553531.....",
    "....1333331.....",
    "...13..3..31....",
    "....1..1..1.....",
  ],
  tree: [
    "................",
    ".....11111......",
    "....1233321.....",
    "...123433321....",
    "..12344443321...",
    "..12434434321...",
    "..12344434321...",
    "..12343444321...",
    "...123443321....",
    "....1233321.....",
    ".....15551......",
    "......1561......",
    "......1561......",
    "......1561......",
    ".....116611.....",
    "................",
  ],
  rock: [
    "................",
    "................",
    ".....1111.......",
    "....122321......",
    "...12333321.....",
    "..1234433321....",
    "..1233443431....",
    ".12344443431....",
    ".12333443321....",
    ".12333333321....",
    "..123333321.....",
    "...1112111......",
    "................",
    "................",
    "................",
    "................",
  ],
  torch: [
    "......43........",
    ".....3554.......",
    ".....4555.......",
    "......443.......",
    "......2.2.......",
    "......626.......",
    "......616.......",
    "......626.......",
    "......616.......",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  // ─── Level 2 props ─────────────────────────────────────────────
  deadTree: [
    "................",
    "....1..1........",
    "...121131.......",
    "...12311321.....",
    "....1313321.....",
    ".....1331.......",
    "......133.......",
    "......133.......",
    ".....1535.......",
    "....15553.......",
    ".....1531.......",
    "......123.......",
    "......123.......",
    ".....11321......",
    "................",
    "................",
  ],
  mushroom: [
    "................",
    "................",
    ".....11111......",
    "....1345531.....",
    "...1346655431...",
    "...145668865441.",
    "...148866668841.",
    "...1455665541...",
    "....1115111.....",
    "......171.......",
    "......171.......",
    "......171.......",
    ".....17771......",
    "....1118.81.....",
    "................",
    "................",
  ],
  // ─── Level 3 props ─────────────────────────────────────────────
  burntTree: [
    "................",
    "....1...........",
    ".....1..1.......",
    "....121131......",
    "....11231.......",
    ".....1131.......",
    "......133.......",
    "......123.......",
    "......123.......",
    ".....1.235......",
    "......1235......",
    "......123.......",
    "......123.......",
    ".....11211......",
    "................",
    "................",
  ],
  lavaCrystal: [
    "................",
    "................",
    "................",
    ".......11.......",
    "......1771......",
    ".....167761.....",
    "....1667671.....",
    "...16557651.....",
    "..165544561.....",
    ".1654444561.....",
    "..16544541......",
    "...1654451......",
    "....16551.......",
    ".....11.........",
    "................",
    "................",
  ],
  // ─── Hero sprites ──────────────────────────────────────────────
  // Player-controlled champion sprites. Each is a 7-wide humanoid in a 16×16
  // tile, with the kind's distinguishing prop (knight's sword, archer's bow,
  // mage's floating orb + staff) extending past the body silhouette.
  knightHero: [
    "................",
    "......77........",
    ".....1771.......",
    ".....1aa1.......",
    "....1baab1......",
    "....1a55a1......",
    "....1aaaa1......",
    "....19991.......",
    "...1333331c.....",
    "...13444431c....",
    "...13434431c....",
    "...19999991.....",
    "....133331......",
    "....13...31.....",
    "....16...61.....",
    ".....11.11......",
  ],
  archerHero: [
    "................",
    "......2.........",
    ".....1221.......",
    "....122221......",
    "....122551......",
    "....125531......",
    ".....1551.......",
    "....166661......",
    "...167666617....",
    "...167666687....",
    "...167666697....",
    "....1444441.....",
    "....1333331.....",
    "....133..331....",
    "....16....61....",
    ".....11..11.....",
  ],
  mageHero: [
    "................",
    ".........8......",
    "........181.....",
    ".......17871....",
    "........191.....",
    ".........9......",
    "....122229......",
    "....12222291....",
    "....12552291....",
    "....12552291....",
    "....1232321.....",
    "....1334431.....",
    "....1343a31.....",
    "....1333331.....",
    "....1322231.....",
    "....11...11.....",
  ],
  // ─── Boss sprites ──────────────────────────────────────────────
  // Each realm closes on a unique boss. The sprites render at 2× scale
  // (see `isBossKind` in `src/config.ts` and the `renderScale` branch in
  // `drawEnemy`), so a 16×16 logical sprite paints to a 64×64 screen-px
  // figure that towers above the regular enemies.
  //
  // Designed in palette key order — see PALETTES.hollowWarden /
  // .broodMother / .cinderLich above. Bilateral symmetry on the body
  // rows keeps the silhouettes legible at game scale; legs / antlers /
  // crown spikes break the silhouette outward.
  //
  //   hollowWarden — Embergrass Pass. Antlered treant with a glowing
  //                  hollow face and mossy bark torso.
  //   broodMother  — Hollowmere Mire. Bulbous arachnid with a pink
  //                  egg-sac abdomen and splayed chitin legs.
  //   cinderLich   — Ashen Reach. Crowned skeletal sorcerer in a
  //                  red-and-ember robe over a bone skull.
  hollowWarden: [
    "................",
    "....9.....9.....",
    ".9..9.9..9.9..9.",
    "..99..9..9..99..",
    "....22222222....",
    "...2333333332...",
    "..233333333332..",
    "..238333333832..",
    "..233337733332..",
    "..233333333332..",
    "..237777777732..",
    "..233333333332..",
    "...2366666632...",
    "...2365665632...",
    "...2334443332...",
    "...233.....332..",
  ],
  broodMother: [
    "................",
    "..3..........3..",
    "...3........3...",
    "....3......3....",
    ".....3....3.....",
    "....23888832....",
    "....22999922....",
    "...2345555432...",
    "..234567765432..",
    ".23456777765432.",
    ".23456777765432.",
    "..234567765432..",
    "...2345665432...",
    "....3......3....",
    "...3........3...",
    "..3..........3..",
  ],
  cinderLich: [
    "................",
    "....9.9.9.9.....",
    ".....99999......",
    "....6677766.....",
    "...6777777776...",
    "..67b77777b76...",
    "..67777787766...",
    "...678888876....",
    "...233333332....",
    "..23388888332...",
    "..2348aaaa8432..",
    "..23488aa88432..",
    "..2348aaaa8432..",
    "..234588884322..",
    "...23344444332..",
    "....22333322....",
  ],
};

// Look up palette by sprite name. Tower sprites use the `<kind>Tower[Tn]`
// convention so we can strip the `Tower` infix to find the palette. T1 reuses
// the base `<kind>` palette; T2/T3 each have their own palette key
// (`<kind>T2` / `<kind>T3`) so the designer-chosen silver/gold trims show
// through.
function paletteFor(name: string): Palette {
  if (name === "archerTower") return PALETTES.archer;
  if (name === "cannonTower") return PALETTES.cannon;
  if (name === "frostTower") return PALETTES.frost;
  if (name === "archerTowerT2") return PALETTES.archerT2;
  if (name === "archerTowerT3") return PALETTES.archerT3;
  if (name === "cannonTowerT2") return PALETTES.cannonT2;
  if (name === "cannonTowerT3") return PALETTES.cannonT3;
  if (name === "frostTowerT2") return PALETTES.frostT2;
  if (name === "frostTowerT3") return PALETTES.frostT3;
  if (name === "knightHero") return PALETTES.knightHero;
  if (name === "archerHero") return PALETTES.archerHero;
  if (name === "mageHero") return PALETTES.mageHero;
  if (name === "hollowWarden") return PALETTES.hollowWarden;
  if (name === "broodMother") return PALETTES.broodMother;
  if (name === "cinderLich") return PALETTES.cinderLich;
  return PALETTES[name] ?? PALETTES.orc;
}

// Pre-renderer: bakes each sprite into an OffscreenCanvas at the requested
// integer scale. This is way cheaper than per-pixel fillRect at runtime.
const cache = new Map<string, HTMLCanvasElement>();

export function getSprite(name: string, scale: number): HTMLCanvasElement {
  const key = `${name}@${scale}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const data = SPRITES_16[name];
  if (!data) throw new Error(`Unknown sprite: ${name}`);
  const pal = paletteFor(name);
  const w = data[0].length;
  const h = data.length;

  const c = document.createElement("canvas");
  c.width = w * scale;
  c.height = h * scale;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  for (let y = 0; y < h; y++) {
    const row = data[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      const col = pal[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  cache.set(key, c);
  return c;
}

export type GrassPalette = Palette;
export const GRASS_PALETTE: GrassPalette = {
  ".": null,
  "1": "#3d5e22",
  "2": "#4a7530",
  "3": "#5a8a3a",
  "4": "#6a9a44",
  "5": "#7aaa54",
  "6": "#3a4520",
  "7": "#8aaa60",
};

export const PATH_PALETTE: Palette = {
  ".": null,
  "1": "#2a1a10",
  "2": "#4a2e18",
  "3": "#6a4520",
  "4": "#8a6030",
  "5": "#a07840",
  "6": "#3a2820",
  "7": "#7a6450",
  "8": "#1a1014",
};
