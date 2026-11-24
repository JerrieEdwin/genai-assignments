const storage = DeployLensStorage;
const routeApi = DeployLensRoute;
let masks = [];

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setStatus(id, message, kind = "") {
  const element = document.getElementById(id);
  element.textContent = message;
  element.className = `status ${kind}`;
}

async function refreshReleases() {
  const releases = await storage.getAll("releases");
  releases.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const selectId of ["baseline-select", "current-select"]) {
    const select = document.getElementById(selectId);
    const previous = select.value;
    select.innerHTML = '<option value="">Select a release</option>';
    for (const release of releases) {
      const option = document.createElement("option");
      option.value = release.id;
      option.textContent = `${release.label} — ${release.origin || "origin not set"}`;
      select.appendChild(option);
    }
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
  }
  refreshCaptureCounts();
}

async function refreshCaptureCounts() {
  const releaseIds = ["baseline-select", "current-select"]
    .map((id) => document.getElementById(id).value)
    .filter(Boolean);
  if (!releaseIds.length) return;
  const snapshots = await storage.getAll("snapshots");
  const releases = await storage.getAll("releases");
  const counts = releaseIds.map((id) => {
    const release = releases.find((item) => item.id === id);
    const captured = snapshots.filter((item) => item.releaseId === id);
    const uniqueRoutes = new Set(captured.map((item) => item.route)).size;
    return release ? `${release.label}: ${uniqueRoutes} captured route${uniqueRoutes === 1 ? "" : "s"}` : "";
  }).filter(Boolean);
  if (counts.length) setStatus("capture-status", counts.join(" • "), "");
}

document.getElementById("baseline-select").addEventListener("change", refreshCaptureCounts);
document.getElementById("current-select").addEventListener("change", refreshCaptureCounts);

document.getElementById("create-release").addEventListener("click", async () => {
  const label = document.getElementById("release-label").value.trim();
  if (!label) {
    setStatus("create-status", "Enter a release label.", "error");
    return;
  }
  const origin = document.getElementById("release-origin").value.trim();
  if (origin) {
    try { new URL(origin); } catch (_) {
      setStatus("create-status", "Deployment origin must be a complete URL.", "error");
      return;
    }
  }
  const release = {
    id: uid("release"),
    label,
    origin,
    commit: document.getElementById("release-commit").value.trim(),
    notes: document.getElementById("release-notes").value.trim(),
    changedFiles: document.getElementById("release-files").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    routeInventory: document.getElementById("release-routes").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    createdAt: new Date().toISOString()
  };
  await storage.putRelease(release);
  document.getElementById("baseline-select").value = release.id;
  document.getElementById("release-label").value = "";
  document.getElementById("release-origin").value = "";
  document.getElementById("release-commit").value = "";
  document.getElementById("release-notes").value = "";
  document.getElementById("release-files").value = "";
  document.getElementById("release-routes").value = "";
  await refreshReleases();
  setStatus("create-status", `Created release "${release.label}".`, "success");
});

function renderMasks() {
  const list = document.getElementById("mask-list");
  list.replaceChildren();
  masks.forEach((mask, index) => {
    const li = document.createElement("li");
    li.textContent = `x:${mask.x} y:${mask.y} w:${mask.width} h:${mask.height}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => { masks.splice(index, 1); renderMasks(); });
    li.appendChild(remove);
    list.appendChild(li);
  });
}

document.getElementById("add-mask").addEventListener("click", () => {
  const mask = {
    x: Number(document.getElementById("mask-x").value),
    y: Number(document.getElementById("mask-y").value),
    width: Number(document.getElementById("mask-w").value),
    height: Number(document.getElementById("mask-h").value)
  };
  if ([mask.x, mask.y, mask.width, mask.height].some((value) => !Number.isFinite(value) || value < 0) || mask.width < 1 || mask.height < 1) {
    setStatus("capture-status", "Mask dimensions must be positive viewport pixels.", "error");
    return;
  }
  masks.push(mask);
  renderMasks();
});

async function captureFor(releaseSelectId) {
  const releaseId = document.getElementById(releaseSelectId).value;
  if (!releaseId) {
    setStatus("capture-status", "Select or create a release first.", "error");
    return;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab is available.");
    if (!/^https?:\/\//i.test(tab.url || "")) {
      throw new Error("Browser-internal pages and unsupported schemes cannot be captured.");
    }
    const settings = await storage.getSettings();
    const route = routeApi.normalizeRoute(tab.url, settings);
    const [{ result: context }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        title: document.title,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        candidates: [...document.querySelectorAll("button,a,input,[role='button'],h1,h2,h3,label,table,form")]
          .slice(0, 300)
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              tag: element.tagName.toLowerCase(),
              text: (element.innerText || element.getAttribute("aria-label") || element.value || "").trim().slice(0, 160),
              selector: element.id ? `#${element.id}` : element.className && typeof element.className === "string" ? `.${element.className.trim().split(/\s+/).join(".")}` : element.tagName.toLowerCase(),
              rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
            };
          })
          .filter((item) => item.rect.width > 0 && item.rect.height > 0)
      })
    });
    const dataUrl = await chrome.tabs.captureVisibleTab({ format: "png" });
    const release = await storage.getRelease(releaseId);
    const snapshot = {
      id: uid("snapshot"),
      releaseId,
      route,
      pageUrl: tab.url,
      capturedAt: new Date().toISOString(),
      viewport: { width: context.viewportWidth, height: context.viewportHeight, devicePixelRatio: context.devicePixelRatio },
      scroll: { x: context.scrollX, y: context.scrollY },
      masks: [...masks],
      pageTitle: context.title,
      candidates: context.candidates,
      image: dataUrl
    };
    await storage.putSnapshot(snapshot);
    const allSnapshots = await storage.getAll("snapshots");
    const capturedRoutes = new Set(allSnapshots.filter((item) => item.releaseId === releaseId).map((item) => item.route)).size;
    setStatus("capture-status", `Captured ${route} into "${release.label}". ${capturedRoutes} route${capturedRoutes === 1 ? "" : "s"} captured for this release.`, "success");
  } catch (error) {
    setStatus("capture-status", error?.message || "Capture failed.", "error");
  }
}

document.getElementById("capture-baseline").addEventListener("click", () => captureFor("baseline-select"));
document.getElementById("capture-current").addEventListener("click", () => captureFor("current-select"));
document.getElementById("open-review").addEventListener("click", () => chrome.runtime.sendMessage({ type: "OPEN_REVIEW" }));

refreshReleases();
