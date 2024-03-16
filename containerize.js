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

let accountMap = {};

function randomIcon() {
  return availableContainerIcons[Math.random() * availableContainerIcons.length | 0]
}

function randomColor() {
  return availableContainerColors[Math.random() * availableContainerColors.length | 0]
}

async function prepareContainer({ name, color, icon }) {
  const containers = await browser.contextualIdentities.query({
    name: name,
  });

  if (containers.length >= 1) {
    return containers[0];
  } else {
    return await browser.contextualIdentities.create({
      name: name,
      color: color || randomColor(),
      icon: icon || randomIcon(),
    });
  }
}

function listener(details) {

  // Temporarily commenting out as users seem to not like this
  // https://github.com/pyro2927/AWS_SSO_Containers/issues/6
  /*
  if (details.cookieStoreId != "firefox-default") {
    return {};
  }*/

  // Intercept our response

  let filter = browser.webRequest.filterResponseData(details.requestId);

  let queryString = new URLSearchParams(details.url.split("?")[1]);
  // Parse some params for container name
  let accountRole = queryString.get("role_name");
  let accountNumber = queryString.get("account_id");

  // pull subdomain for folks that might have multiple SSO
  // portals that have access to the same account and role names
  let host = /:\/\/([^\/]+)/.exec(details.originUrl)[1];
  let subdomain = host.split(".")[0];

  let params = {
    'number': accountNumber,
    'role': accountRole,
    'subdomain': subdomain
  };
  if(accountMap[accountNumber] !== undefined){
    params["name"] = accountMap[accountNumber]["name"];
    params["email"] = accountMap[accountNumber]["email"];
  }

  let name = containerNameTemplate;

  for (const [key, value] of Object.entries(params)) {
    name = name.replace(key, value);
  }

  let str = '';
  let decoder = new TextDecoder("utf-8");
  let encoder = new TextEncoder();

  filter.ondata = event => {
    str += decoder.decode(event.data, { stream: true });
  };

  filter.onstop = async event => {

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

        const container = await prepareContainer({ name });

        const createTabParams = {
          cookieStoreId: container.cookieStoreId,
          url: url,
          pinned: false
        };

        // get index of tab we're about to remove, put ours at that spot
        const tab = await browser.tabs.get(details.tabId);

        createTabParams.index = tab.index;
        browser.tabs.create(createTabParams);

        browser.tabs.remove(details.tabId);
      } else {
        filter.write(encoder.encode(str));
      }
    }
    filter.close();
  };

  return {};
}
function accountNameListener(details) {
  // Intercept our response
  let filter = browser.webRequest.filterResponseData(details.requestId);

  let str = '';
  let decoder = new TextDecoder("utf-8");
  let encoder = new TextEncoder();

  filter.ondata = event => {
    str += decoder.decode(event.data, { stream: true });
  };
  filter.onstop = event => {
    filter.write(encoder.encode(str));
    // The first OPTIONS request has no response body
    if (str.length > 0) {
      // signInToken
      // signInFederationLocation
      // destination
      const object = JSON.parse(str);

      for (result of object.result) {
        if(result["searchMetadata"]){
          accountMap[result["searchMetadata"]["AccountId"]] = {
            "name": result["searchMetadata"]["AccountName"],
            "email": result["searchMetadata"]["AccountEmail"]
          }
        }
      }
    }
    filter.close();
  }
  
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
  {
    urls: [
      "https://*.amazonaws.com/federation/console?*",
      "https://*.amazonaws-us-gov.com/federation/console?*",
      "https://*.amazonaws.cn/federation/console?*"
    ], types: ["xmlhttprequest"]
  },
  ["blocking"]
);
browser.webRequest.onBeforeRequest.addListener(
  accountNameListener,
  {
    urls: [
      "https://*.amazonaws.com/instance/appinstances"
    ], types: ["xmlhttprequest"]
  },
  ["blocking"]
);