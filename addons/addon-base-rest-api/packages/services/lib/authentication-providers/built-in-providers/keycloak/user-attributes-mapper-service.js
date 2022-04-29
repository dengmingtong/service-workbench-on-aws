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

const _ = require('lodash');
const Service = require('@amzn/base-services-container/lib/service');

class UserAttributesMapperService extends Service {
  mapAttributes(decodedToken) {
    console.log('mapAttributes mingtong step, decodedToken', decodedToken);
    const username = this.getUsername(decodedToken);
    const usernameInIdp  = this.getUsernameInIdp(decodedToken);
    const identityProviderName = 'keycloak';
    // const isSamlAuthenticatedUser = this.isSamlAuthenticatedUser(decodedToken);
    // const isNativePoolUser = this.isNativePoolUser(decodedToken);
    const firstName = this.getFirstName(decodedToken);
    const lastName = this.getLastName(decodedToken);
    const email = this.getEmail(decodedToken);

    return {
      username,
      usernameInIdp,
      identityProviderName,
      // isSamlAuthenticatedUser,
      // isNativePoolUser,

      firstName,
      lastName,
      email,
    };
  }

  getEmail(decodedToken) {
    return decodedToken.email;
  }

  getLastName(decodedToken) {
    return decodedToken.family_name;
  }

  getFirstName(decodedToken) {
    return decodedToken.given_name;
  }

  isSamlAuthenticatedUser(decodedToken) {
    const isSamlAuthenticatedUser =
      decodedToken.identities &&
      decodedToken.identities[0] &&
      _.toUpper(decodedToken.identities[0].providerType) === 'SAML';
    return !_.isUndefined(isSamlAuthenticatedUser) && isSamlAuthenticatedUser;
  }

  isNativePoolUser(decodedToken) {
    const issuer = decodedToken.iss;
    return !this.isSamlAuthenticatedUser(decodedToken) && _.startsWith(issuer, 'https://cognito-idp');
  }

  getIdpName(decodedToken) {
    let identityProviderName = '';
    if (decodedToken.identities && decodedToken.identities[0] && decodedToken.identities[0].providerName) {
      identityProviderName = decodedToken.identities[0].providerName;
    }
    if (identityProviderName === '' && this.isNativePoolUser(decodedToken))
      identityProviderName = 'Cognito Native Pool';
    return identityProviderName;
  }

  getUsername(decodedToken) {
    /*
    An example decodedToken contains the following user specific attributes:
    {
      "cognito:username": "AWS-SSO_some_user_id@example.com",
      "identities": [
        {
          "userId": "some_user_id@example.com",
          "providerName": "AWS-SSO",
          "providerType": "SAML",
          "issuer": "https://portal.sso.us-west-2.amazonaws.com/saml/assertion/SOMEISSUERID",
          "primary": "true",
          "dateCreated": "1596771547011"
        }]
      ...
      ...
    }
    We will get the userId from identities structure if present since it doesn't have the custom providerName
    prepended
     */
    let username = '';
    username = decodedToken.preferred_username;

    console.log('getUsername mingtong step 1, username', username);

    return username;
  }

  getUsernameInIdp(decodedToken) {
    let usernameInIdp = '';
    usernameInIdp = decodedToken.preferred_username;

    console.log('getUsernameInIdp mingtong step 1, usernameInIdp', usernameInIdp);

    return usernameInIdp;
  }  
}

module.exports = UserAttributesMapperService;
