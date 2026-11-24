(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DeployLensRoute = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeRoute(url, settings = {}) {
    const parsed = new URL(url);
    let path = parsed.pathname || "/";
    try { path = decodeURIComponent(path); } catch (_) {}
    path = path.replace(/\/+/g, "/");
    if (path.length > 1) path = path.replace(/\/+$/, "");
    const ignored = new Set((settings.ignoreQueryParams || []).map((name) => name.trim().toLower();
    const kept = [];
    for (const [name, value] of parsed.searchParams.entries()) {
      if (!ignored.has(name)) kept.push([name, value]);
    }
    kept.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    const queryMode = settings.queryMode || "preserve";
    if (queryMode === "ignore") return path;
    const query = kept.map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join("&");
    return query ? `${path}?${query}` : path;
  }
  return { normalizeRoute };
});
