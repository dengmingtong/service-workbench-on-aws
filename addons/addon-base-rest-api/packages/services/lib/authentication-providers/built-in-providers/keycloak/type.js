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

const inputSchema = require('./keycloak-config-schema');

module.exports = {
  type: 'keycloak',
  title: 'keycloak',
  description: 'Authentication provider for keycloak',
  config: {
    credentialHandlingType: 'keycloak',
    inputSchema,

    impl: {
      // the tokenValidatorLocator is used in all cases
      tokenValidatorLocator: 'locator:service:keycloakAuthenticationProviderService/validateToken',

      // The token revocation locator is used to revoke a token upon logout.
      tokenRevokerLocator: 'locator:service:keycloakAuthenticationProviderService/revokeToken',

      // Similar to above locators. The provisionerLocator identifies an implementation that takes care of provisioning the authentication provider.
      // In case of Internal Authentication Provider this "provisioning" step may be as simple as adding authentication provider configuration in Data Base.
      // In case of other auth providers, this step may be more elaborate (for example, in case of Cognito + SAML, the provisioner has to create Cognito User Pool,
      // configure cognito client application, configure SAML identity providers in the Cognito User Pool etc.
      provisionerLocator: 'locator:service:keycloakAuthenticationProvisionerService/provision',
    },
  },
};
