# AWS SSO Containers

![](./img/containers.png)

This Firefox extension routes [AWS SSO](https://aws.amazon.com/single-sign-on/) requests into their own containers so you can log in to multiple accounts/roles simultaneously.

## How It Works

![](./img/sso.png)

When you click on "Management console" for any account/role in AWS SSO, it makes a request for signing tokens and then redirects you to the federation location. The extension intercepts this request and loads the federation location in a container. Container names are `<ACCOUNT_NAME> <ROLE_NAME>` and are assigned a random color/icon. You can change the colors/icons to whatever you like, as it only uses the container name to reference them.

## Notes

This extension is pretty basic. If you're looking for something more advanced, check out [Granted](https://docs.commonfate.io/granted/introduction).

Thanks to <https://github.com/honsiorovskyi/open-url-in-container> for a majority of the container code.