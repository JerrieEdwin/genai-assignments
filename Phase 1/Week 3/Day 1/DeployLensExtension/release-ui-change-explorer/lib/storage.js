(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DeployLensStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DB_NAME = "deploylens";
  let dbPromise;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("releases")) db.createObjectStore("releases", { keyPath: "id" });
        if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  function tx(storeName, mode, operation) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const request = operation(tx.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
  }

  function putRelease(release) { return tx("releases", "readwrite", (store) => store.put(release)).then(() => release); }
  function putSnapshot(snapshot) { return tx("snapshots", "readwrite", (store) => store.put(snapshot)).then(() => snapshot); }
  function getAll(storeName) { return tx(storeName, "readonly", (store) => store.getAll()); }
  function getRelease(id) { return tx("releases", "readonly", (store) => store.get(id)); }
  function getSnapshot(id) { return tx("snapshots", "readonly", (store) => store.get(id)); }
  function deleteSnapshot(id) { return tx("snapshots", "readwrite", (store) => store.delete(id)); }

  async function getSettings() {
    if (!globalThis.chrome?.storage) return {};
    const values = await chrome.storage.local.get(["deployLensSettings"]);
    return values.deployLensSettings || {};
  }
  async function setSettings(settings) {
    if (!globalThis.chrome?.storage) return;
    await chrome.storage.local.set({ deployLensSettings: settings });
  }

  return { putRelease, putSnapshot, getAll, getRelease, getSnapshot, deleteSnapshot, getSettings, setSettings };
});
