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
    length: document.querySelector("#length").value || 0
  });
}

function populatePreview(text, length) {
  for (const [key, value] of Object.entries(examples)) {
    text = text.replace(key, value);
  }
  if (length && text.length > length) {
    text = text.substring(0, length - 2) + "...";
  }
  document.querySelector("#preview").value = text;
}

function restoreOptions() {
  function setCurrentChoice(result) {
    let text = result.template || "name role";
    let length = parseInt(result.length, 10);
    document.querySelector("#template").value = text;
    document.querySelector("#length").value = length || 0;
    populatePreview(text, length);
  }

  function onError(error) {
    console.log(`Error: ${error}`);
  }

  let getting = browser.storage.sync.get(["template", "length"]);
  getting.then(setCurrentChoice, onError);
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);
document.querySelector("#template").addEventListener("input", function(evt) {
  populatePreview(this.value, document.querySelector("#length").value);
});
document.querySelector("#length").addEventListener("input", function(evt) {
  populatePreview(document.querySelector("#template").value, this.value);
});
