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
const { allowIfActive, allowIfAdmin } = require('@amzn/base-services/lib/authorization/authorization-utils');
const { retry } = require('@amzn/base-services/lib/helpers/utils');

const envTypeCandidateStatusEnum = require('./helpers/env-type-candidate-status-enum');
const versionFilterEnum = require('./helpers/env-type-candidate-version-filter-enum');
const { getServiceCatalogClient } = require('./helpers/env-type-service-catalog-helper');

const settingKeys = {
  envMgmtRoleArn: 'envMgmtRoleArn',
};

/**
 * The environment type candidates management service.
 * The service returns AWS Service Catalog Products accessible to the system.
 * These products are candidates for being imported as environment types in the system.
 */
class EnvTypeCandidateService extends Service {
  constructor() {
    super();
    this.dependency(['aws', 'authorizationService', 'envTypeService', 'deploymentStoreService']);
  }

  /**
   * Returns AWS Service Catalog Products accessible to the system (i.e., the ones shared with the EnvMgmtRole).
   * These products are candidates for being imported as environment types in the system.
   *
   * @param requestContext The request context object containing principal (caller) information.
   * The principal's identifier object is expected to be available as "requestContext.principalIdentifier"
   * @param filter Optional, filter to allow filtering environment type candidates based on status and version.
   * @param filter.status Filter for status. Defaults to "not-imported". Currently only supported values are:
   *  "*" - to return env type candidates of any status or
   *  "not-imported" - to return only those env type candidates which are not imported in the system yet.
   * @param filter.version Filter for version. Defaults to "latest". Currently only supported values are:
   *  "*" - to return env type candidates based on all versions of the AWS Service Catalog Products
   *  "latest" - to return env type candidates based on only the latest versions of the AWS Service Catalog Products
   * @returns {Promise<Array|*[]>}
   */
  async list(
    requestContext,
    { filter = { status: [envTypeCandidateStatusEnum.notImported], version: versionFilterEnum.latest } } = {},
  ) {

    this.log.info('mingtong step 5-0-0');
    // ensure that the caller has permissions to list raw environment types (AWS Service Catalog Products not yet imported into "app store")
    // Perform default condition checks to make sure the user is active and is admin
    await this.assertAuthorized(requestContext, { action: 'list', conditions: [allowIfActive, allowIfAdmin] });
    this.log.info('mingtong step 5-0-4');
    const filterStatuses = filter.status || [envTypeCandidateStatusEnum.notImported];
    const versionFilter = filter.version || versionFilterEnum.latest;
    this.log.info('mingtong step 5-0-5');
    // Validate filter
    await this.validateListFilter({ filterStatuses, versionFilter });
    this.log.info('mingtong step 5-0-6');
    this.log.info('mingtong step 5-0-6-1, envMgmtRoleArn', this.settings.get(settingKeys.envMgmtRoleArn));
    // Search products available to the SC admin role
    // get service catalog client sdk with the service catalog admin role credentials
    const [aws] = await this.service(['aws']);
    const serviceCatalogClient = await getServiceCatalogClient(aws, this.settings.get(settingKeys.envMgmtRoleArn));
    this.log.info('mingtong step 5-0-7, envMgmtRoleArn', this.settings.get(settingKeys.envMgmtRoleArn));
    this.log.info('mingtong step 5-0-7');
    const result = await retry(() =>
      // wrap with retry with exponential backoff in case of throttling errors
      serviceCatalogClient.searchProducts({ SortBy: 'CreationDate', SortOrder: 'DESCENDING' }).promise(),
    );
    this.log.info('mingtong step 5-0-8');
    const products = result.ProductViewSummaries || [];
    this.log.info('mingtong step 5-0-9', products);

    // Find corresponding SC product versions (aka provisioningArtifacts)
    // and translate to env type candidates
    const productEnvTypes = await this.toEnvTypeCandidates(serviceCatalogClient, products, versionFilter);
    this.log.info('mingtong step 5-0-10');
    // The productEnvTypes is an array with the following shape
    // [
    //   [env type for product 1 v1,  env type for product 1 v2, ...]
    //   [env type for product 2 v1,  env type for product 2 v2, ...]
    //    ...
    // ]
    //
    // Flatten this to return one array containing candidate env types for all versions
    const envTypeCandidates = _.flatten(productEnvTypes);
    this.log.info('mingtong step 5-0-11');

    const includeAll = _.includes(filterStatuses, '*');
    this.log.info('mingtong step 5-0-12');
    if (includeAll) {
      this.log.info('mingtong step 5-0-13');
      // if asked to return all then no need to do any further filtering
      // return all env type candidates
      return envTypeCandidates;
    }
    this.log.info('mingtong step 5-0-14');
    // Find a subset of the envTypeCandidates that have not been imported yet in the system
    const notImportedCandidates = await this.findNotImported(requestContext, envTypeCandidates);
    this.log.info('mingtong step 5-0-15', notImportedCandidates);
    return notImportedCandidates;
  }

  /* ---------------- PRIVATE METHODS ---------------- */

  /**
   * A private utility method to validate the filters when listing
   * @param filterStatuses
   * @param versionFilter
   * @returns {Promise<void>}
   */
  async validateListFilter({ filterStatuses, versionFilter }) {
    // Validate status filter
    const invalidFilterStatuses = _.filter(filterStatuses, s => !envTypeCandidateStatusEnum.isValidStatus(s));
    if (!_.isEmpty(invalidFilterStatuses)) {
      throw this.boom.badRequest(
        `Invalid status specified for filter. Valid values for status are ${_.join(
          envTypeCandidateStatusEnum.getValidStatuses(),
        )}`,
        true,
      );
    }

    // Validate version filter
    if (!versionFilterEnum.isValidVersionFilter(versionFilter)) {
      throw this.boom.badRequest(
        `Invalid version specified for filter. Valid values for version are ${_.join(
          versionFilterEnum.getValidVersionFilters(),
        )}`,
        true,
      );
    }
  }

  /**
   * A private adaptor utility method that translates the given AWS Service Catalog Product and
   * ProvisioningArtifact (aka Version) to an EnvironmentType
   *
   * @param product
   * @param provisioningArtifact
   * @returns {Promise<*>}
   */
  async toEnvTypeCandidate(serviceCatalogClient, { product, provisioningArtifact }) {
    this.log.info('mingtong step 5-0-9-6');
    const lpResult = await retry(() =>
      // wrap with retry with exponential backoff in case of throttling errors
      serviceCatalogClient.listLaunchPaths({ ProductId: product.ProductId }).promise(),
    );
    this.log.info('mingtong step 5-0-9-6-1',lpResult);
    // expecting only one launch path via one portfolio
    const launchPathId = _.get(lpResult, 'LaunchPathSummaries[0].Id');
    this.log.info('mingtong step 5-0-9-6-2', launchPathId);
    const ppResult = await retry(() =>
      // wrap with retry with exponential backoff in case of throttling errors
      serviceCatalogClient
        .describeProvisioningParameters({
          ProductId: product.ProductId,
          ProvisioningArtifactId: provisioningArtifact.Id,
          PathId: launchPathId,
        })
        .promise(),
    );
    this.log.info('mingtong step 5-0-9-6-3');
    const params = ppResult.ProvisioningArtifactParameters;
    const usageInstructions = ppResult.UsageInstructions;
    const metaData = usageInstructions.find(obj => obj.Type === 'metadata') || null;
    let mdValues = {};
    this.log.info('mingtong step 5-0-9-6-4');
    if (metaData) {
      const { Value } = metaData || null;
      if (Value) {
        this.log.info('mingtong step 5-0-9-6-5');
        mdValues = JSON.parse(Value);
        this.log.info('mingtong step 5-0-9-6-5', mdValues);
      }
    }
    const { PartnerName, KnowMore, PartnerURL } = mdValues;
    this.log.info('mingtong step 5-0-9-6-6');
    const environmentType = {
      id: `${product.ProductId}-${provisioningArtifact.Id}`,
      name: `${product.Name}-${provisioningArtifact.Name}`,
      desc: provisioningArtifact.Description,
      isLatest: provisioningArtifact.isLatest || false,
      metadata: {
        partnerName: PartnerName || '',
        knowMore: KnowMore || '',
        partnerURL: PartnerURL || '',
      },
      product: {
        productId: product.ProductId,
        name: product.Name,
      },
      provisioningArtifact: {
        id: provisioningArtifact.Id,
        name: provisioningArtifact.Name,
        description: provisioningArtifact.Description,
        type: provisioningArtifact.Type,
        createdTime: provisioningArtifact.CreatedTime,
        active: provisioningArtifact.Active,
        guidance: provisioningArtifact.Guidance,
      },
      params,
    };
    this.log.info('mingtong step 5-0-9-6-7', environmentType);
    return environmentType;
  }

  /**
   * A private utility method that fetches ProvisioningArtifacts (aka Versions) from AWS Service Catalog and translates
   * the given AWS Service Catalog Product and the ProvisioningArtifacts (aka Versions) to an array of EnvironmentType(s)
   *
   * @param serviceCatalogClient AWS SDK client for the AWS Service Catalog
   * @param products Array of AWS Service Catalog products
   * @param versionFilter A version filter, currently only supports "*" to include all versions or "latest" to return
   * only latest version
   * @returns {Promise<[*]>}
   */
  async toEnvTypeCandidates(serviceCatalogClient, products, versionFilter) {
    this.log.info('mingtong step 5-0-9-0');
    const productEnvTypes = await Promise.all(
      _.map(products, async product => {
        const paResult = await retry(() =>
          // wrap with retry with exponential backoff in case of throttling errors
          serviceCatalogClient.listProvisioningArtifacts({ ProductId: product.ProductId }).promise(),
        );
        this.log.info('mingtong step 5-0-9-1');

        // Sort versions (provisioningArtifacts) in decending order of creation time (i.e., latest first)
        let provisioningArtifacts = _.sortBy(
          _.filter(paResult.ProvisioningArtifactDetails || [], pa => pa.Active), // filter out inactive versions
          v => -1 * v.CreatedTime,
        );
        this.log.info('mingtong step 5-0-9-2');
        if (_.isEmpty(provisioningArtifacts)) {
          this.log.info('mingtong step 5-0-9-3');
          // No active versions
          return null;
        }
        const latestVersion = provisioningArtifacts[0];
        latestVersion.isLatest = true;
        this.log.info('mingtong step 5-0-9-4');
        provisioningArtifacts = versionFilterEnum.includeOnlyLatest(versionFilter)
          ? [latestVersion]
          : provisioningArtifacts;
        this.log.info('mingtong step 5-0-9-5');
        // In AWS Service Catalog each product could have one or more versions
        // We want to represent each version of the product as an independent environment type
        return Promise.all(
          _.map(provisioningArtifacts, provisioningArtifact =>
            this.toEnvTypeCandidate(serviceCatalogClient, { product, provisioningArtifact }),
          ),
        );
      }),
    );
    return _.filter(productEnvTypes, productEnvType => productEnvType !== null);
  }

  /**
   * A private utility method to find a subset of the given envTypeCandidates that have not been imported yet in the system
   *
   * @param requestContext
   * @param envTypeCandidates
   * @returns {Promise<[*]>}
   */
  async findNotImported(requestContext, envTypeCandidates) {
    const envTypeService = await this.service('envTypeService');

    // Get all imported env types (passing wildcard for status filter to include not-approved and approved both)
    const importedEnvTypes = await envTypeService.list(requestContext, { filter: { status: ['*'] } });
    return _.filter(envTypeCandidates, ec => !_.find(importedEnvTypes, { id: ec.id }));
  }

  async assertAuthorized(requestContext, { action, conditions }, ...args) {
    this.log.info('mingtong step 5-0-1');
    const authorizationService = await this.service('authorizationService');
    this.log.info('mingtong step 5-0-2');
    // The "authorizationService.assertAuthorized" below will evaluate permissions by calling the "conditions" functions first
    // It will then give a chance to all registered plugins (if any) to perform their authorization.
    // The plugins can even override the authorization decision returned by the conditions
    // See "authorizationService.authorize" method for more details
    await authorizationService.assertAuthorized(
      requestContext,
      { extensionPoint: 'env-type-candidates-authz', action, conditions },
      ...args,
    );
    this.log.info('mingtong step 5-0-3');
  }

  /**
   * A private utility method to find a portfolio id from the department store table
   * @returns {Promise<string>}
   */
  async getPortfolioId() {
    const [deploymentStore] = await this.service(['deploymentStoreService']);
    let record = await deploymentStore.find({ type: 'default-sc-portfolio', id: 'default-SC-portfolio-1' });
    if (!record) {
      // The old code had type = 'post-deployment-step', due to this the DB may have record with old type value
      record = await deploymentStore.find({ type: 'post-deployment-step', id: 'default-SC-portfolio-1' });
    }
    const { value } = record;
    let portfolioId = '';
    if (value) {
      const valueData = JSON.parse(value);
      portfolioId = valueData.portfolioId || '';
    }
    return portfolioId;
  }
}
module.exports = EnvTypeCandidateService;
