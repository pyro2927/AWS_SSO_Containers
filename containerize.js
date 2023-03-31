// Container code mostly taken from
// https://github.com/honsiorovskyi/open-url-in-container
const availableContainerIcons = [
  "fingerprint",
  "briefcase",
  "dollar",
  "cart",
  "circle",
  "gift",
  "vacation",
  "food",
  "fruit",
  "pet",
  "tree",
  "chill",
  "fence"
];

const availableContainerColors = [
  'blue',
  'turquoise',
  'green',
  'yellow',
  'orange',
  'red',
  'pink',
  'purple',
]

let containerNameTemplate = "name role";

function randomIcon() {
  return availableContainerIcons[Math.random() * availableContainerIcons.length | 0]
}

function randomColor() {
  return availableContainerColors[Math.random() * availableContainerColors.length | 0]
}

function prepareContainer({ name, color, icon, cb }) {
  browser.contextualIdentities.query({
    name: name,
  }).then(function(containers) {
    if (containers.length >= 1) {
      cb(containers[0]);
    } else {
      browser.contextualIdentities.create({
        name: name,
        color: color || randomColor(),
        icon: icon || randomIcon(),
      }).then(function(container) {
        cb(container);
      });
    }
  });
}

function listener(details) {

  // If we're in a container already, skip
  if (details.cookieStoreId != "firefox-default") {
    return {};
  }

  // Intercept our response
  let filter = browser.webRequest.filterResponseData(details.requestId);

  // Parse some params for container name
  let accountRole = details.url.split("=")[2];
  // account is account ID and account name in parens
  let account = decodeURIComponent(details.originUrl.split("/")[7]);
  let accountName = account.split("(")[1].slice(0, -1);
  let accountNumber = account.split(" ")[0];

  const params = {
    'name': accountName,
    'number': accountNumber,
    'role': accountRole
  };

  let name = containerNameTemplate;

  for (const [key, value] of Object.entries(params)) {
    name = name.replace(key, value);
  }

  let str = '';
  let decoder = new TextDecoder("utf-8");
  let encoder = new TextEncoder();

  filter.ondata = event => {
    str += decoder.decode(event.data, {stream: true});
  };

  filter.onstop = event => {

    // The first OPTIONS request has no response body
    if (str.length > 0) {
      // signInToken
      // signInFederationLocation
      // destination
      const object = JSON.parse(str);

      // If we have a sign-in token, hijack this into a container
      if (object.signInToken) {
        let destination = object.destination;
        if (!destination) {
          destination = "https://console.aws.amazon.com";
        }

        // Generate our federation URI and open it in a container
        const url = object.signInFederationLocation + "?Action=login&SigninToken=" + object.signInToken + "&Issuer=" + encodeURIComponent(details.originUrl) + "&Destination=" + encodeURIComponent(destination);
        prepareContainer({name: name, cb: function(container) {
          const createTabParams = {
            cookieStoreId: container.cookieStoreId,
            url: url,
            pinned: false
          };

          browser.tabs.create(createTabParams);
          browser.tabs.remove(details.tabId);
        }});
      } else {
        filter.write(encoder.encode(str));
      }
    }
    filter.close();
  };

  return {};
}

// Fetch our custom defined container name template
function onGot(item) {
  containerNameTemplate = item.template || "name role";
}

function onError(error) {
  console.log("No custom template for AWS SSO containers, using default");
}

let getting = browser.storage.sync.get("template");
getting.then(onGot, onError);

browser.webRequest.onBeforeRequest.addListener(
  listener,
  {urls: [
    "https://*.amazonaws.com/federation/console?*",
    "https://*.amazonaws-us-gov.com/federation/console?*",
    "https://*.amazonaws.cn/federation/console?*"
  ], types: ["xmlhttprequest"]},
  ["blocking"]
);