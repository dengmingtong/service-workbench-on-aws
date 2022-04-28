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
const { generateIdSync } = require('@amzn/base-services/lib/helpers/utils');
const authProviderConstants = require('../../constants').authenticationProviders;

const settingKeys = {
  awsRegion: 'awsRegion',
  envName: 'envName',
  envType: 'envType',
  solutionName: 'solutionName',
  websiteUrl: 'websiteUrl',
  enableUserSignUps: 'enableUserSignUps',
  enableNativeUserPoolUsers: 'enableNativeUserPoolUsers',
  autoConfirmNativeUsers: 'autoConfirmNativeUsers',
  namespace: 'namespace',
};

class ProvisionerService extends Service {
  constructor() {
    super();
    this.dependency(['aws', 's3Service', 'jsonSchemaValidationService', 'authenticationProviderConfigService']);
  }

  // eslint-disable-next-line no-unused-vars
  async provision({ providerTypeConfig, providerConfig}) {
    this.log.info('keycloak auth mingtong step 9-1, providerTypeConfig:', providerTypeConfig);
    this.log.info('keycloak auth mingtong step 9-1, providerConfig:', providerConfig);

    // Validate input
    const jsonSchemaValidationService = await this.service('jsonSchemaValidationService');
    const providerConfigJsonSchema = _.get(providerTypeConfig, 'config.inputSchema');
    await jsonSchemaValidationService.ensureValid(providerConfig, providerConfigJsonSchema);

    const authenticationProviderConfigService = await this.service('authenticationProviderConfigService');
    let existingProviderConfig;
    if (providerConfig.id) {
      existingProviderConfig = await authenticationProviderConfigService.getAuthenticationProviderConfig(
        providerConfig.id,
      );
      this.log.info('keycloak auth mingtong step 9-2, existingProviderConfig', existingProviderConfig);
    }
    
    // Save auth provider configuration and make it active
    const result = await authenticationProviderConfigService.saveAuthenticationProviderConfig({
      providerTypeConfig,
      providerConfig: providerConfig,
      status: authProviderConstants.status.active,
    });
    this.log.info('keycloak auth mingtong step 9-3, result', result);
    return result;
  }
}

module.exports = ProvisionerService;
