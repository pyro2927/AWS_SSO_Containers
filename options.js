let examples = {
  'name': 'Prod',
  'email': 'Prod@example.com',
  'number': '123456',
  'role': 'InfraEng',
  'subdomain': 'MegaCorp'
};

function saveOptions(e) {
  e.preventDefault();
  browser.storage.sync.set({
    template: document.querySelector("#template").value
  });
}

function populatePreview(text) {
  for (const [key, value] of Object.entries(examples)) {
    text = text.replace(key, value);
  }
  document.querySelector("#preview").value = text;
}

function restoreOptions() {
  function setCurrentChoice(result) {
    let text = result.template || "name role";
    document.querySelector("#template").value = text;
    populatePreview(text);
  }

  function onError(error) {
    console.log(`Error: ${error}`);
  }

  let getting = browser.storage.sync.get("template");
  getting.then(setCurrentChoice, onError);
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);
document.querySelector("#template").addEventListener("input", function(evt) {
  populatePreview(this.value);
});