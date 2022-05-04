/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License").
 *  You may not use this file except in compliance with the License.
 *  A copy of the License is located at
 *
 *  http://aws.amazon.com/apache2.0
 *
 *  or in the "license" file accompanying this file. This file is distributed
 *  on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 *  express or implied. See the License for the specific language governing
 *  permissions and limitations under the License.
 */

import _ from 'lodash';

import { setIdToken } from '../helpers/api';

// import keycloak from '../models/authentication/keycloak';

// import Keycloak from 'keycloak-js'

const AUTHN_EXTENSION_POINT = 'authentication';

/**
 * This is where we run the initialization logic that is common across any type of applications.
 *
 * @param payload A free form object. This function makes a property named 'tokenInfo' available on this payload object.
 * @param appContext An application context object containing various Mobx Stores, Models etc.
 *
 * @returns {Promise<void>}
 */
async function init(payload, appContext) {
  const { authentication, authenticationProviderPublicConfigsStore, pluginRegistry } = appContext;
  console.log('plugin init mingtong step 1');
  await authenticationProviderPublicConfigsStore.load();
  console.log('plugin init mingtong step 2');
  // await keycloak.init({onLoad: "check-sso"})
  // // keycloak.init({onLoad: "login-required"})
  // .then((authenticated) => {
  //   console.log('KeycloakClient init mingtong step2, authenticated', authenticated)
  //   if(authenticated) {
  //     console.log('KeycloakClient init mingtong step3, authenticated', authenticated);
  //     console.log('KeycloakClient init mingtong step4, keycloak.token', keycloak.token);
  //     console.log('KeycloakClient init mingtong step5, keycloak.clientId', keycloak.clientId);
  //     console.log('KeycloakClient init mingtong step6, keycloak.refreshToken', keycloak.refreshToken);
  //     localStorage.setItem('keycloak_token', keycloak.token);
  //     localStorage.setItem('keycloak_clientId', keycloak.clientId);
  //     localStorage.setItem('keycloak_refreshToken', keycloak.refreshToken);

  //     keycloak.loadUserInfo().then(userInfo => {
  //       localStorage.setItem('keycloak_username',userInfo.preferred_username);
  //       localStorage.setItem('keycloak_useremail',userInfo.email);
  //     });
  //     console.log('KeycloakClient init mingtong step7, ');
  //   }
  //   else {
  //     console.info("failed keycloak authentication");
  //     console.log('KeycloakClient init mingtong step8, authenticated', authenticated)
  //     // window.location.reload();
  //   }
  // })
  // .catch(function () {
  //   console.error("Something wrong keycloak authentication");
  //   // window.location.reload();
  // });  
  const tokenInfo = await authentication.getIdTokenInfo();
  payload.tokenInfo = { ...payload.tokenInfo, ...tokenInfo };

  const { idToken, decodedIdToken } = tokenInfo;
  if (tokenInfo.status === 'notExpired') {
    console.log('plugin init mingtong step 3');
    setIdToken(idToken, decodedIdToken);
    authentication.saveIdToken(idToken);
    // Set selected authentication provider. This is used during logout
    authentication.setSelectedAuthenticationProviderId(decodedIdToken.iss);

    // Notify each authentication plugins's 'loginDetected' method since we detected that the user is logged in
    // (i.e., we have active token).
    // Note that we are not passing "explicitLogin: true" or "explicitLogin: false"
    // because we can't determine for sure if this was an explicit login (i.e., the user logged in by clicking login button)
    // or we have access to the token from memory or local store because the user had logged in the past
    await pluginRegistry.runPlugins(AUTHN_EXTENSION_POINT, 'loginDetected');
  } else {
    console.log('plugin init mingtong step 4');
    // Treat all other cases such as
    //  - if the token was not found (i.e., tokenInfo.status === 'notFound') or
    //  - if the token was corrupted (i.e., tokenInfo.status === 'corrupted') or
    //  - if the token was expired (i.e., tokenInfo.status === 'expired') etc as NOT-logged in.
    // Currently the application treats "not logged in detected" as same as "logout detected" so notify all
    // authentication plugins of 'logoutDetected'
    // Note that we are not passing "explicitLogout: true" or "explicitLogout: false"
    // because we can't determine for sure if this was an explicit logout or implicit (i.e., we could not find active token)
    // Same way we are not passing 'autoLogout' flag because we can't determine for sure if this was an explicit logout
    // by user or application code due to as auto-logout (e.g., due to user inactivity)
    await pluginRegistry.runPlugins(AUTHN_EXTENSION_POINT, 'logoutDetected');
  }
}

/**
 * This is where we run the post initialization logic that is common across any type of applications.
 *
 * @param payload A free form object. This function expects a property named 'tokenInfo' to be available on the payload object.
 * @param appContext An application context object containing various Mobx Stores, Models etc.
 *
 * @returns {Promise<void>}
 */
async function postInit(payload, appContext) {
  const tokenNotExpired = _.get(payload, 'tokenInfo.status') === 'notExpired';
  if (!tokenNotExpired) return; // Continue only if we have a token that is not expired

  // Loading of userStore is required after login
  const userStore = appContext.userStore;
  await userStore.load();
}

const plugin = {
  init,
  postInit,
};

export default plugin;
