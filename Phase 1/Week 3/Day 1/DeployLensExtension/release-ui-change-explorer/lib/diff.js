(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DeployLensDiff = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function isMasked(x, y, masks) {
    return (masks || []).some((mask) => x >= mask.x && x < mask.x + mask.width && y >= mask.y && y < mask.y + mask.height);
  }

  function analyzeImageData(before, after, options = {}) {
    if (!before || !after) throw new Error("Both snapshot images are required.");
    if (before.width !== after.width || before.height !== after.height) {
      return { state: "incompatible", beforeWidth: before.width, beforeHeight: before.height, afterWidth: after.width, afterHeight: after.height };
    }
    if (before.data.length !== after.data.length) throw new Error("Snapshot pixel data is incompatible.");
    const threshold = Number.isFinite(options.threshold) ? options.threshold : 0.01;
    const pixelTolerance = Number.isFinite(options.pixelTolerance) ? options.pixelTolerance : 25;
    const masks = options.masks || [];
    let changed = 0;
    let comparable = 0;
    const heatmap = new Uint8Array(before.width * before.height);
    const changedCoords = [];
    for (let y = 0; y < before.height; y++) {
      for (let x = 0; x < before.width; x++) {
        if (isMasked(x, y, masks)) continue;
        comparable++;
        const i = (y * before.width + x) * 4;
        const delta = Math.max(
          Math.abs(before.data[i] - after.data[i]),
          Math.abs(before.data[i + 1] - after.data[i + 1]),
          Math.abs(before.data[i + 2] - after.data[i + 2])
        );
        if (delta >= pixelTolerance) {
          changed++;
          heatmap[y * before.width + x] = 255;
          changedCoords.push({ x, y });
        }
      }
    }
    if (!comparable) return { state: "incompatible", changedPercent: 0, changedPixels: 0, comparablePixels: 0, heatmap };
    const changedPercent = changed / comparable * 100;
    let bounds = null;
    if (changedCoords.length) {
      const xs = changedCoords.map((p) => p.x);
      const ys = changedCoords.map((p) => p.y);
      bounds = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    }
    return {
      state: changedPercent >= threshold * 100 ? "changed" : "unchanged",
      changedPercent,
      changedPixels: changed,
      comparablePixels: comparable,
      bounds,
      heatmap
    };
  }
  return { analyzeImageData, isMasked };
});
