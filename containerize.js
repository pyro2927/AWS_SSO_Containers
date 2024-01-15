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
let containerNameLength = 0;
let containerNameSlug = "";

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

  const queryString = new URL(details.url).searchParams;
  const originParams = new URLSearchParams(details.originUrl.split('?').slice(1).join('?'));

  // Parse some params for container name
  let accountRole = queryString.get("role_name");
  let accountNumber = queryString.get("account_id");

  // pull subdomain for folks that might have multiple SSO
  // portals that have access to the same account and role names
  const host = new URL(details.originUrl).host;
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
  if (containerNameSlug) {
    name = name.replaceAll(containerNameSlug, "");
  }
  if (containerNameLength && name.length > containerNameLength) {
    name = name.substring(0, containerNameLength - 2) + "...";
  }

  let originDestination = originParams.get("destination");
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
        if (!originDestination) {
          if (!object.destination) {
            if (object.signInFederationLocation.includes("amazonaws-us-gov.com")) {
              destination = "https://console.amazonaws-us-gov.com";
            } else {
              destination = "https://console.aws.amazon.com";
            }
          }
        }
        else {
          destination = originDestination;
        }

        // Generate our federation URI and open it in a container
        const url = object.signInFederationLocation + "?Action=login&SigninToken=" + object.signInToken + "&Issuer=" + encodeURIComponent(details.originUrl) + "&Destination=" + encodeURIComponent(destination);

        const container = await prepareContainer({ name });

        // get index of tab we're about to remove, put ours at that spot
        const tab = await browser.tabs.get(details.tabId);

        const createTabParams = {
          cookieStoreId: container.cookieStoreId,
          url: url,
          pinned: false,
          index: tab.index,
        };

        await browser.tabs.create(createTabParams);

        await browser.tabs.remove(details.tabId);
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

async function samlListener(details) {
  if (details.statusCode != 302) {
    return {};
  }

  const setCookie = details.responseHeaders.find(header => header.name == "set-cookie");
  const redirectUrl = details.responseHeaders.find(header => header.name == "location").value;

  const cookies = setCookie.value.split('\n').map(fullCookie => fullCookie.split("; ").map(cookiePart => cookiePart.split('=')));

  const encodedUserInfo = cookies.find(cookie => cookie[0][0] == "aws-userInfo")[0][1];
  const userInfo = JSON.parse(decodeURIComponent(encodedUserInfo));
  const roleArn = userInfo.arn;
  const splitArn = roleArn.split(':');
  const splitRole = splitArn[5].split('/');

  const name = userInfo.alias;
  const number = splitArn[4];
  const role = splitRole[1];
  const email = splitRole[2];
  const subdomain = 'saml';

  let params = { name, number, role, email, subdomain };

  let containerName = containerNameTemplate;

  for (const [key, value] of Object.entries(params)) {
    containerName = containerName.replace(key, value);
  }

  const container = await prepareContainer({ name: containerName });

  const cookieAttributeMapping = {
    Path: 'path',
    SameSite: 'sameSite',
    Secure: 'secure',
    Domain: 'domain',
    Expires: 'expirationDate',
    HttpOnly: 'httpOnly',
  }

  const sameSiteMapping = {
    None: 'no_restriction',
    Lax: 'lax',
    Strict: 'strict',
  }

  for (const cookie of cookies) {
    for (const cookieAttribute of cookie.slice(1)) {
      if (cookieAttribute[0] == 'SameSite') {
        cookieAttribute[1] = sameSiteMapping[cookieAttribute[1]];
      }

      if (cookieAttribute[0] == 'Max-Age') {
        cookieAttribute[0] = 'expirationDate';
        cookieAttribute[1] = Date.now() + parseInt(cookieAttribute[1]);
      }

      if (cookieAttribute[0] == 'Expires') {
        cookieAttribute[0] = 'expirationDate';
        cookieAttribute[1] = Date.parse(cookieAttribute[1]);
      }

      if (cookieAttribute.length == 1) {
        cookieAttribute.push(true);
      }

      if (cookieAttributeMapping[cookieAttribute[0]]) {
        cookieAttribute[0] = cookieAttributeMapping[cookieAttribute[0]];
      }
    }
  }

  const cookiesToSet = cookies.map(cookie => {
    const [name, value] = cookie[0];

    return {
      ...Object.fromEntries(cookie.slice(1)),
      name,
      value,
    };
  });

  for (const cookie of cookiesToSet) {
    browser.cookies.set({
      ...cookie,
      url: details.url,
      storeId: container.cookieStoreId,
    });
  }

  const tab = await browser.tabs.get(details.tabId);

  const createTabParams = {
    cookieStoreId: container.cookieStoreId,
    url: redirectUrl,
    pinned: false,
    index: tab.index,
  };

  await browser.tabs.create(createTabParams);

  await browser.tabs.remove(details.tabId);

  return { cancel: true };
}

// Fetch our custom defined container name template
function onGot(item) {
  containerNameTemplate = item.template || "name role";
  containerNameLength = item.length || 0;
  containerNameSlug = item.slug || "";
}

function onError(error) {
  console.log("No custom template for AWS SSO containers, using default");
}

let getting = browser.storage.sync.get(["template", "length", "slug"]);
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
browser.webRequest.onHeadersReceived.addListener(
  samlListener,
  {
    urls: [
      "https://signin.aws.amazon.com/saml"
    ], types: ["main_frame"]
  },
  ["responseHeaders", "blocking"]
);
