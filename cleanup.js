// Cleanup of extension-created containers. See docs/superpowers/specs.
// Loaded after cleanup-lib.js and containerize.js in background.scripts.

const CLEANUP_DEFAULTS = {
  cleanupOnClose: false,
  cleanupScheduled: false,
  cleanupInterval: 60,      // minutes
  cleanupGraceSeconds: 30,
};

async function getSettings() {
  const stored = await browser.storage.sync.get(Object.keys(CLEANUP_DEFAULTS));
  const s = {};
  for (const [key, def] of Object.entries(CLEANUP_DEFAULTS)) {
    const val = stored[key];
    if (typeof def === "boolean") {
      s[key] = val === undefined ? def : Boolean(val);
    } else {
      const n = parseInt(val, 10);
      s[key] = Number.isFinite(n) && n > 0 ? n : def;
    }
  }
  return s;
}

async function getManagedIds() {
  const stored = await browser.storage.local.get("managedContainerIds");
  return stored.managedContainerIds || [];
}

async function setManagedIds(ids) {
  await browser.storage.local.set({ managedContainerIds: ids });
}

async function isEmpty(cookieStoreId) {
  const tabs = await browser.tabs.query({ cookieStoreId });
  return tabs.length === 0;
}

async function countEmptyManaged() {
  const ids = await getManagedIds();
  let count = 0;
  for (const id of ids) {
    if (await isEmpty(id)) {
      count += 1;
    }
  }
  return count;
}

// Deletes empty managed containers. Re-queries each container's tab count
// immediately before removal (authoritative check). Prunes IDs; self-heals
// if a container is already gone. Returns the number removed.
async function sweepEmptyContainers() {
  const ids = await getManagedIds();
  const survivors = [];
  let removed = 0;
  for (const id of ids) {
    if (await isEmpty(id)) {
      try {
        await browser.contextualIdentities.remove(id);
        removed += 1;
      } catch (e) {
        // Already gone; drop the id (self-heal), do not count as removed.
      }
    } else {
      survivors.push(id);
    }
  }
  await setManagedIds(survivors);
  return removed;
}

// Keep managedContainerIds tight: prune whenever ANY container is removed,
// whether by us or by the user in Firefox settings.
browser.contextualIdentities.onRemoved.addListener(async (changeInfo) => {
  const removedId = changeInfo.contextualIdentity.cookieStoreId;
  const ids = await getManagedIds();
  const next = ids.filter((id) => id !== removedId);
  if (next.length !== ids.length) {
    await setManagedIds(next);
  }
});
