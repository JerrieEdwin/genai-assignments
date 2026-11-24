const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeImageData } = require("../lib/diff.js");

function image(width, height, fill) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = 255;
  }
  return { width, height, data };
}

test("classifies identical snapshots as unchanged", () => {
  const before = image(10, 10, [100, 100, 100]);
  const after = image(10, 10, [100, 100, 100]);
  assert.equal(analyzeImageData(before, after, { threshold: 0.01 }).state, "unchanged");
});

test("classifies material pixel changes", () => {
  const before = image(10, 10, [0, 0, 0]);
  const after = image(10, 10, [0, 0, 0]);
  for (let i = 0; i < 400; i += 4) {
    after.data[i] = 255;
  }
  const result = analyzeImageData(before, after, { threshold: 0.01, pixelTolerance: 25 });
  assert.equal(result.state, "changed");
  assert.equal(result.changedPixels, 100);
});

test("marks mismatched dimensions as incompatible", () => {
  const result = analyzeImageData(image(10, 10, [0, 0, 0]), image(12, 10, [0, 0, 0]));
  assert.equal(result.state, "incompatible");
});

test("honors masked regions", () => {
  const before = image(10, 10, [0, 0, 0]);
  const after = image(10, 10, [255, 255, 255]);
  const result = analyzeImageData(before, after, {
    threshold: 0.01,
    pixelTolerance: 25,
    masks: [{ x: 0, y: 0, width: 10, height: 10 }]
  });
  assert.equal(result.state, "incompatible");
  assert.equal(result.comparablePixels, 0);
});
