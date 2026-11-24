const storage = DeployLensStorage;
const routeApi = DeployLensRoute;
const diffApi = DeployLensDiff;
let selectedPair = null;
let selectedResult = null;
let viewMode = "difference";

async function load() {
  const [releases, snapshots, settings] = await Promise.all([
    storage.getAll("releases"),
    storage.getAll("snapshots"),
    storage.getSettings()
  ]);
  releases.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const id of ["baseline-select", "current-select"]) {
    const select = document.getElementById(id);
    select.innerHTML = '<option value="">Select release</option>';
    for (const release of releases) {
      const option = document.createElement("option");
      option.value = release.id;
      option.textContent = `${release.label} — ${release.origin || "origin not set"}`;
      select.appendChild(option);
    }
  }
  document.getElementById("threshold").value = settings.thresholdPercent ?? 1;
  document.getElementById("pixel-tolerance").value = settings.pixelTolerance ?? 25;
  document.getElementById("query-mode").value = settings.queryMode || "preserve";
  document.getElementById("ignore-query").value = (settings.ignoreQueryParams || []).join(", ");
  document.getElementById("apply-settings").addEventListener("click", applySettings);
  document.getElementById("baseline-select").addEventListener("change", renderRoutes);
  document.getElementById("current-select").addEventListener("change", renderRoutes);
  document.getElementById("compare-all").addEventListener("click", compareAllRoutes);
  document.getElementById("export-all-json").addEventListener("click", exportAllJson);
  window._deployLens = { releases, snapshots };
  if (releases.length) document.getElementById("baseline-select").value = releases.at(-1)?.id || releases[0].id;
  if (releases.length > 1) document.getElementById("current-select").value = releases[0].id;
  renderRoutes();
}

async function applySettings() {
  const ignore = document.getElementById("ignore-query").value.split(",").map((x) => x.trim()).filter(Boolean);
  await storage.setSettings({
    thresholdPercent: Number(document.getElementById("threshold").value),
    pixelTolerance: Number(document.getElementById("pixel-tolerance").value),
    ignoreQueryParams: ignore,
    queryMode: document.getElementById("query-mode").value
  });
  renderRoutes();
}

function latest(snapshots, releaseId, route) {
  return snapshots.filter((item) => item.releaseId === releaseId && item.route === route).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
}

async function renderRoutes() {
  const baselineId = document.getElementById("baseline-select").value;
  const currentId = document.getElementById("current-select").value;
  const list = document.getElementById("route-list");
  list.replaceChildren();
  if (!baselineId || !currentId) {
    document.getElementById("detail").innerHTML = '<p class="empty">Select both releases to compare captured routes.</p>';
    return;
  }
  const { releases, snapshots } = window._deployLens;
  const baselineSnapshots = snapshots.filter((item) => item.releaseId === baselineId);
  const currentSnapshots = snapshots.filter((item) => item.releaseId === currentId);
  const routes = [...new Set([...baselineSnapshots, ...currentSnapshots].map((item) => item.route))].sort();
  if (!routes.length) {
    list.innerHTML = '<li class="empty">No captured routes.</li>';
    document.getElementById("release-summary").innerHTML = "<h3>Release coverage</h3><p>No route snapshots captured.</p>";
    return;
  }
  const settings = await storage.getSettings();
  let changedCount = 0;
  let unchangedCount = 0;
  let notComparableCount = 0;
  let missingCount = 0;
  for (const route of routes) {
    const before = latest(snapshots, baselineId, route);
    const after = latest(snapshots, currentId, route);
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.textContent = route;
    const badge = document.createElement("span");
    badge.className = "badge";
    if (!before || !after) {
      badge.textContent = "Missing";
      badge.className += " incompatible";
      missingCount++;
    } else {
      const quick = await quickResult(before, after, settings);
      badge.textContent = quick.state === "changed" ? "Changed" : quick.state === "incompatible" ? "Not comparable" : "No significant change";
      badge.className += ` ${quick.state}`;
      if (quick.state === "changed") changedCount++;
      else if (quick.state === "unchanged") unchangedCount++;
      else notComparableCount++;
    }
    button.appendChild(badge);
    button.addEventListener("click", () => openPair(before, after, route));
    li.appendChild(button);
    list.appendChild(li);
  }
  document.getElementById("release-summary").innerHTML =
    `<h3>Release coverage</h3><p>${routes.length} route${routes.length === 1 ? "" : "s"} in scope<br>` +
    `${changedCount} changed • ${unchangedCount} unchanged • ${notComparableCount} not comparable • ${missingCount} missing</p>`;
}

async function compareAllRoutes() {
  const baselineId = document.getElementById("baseline-select").value;
  const currentId = document.getElementById("current-select").value;
  const { snapshots } = window._deployLens;
  const baselineSnapshots = snapshots.filter((item) => item.releaseId === baselineId);
  const currentSnapshots = snapshots.filter((item) => item.releaseId === currentId);
  const routes = [...new Set([...baselineSnapshots, ...currentSnapshots].map((item) => item.route))].sort();
  if (!routes.length) {
    document.getElementById("detail").innerHTML = '<p class="empty">No routes are available to compare.</p>';
    return;
  }
  const detail = document.getElementById("detail");
  detail.innerHTML = '<p class="status">Comparing all captured routes...</p>';
  const settings = await storage.getSettings();
  const rows = [];
  for (const route of routes) {
    const before = latest(snapshots, baselineId, route);
    const after = latest(snapshots, currentId, route);
    if (!before || !after) {
      rows.push({ route, state: "missing", text: "Missing snapshot" });
      continue;
    }
    try {
      const result = await quickResult(before, after, settings);
      rows.push({
        route,
        state: result.state,
        text: result.state === "incompatible"
          ? "Not comparable"
          : result.state === "changed"
            ? `Changed — ${result.changedPercent.toFixed(2)}%`
            : `No significant change — ${result.changedPercent.toFixed(2)}%`
      });
    } catch (error) {
      rows.push({ route, state: "incompatible", text: `Comparison failed — ${error.message}` });
    }
  }
  detail.innerHTML = `
    <div class="context-card" style="margin-bottom:12px">
      <h3>All-route comparison</h3>
      <p>${rows.filter((row) => row.state === "changed").length} changed • ${rows.filter((row) => row.state === "unchanged").length} unchanged • ${rows.filter((row) => row.state === "incompatible").length} not comparable • ${rows.filter((row) => row.state === "missing").length} missing</p>
    </div>
    <div class="context-card">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr><th style="text-align:left;padding:8px;border-bottom:1px solid #e4e7ec">Route</th><th style="text-align:left;padding:8px;border-bottom:1px solid #e4e7ec">Result</th></tr></thead>
        <tbody>${rows.map((row) => `<tr><td style="padding:8px;border-bottom:1px solid #f0f2f5">${escapeHtml(row.route)}</td><td style="padding:8px;border-bottom:1px solid #f0f2f5"><span class="badge ${row.state === "changed" ? "changed" : row.state === "unchanged" ? "unchanged" : "incompatible"}">${escapeHtml(row.text)}</span></td></tr>`).join("")}</tbody>
      </table>
    </div>`;
  document.querySelector(".review-main").scrollIntoView({ behavior: "smooth", block: "start" });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("A captured snapshot could not be decoded."));
    image.src = src;
  });
}

async function imageData(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
}

async function quickResult(before, after, settings) {
  if (!before || !after) return { state: "incompatible" };
  const [beforeImage, afterImage] = await Promise.all([loadImage(before.image), loadImage(after.image)]);
  const [beforeData, afterData] = await Promise.all([imageData(beforeImage), imageData(afterImage)]);
  return diffApi.analyzeImageData(beforeData, afterData, {
    threshold: (settings.thresholdPercent ?? 1) / 100,
    pixelTolerance: settings.pixelTolerance ?? 25,
    masks: before.masks || []
  });
}

async function openPair(before, after, route) {
  selectedPair = { before, after, route };
  const detail = document.getElementById("detail");
  if (!before || !after) {
    detail.innerHTML = `<div class="context-grid"><div class="context-card"><h3>Route</h3><p>${escapeHtml(route)}</p></div></div><p class="status error">This route is missing a snapshot in one release. Capture it again in both releases.</p>`;
    return;
  }
  detail.innerHTML = '<p class="status">Computing visual comparison...</p>';
  try {
    const [beforeImage, afterImage] = await Promise.all([loadImage(before.image), loadImage(after.image)]);
    const [beforeData, afterData] = await Promise.all([imageData(beforeImage), imageData(afterImage)]);
    const settings = await storage.getSettings();
    selectedResult = diffApi.analyzeImageData(beforeData, afterData, {
      threshold: (settings.thresholdPercent ?? 1) / 100,
      pixelTolerance: settings.pixelTolerance ?? 25,
      masks: [...(before.masks || []), ...(after.masks || [])]
    });
    renderDetail(before, after, beforeImage, afterImage);
  } catch (error) {
    detail.innerHTML = `<p class="status error">${escapeHtml(error.message)}</p>`;
  }
}

function escapeHtml(value) {
  const span = document.createElement("span");
  span.textContent = value ?? "";
  return span.innerHTML;
}

function nearbyContext(snapshot, bounds) {
  if (!bounds || !snapshot?.candidates) return "No nearby DOM candidate";
  const candidates = snapshot.candidates.filter((item) => {
    const rect = item.rect;
    return rect.x < bounds.maxX && rect.x + rect.width > bounds.minX && rect.y < bounds.maxY && rect.y + rect.height > bounds.minY;
  });
  if (!candidates.length) return "No nearby visible element context";
  return candidates.slice(0, 4).map((item) => `"${item.text || item.tag}" (${item.selector})`).join("\n");
}

function renderDetail(before, after, beforeImage, afterImage) {
  const beforeRelease = window._deployLens.releases.find((item) => item.id === before.releaseId);
  const afterRelease = window._deployLens.releases.find((item) => item.id === after.releaseId);
  const result = selectedResult;
  let resultText = "";
  if (result.state === "incompatible") {
    resultText = `Not comparable: ${result.beforeWidth}×${result.beforeHeight} before vs ${result.afterWidth}×${result.afterHeight} after.`;
  } else if (result.state === "changed") {
    resultText = `Changed: ${result.changedPercent.toFixed(2)}% of comparable pixels.`;
  } else {
    resultText = `No significant visual change (${result.changedPercent.toFixed(2)}%).`;
  }
  const detail = document.getElementById("detail");
  detail.innerHTML = `
    <div class="context-grid">
      <div class="context-card"><h3>Route</h3><p>${escapeHtml(selectedPair.route)}</p></div>
      <div class="context-card"><h3>Result</h3><p>${escapeHtml(resultText)}</p></div>
      <div class="context-card"><h3>Nearby UI context</h3><p>${escapeHtml(nearbyContext(after, result.bounds))}</p></div>
      <div class="context-card"><h3>Release metadata</h3><p>${escapeHtml([`${beforeRelease?.label || "Baseline"} → ${afterRelease?.label || "Current"}`, beforeRelease?.commit ? `Baseline commit: ${beforeRelease.commit}` : "", afterRelease?.commit ? `Current commit: ${afterRelease.commit}` : ""].filter(Boolean).join("\n"))}</p></div>
      <div class="context-card"><h3>Capture details</h3><p>${escapeHtml(`Before: ${before.viewport.width}×${before.viewport.height}, ${new Date(before.capturedAt).toLocaleString()}\nAfter: ${after.viewport.width}×${after.viewport.height}, ${new Date(after.capturedAt).toLocaleString()}`)}</p></div>
      <div class="context-card"><h3>User-provided files</h3><p>${escapeHtml([...(beforeRelease?.changedFiles || []), ...(afterRelease?.changedFiles || [])].filter((v, i, a) => a.indexOf(v) === i).join("\n") || "No file-level attribution")}</p></div>
    </div>
    <div class="viewer">
      <div class="view-tabs" role="tablist">
        <button id="view-before" role="tab">Baseline</button>
        <button id="view-after" role="tab">Current</button>
        <button id="view-difference" role="tab" class="active">Difference</button>
      </div>
      <div class="canvas-wrap"><canvas id="comparison-canvas"></canvas></div>
      <div class="view-actions">
        <button id="export-json">Export local JSON report</button>
        <button id="export-image" ${result.state === "incompatible" ? "disabled" : ""}>Export difference image</button>
      </div>
      <p style="color:#d1d5db;font-size:12px">Commit and changed-file metadata is user-supplied. It is not automatically attributed to any visual region.</p>
    </div>`;
  drawView(beforeImage, afterImage);
  document.getElementById("view-before").addEventListener("click", () => { viewMode = "before"; drawView(beforeImage, afterImage); });
  document.getElementById("view-after").addEventListener("click", () => { viewMode = "after"; drawView(beforeImage, afterImage); });
  document.getElementById("view-difference").addEventListener("click", () => { viewMode = "difference"; drawView(beforeImage, afterImage); });
  document.getElementById("export-json").addEventListener("click", exportJson);
  document.getElementById("export-image").addEventListener("click", () => exportImage(beforeImage, afterImage));
}

function findChangedRegions(heatmap, width, height) {
  const blockSize = Math.max(8, Math.round(Math.min(width, height) / 60));
  const gridWidth = Math.ceil(width / blockSize);
  const gridHeight = Math.ceil(height / blockSize);
  const grid = new Uint8Array(gridWidth * gridHeight);

  for (let gy = 0; gy < gridHeight; gy++) {
    for (let gx = 0; gx < gridWidth; gx++) {
      let changed = 0;
      const startX = gx * blockSize;
      const startY = gy * blockSize;
      const endX = Math.min(width, startX + blockSize);
      const endY = Math.min(height, startY + blockSize);
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          if (heatmap[y * width + x]) changed++;
        }
      }
      if (changed >= 2) grid[gy * gridWidth + gx] = 1;
    }
  }

  const visited = new Uint8Array(grid.length);
  const regions = [];
  for (let gy = 0; gy < gridHeight; gy++) {
    for (let gx = 0; gx < gridWidth; gx++) {
      const start = gy * gridWidth + gx;
      if (!grid[start] || visited[start]) continue;
      const queue = [start];
      visited[start] = 1;
      let minGX = gx;
      let maxGX = gx;
      let minGY = gy;
      let maxGY = gy;
      let size = 0;
      while (queue.length) {
        const index = queue.pop();
        const cy = Math.floor(index / gridWidth);
        const cx = index - cy * gridWidth;
        size++;
        minGX = Math.min(minGX, cx);
        maxGX = Math.max(maxGX, cx);
        minGY = Math.min(minGY, cy);
        maxGY = Math.max(maxGY, cy);
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue;
            const nx = cx + ox;
            const ny = cy + oy;
            if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue;
            const neighbor = ny * gridWidth + nx;
            if (grid[neighbor] && !visited[neighbor]) {
              visited[neighbor] = 1;
              queue.push(neighbor);
            }
          }
        }
      }
      if (size >= 2) {
        regions.push({
          minX: minGX * blockSize,
          minY: minGY * blockSize,
          maxX: Math.min(width - 1, (maxGX + 1) * blockSize - 1),
          maxY: Math.min(height - 1, (maxGY + 1) * blockSize - 1)
        });
      }
    }
  }
  regions.sort((a, b) => (b.maxX - b.minX) * (b.maxY - b.minY) - (a.maxX - a.minX) * (a.maxY - a.minY));
  return regions.slice(0, 25);
}

function drawView(beforeImage, afterImage) {
  const canvas = document.getElementById("comparison-canvas");
  if (!canvas) return;
  const result = selectedResult;
  if (result.state === "incompatible") {
    canvas.width = 800;
    canvas.height = 200;
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#172033";
    context.font = "18px Segoe UI";
    context.fillText(`Viewport mismatch: ${result.beforeWidth}×${result.beforeHeight} vs ${result.afterWidth}×${result.afterHeight}`, 24, 100);
    return;
  }
  const source = viewMode === "before" ? beforeImage : afterImage;
  canvas.width = source.naturalWidth;
  canvas.height = source.naturalHeight;
  const context = canvas.getContext("2d");
  context.drawImage(viewMode === "difference" ? afterImage : source, 0, 0);
  if (viewMode === "difference") {
    context.save();
    context.fillStyle = "rgba(220, 38, 38, 0.48)";
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (result.heatmap[y * canvas.width + x]) context.fillRect(x, y, 1, 1);
      }
    }
    context.strokeStyle = "#ef4444";
    context.lineWidth = Math.max(2, Math.round(canvas.width / 500));
    context.setLineDash([]);
    for (const region of findChangedRegions(result.heatmap, canvas.width, canvas.height)) {
      const padding = Math.max(3, Math.round(canvas.width / 300));
      context.strokeRect(
        Math.max(0, region.minX - padding),
        Math.max(0, region.minY - padding),
        Math.min(canvas.width, region.maxX + padding + 1) - Math.max(0, region.minX - padding),
        Math.min(canvas.height, region.maxY + padding + 1) - Math.max(0, region.minY - padding)
      );
    }
    context.restore();
  }
  document.querySelectorAll(".view-tabs button").forEach((button) => button.classList.remove("active"));
  document.getElementById(`view-${viewMode}`).classList.add("active");
}

async function exportAllJson() {
  const baselineId = document.getElementById("baseline-select").value;
  const currentId = document.getElementById("current-select").value;
  if (!baselineId || !currentId) {
    document.getElementById("detail").innerHTML = '<p class="status error">Select baseline and current releases before exporting.</p>';
    return;
  }
  const { releases, snapshots } = window._deployLens;
  const baseline = releases.find((item) => item.id === baselineId);
  const current = releases.find((item) => item.id === currentId);
  const baselineSnapshots = snapshots.filter((item) => item.releaseId === baselineId);
  const currentSnapshots = snapshots.filter((item) => item.releaseId === currentId);
  const routes = [...new Set([...baselineSnapshots, ...currentSnapshots].map((item) => item.route))].sort();
  const settings = await storage.getSettings();
  const routeReports = [];
  for (const route of routes) {
    const before = latest(snapshots, baselineId, route);
    const after = latest(snapshots, currentId, route);
    if (!before || !after) {
      routeReports.push({ route, state: "missing", message: "Missing snapshot in one release" });
      continue;
    }
    try {
      const result = await quickResult(before, after, settings);
      routeReports.push({
        route,
        state: result.state,
        changedPercent: result.changedPercent,
        changedPixels: result.changedPixels,
        comparablePixels: result.comparablePixels,
        nearbyUiContext: nearbyContext(after, result.bounds),
        capture: {
          baseline: { capturedAt: before.capturedAt, viewport: before.viewport },
          current: { capturedAt: after.capturedAt, viewport: after.viewport }
        }
      });
    } catch (error) {
      routeReports.push({ route, state: "incompatible", message: error.message });
    }
  }
  const report = {
    tool: "DeployLens",
    exportedAt: new Date().toISOString(),
    comparisonScope: "All captured routes",
    baseline,
    current,
    routeCount: routes.length,
    routes: routeReports,
    resultDisclaimer: "Visual comparison only. Commit and file metadata is user-provided and not automatically attributed to visual regions."
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  downloadBlob(blob, `deploylens-all-routes-${baseline?.label || "baseline"}-to-${current?.label || "current"}.json`);
}

function exportJson() {
  if (!selectedPair) return;
  const beforeRelease = window._deployLens.releases.find((item) => item.id === selectedPair.before.releaseId);
  const afterRelease = window._deployLens.releases.find((item) => item.id === selectedPair.after.releaseId);
  const report = {
    tool: "DeployLens",
    exportedAt: new Date().toISOString(),
    route: selectedPair.route,
    baseline: beforeRelease,
    current: afterRelease,
    capture: {
      baseline: { capturedAt: selectedPair.before.capturedAt, viewport: selectedPair.before.viewport, pageUrl: selectedPair.before.pageUrl },
      current: { capturedAt: selectedPair.after.capturedAt, viewport: selectedPair.after.viewport, pageUrl: selectedPair.after.pageUrl }
    },
    result: selectedResult,
    resultDisclaimer: "Visual comparison only. Commit and file metadata is user-provided and not inferred.",
    nearbyUiContext: nearbyContext(selectedPair.after, selectedResult.bounds)
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  downloadBlob(blob, `deploylens-${selectedPair.route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "route"}.json`);
}

function exportImage() {
  const canvas = document.getElementById("comparison-canvas");
  if (!canvas) return;
  canvas.toBlob((blob) => blob && downloadBlob(blob, "deploylens-difference.png"), "image/png");
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

load();
