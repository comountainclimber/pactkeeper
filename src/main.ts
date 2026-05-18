import { Game } from "./game.ts";
import { PactScreen } from "./pact-screen.ts";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
const canvasStage = document.getElementById("canvas-stage") as HTMLElement | null;
const pactStage = document.getElementById("pact-stage") as HTMLElement | null;
if (!canvas || !canvasStage || !pactStage) {
  throw new Error("Missing required DOM elements (canvas, stages)");
}
// Locals avoid re-checking for null inside callbacks.
const canvasEl = canvasStage;
const pactEl = pactStage;

const game = new Game(canvas);
game.start();

const pact = new PactScreen(pactEl);

function showPact(): void {
  canvasEl.hidden = true;
  pact.show();
}

function startLevel(chosenIds: string[]): void {
  pact.hide();
  canvasEl.hidden = false;
  game.beginLevelWithPacts(chosenIds);
}

pact.onSeal((chosen) => startLevel(chosen.map((p) => p.id)));

// Game tells us when the run ends so we can return to the pact screen.
game.onLevelEnd(() => {
  // Brief delay so the player can see the result screen before the pact UI takes over.
  window.setTimeout(showPact, 1600);
});

showPact();
