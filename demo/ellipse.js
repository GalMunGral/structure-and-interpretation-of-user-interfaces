import { clear } from "../modules/pixel.js";
import { setup } from "../modules/utils.js";
import { makeEllipse } from "../modules/ellipse.js";

const canvas = document.querySelector("#ellipse");
const inputN = document.querySelector("#ellipse-n");
const inputA = document.querySelector("#ellipse-a");
const inputB = document.querySelector("#ellipse-b");
const inputTheta = document.querySelector("#ellipse-theta");
const inputPhi1 = document.querySelector("#ellipse-phi-1");
const inputPhi2 = document.querySelector("#ellipse-phi-2");

let dirty = true;

inputN.oninput =
  inputA.oninput =
  inputB.oninput =
  inputTheta.oninput =
  inputPhi1.oninput =
  inputPhi2.oninput =
    () => {
      dirty = true;
    };

setup(canvas, (buffer) => {
  if (dirty) {
    const n = +inputN.value;
    const a = +inputA.value;
    const b = +inputB.value;
    const cx = buffer.width / 2;
    const cy = buffer.height / 2;
    const theta = +inputTheta.value * (Math.PI / 180);
    const phi1 = +inputPhi1.value * (Math.PI / 180);
    const phi2 = +inputPhi2.value * (Math.PI / 180);

    clear(buffer);
    makeEllipse(n, a, b, cx, cy, theta, phi1, phi2).fill(buffer, () => [
      0.0, 0.0, 0.0, 1.0,
    ]);
  }
});