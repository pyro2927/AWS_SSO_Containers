let examples = {
  'name': 'Prod',
  'email': 'Prod@example.com',
  'number': '123456',
  'role': 'InfraEng',
  'subdomain': 'CompuGlobalHyperMegaNet'
};

function saveOptions(e) {
  e.preventDefault();
  browser.storage.sync.set({
    template: document.querySelector("#template").value,
    length: document.querySelector("#length").value || 0,
    slug: document.querySelector("#slug").value,
    cleanupOnClose: document.querySelector("#cleanupOnClose").checked,
    cleanupScheduled: document.querySelector("#cleanupScheduled").checked,
    cleanupInterval: parseInt(document.querySelector("#cleanupInterval").value, 10) || 60,
    cleanupGraceSeconds: parseInt(document.querySelector("#cleanupGraceSeconds").value, 10) || 30
  });
}

function populatePreview(text, length, slug) {
  for (const [key, value] of Object.entries(examples)) {
    text = text.replace(key, value);
  }
  if (slug) {
    text = text.replaceAll(slug, "");
  }
  if (length && text.length > length && length > 0) {
    text = text.substring(0, length - 2) + "...";
  }
  document.querySelector("#preview").value = text;
}

function restoreOptions() {
  function setCurrentChoice(result) {
    let text = result.template || "name role";
    let length = parseInt(result.length, 10);
    let slug = result.slug || "";
    document.querySelector("#template").value = text;
    document.querySelector("#length").value = length || 0;
    document.querySelector("#slug").value = slug;
    document.querySelector("#cleanupOnClose").checked = Boolean(result.cleanupOnClose);
    document.querySelector("#cleanupScheduled").checked = Boolean(result.cleanupScheduled);
    document.querySelector("#cleanupInterval").value = parseInt(result.cleanupInterval, 10) || 60;
    document.querySelector("#cleanupGraceSeconds").value = parseInt(result.cleanupGraceSeconds, 10) || 30;
    populatePreview(text, length, slug);
  }

  function onError(error) {
    console.log(`Error: ${error}`);
  }

  let getting = browser.storage.sync.get([
    "template", "length", "slug",
    "cleanupOnClose", "cleanupScheduled", "cleanupInterval", "cleanupGraceSeconds"
  ]);
  getting.then(setCurrentChoice, onError);
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);
document.querySelector("#template").addEventListener("input", function(evt) {
  let length = document.querySelector("#length").value;
  let slug = document.querySelector("#slug").value || "";
  populatePreview(this.value, length, slug);
});
document.querySelector("#length").addEventListener("input", function(evt) {
  let template = document.querySelector("#template").value;
  let slug = document.querySelector("#slug").value || "";
  populatePreview(template, this.value, slug);
});
document.querySelector("#slug").addEventListener("input", function(evt) {
  let template = document.querySelector("#template").value;
  let length = document.querySelector("#length").value;
  populatePreview(template, length, this.value || "");
});
document.querySelector("#cleanupNow").addEventListener("click", async function() {
  const status = document.querySelector("#cleanupStatus");
  const { count } = await browser.runtime.sendMessage({ action: "cleanup-count" });
  if (count === 0) {
    status.textContent = "No empty containers to remove.";
    return;
  }
  if (!window.confirm(`Delete ${count} empty containers?`)) {
    return;
  }
  const { removed } = await browser.runtime.sendMessage({ action: "cleanup-now" });
  status.textContent = `Removed ${removed} containers.`;
});
