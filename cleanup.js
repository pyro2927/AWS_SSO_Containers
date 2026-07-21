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

let scheduledIntervalHandle = null;

async function reconfigureSchedule() {
  if (scheduledIntervalHandle !== null) {
    clearInterval(scheduledIntervalHandle);
    scheduledIntervalHandle = null;
  }
  const s = await getSettings();
  if (s.cleanupScheduled) {
    scheduledIntervalHandle = setInterval(() => {
      sweepEmptyContainers();
    }, s.cleanupInterval * 60 * 1000);
  }
}

// React to settings changes from the options page.
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") {
    return;
  }
  if (changes.cleanupScheduled || changes.cleanupInterval) {
    reconfigureSchedule();
  }
});

// One pending grace timer per cookieStoreId.
const pendingGraceTimers = new Map();

function cancelGraceTimer(cookieStoreId) {
  const handle = pendingGraceTimers.get(cookieStoreId);
  if (handle !== undefined) {
    clearTimeout(handle);
    pendingGraceTimers.delete(cookieStoreId);
  }
}

async function removeIfEmptyManaged(cookieStoreId) {
  pendingGraceTimers.delete(cookieStoreId);
  const ids = await getManagedIds();
  if (!ids.includes(cookieStoreId)) {
    return;
  }
  // Authoritative re-query at fire time.
  if (!(await isEmpty(cookieStoreId))) {
    return;
  }
  try {
    await browser.contextualIdentities.remove(cookieStoreId);
  } catch (e) {
    // already gone
  }
  // onRemoved listener prunes the id; prune here too in case the remove threw
  // because it was already gone and no event fires.
  const after = (await getManagedIds()).filter((id) => id !== cookieStoreId);
  await setManagedIds(after);
}

browser.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const s = await getSettings();
  if (!s.cleanupOnClose) {
    return;
  }
  // removeInfo does not include cookieStoreId; the tab is already gone, so
  // scan managed containers for any that are now empty and arm a timer.
  const ids = await getManagedIds();
  for (const id of ids) {
    if (await isEmpty(id)) {
      cancelGraceTimer(id);
      const handle = setTimeout(() => {
        removeIfEmptyManaged(id);
      }, s.cleanupGraceSeconds * 1000);
      pendingGraceTimers.set(id, handle);
    }
  }
});

browser.tabs.onCreated.addListener((tab) => {
  if (tab.cookieStoreId) {
    cancelGraceTimer(tab.cookieStoreId);
  }
});
