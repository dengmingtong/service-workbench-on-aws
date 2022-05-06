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
const { runAndCatch } = require('@amzn/base-services/lib/helpers/utils');
const { allowIfActive } = require('@amzn/base-services/lib/authorization/authorization-utils');
const { allowIfHasRole } = require('../user/helpers/user-authz-utils');

class CostsService extends Service {
  constructor() {
    super();
    this.dependency([
      'aws',
      'awsAccountsService',
      'environmentService',
      'environmentScService',
      'indexesService',
      'costApiCacheService',
      'authorizationService',
    ]);
  }

  async init() {
    await super.init();
  }

  async getIndividualEnvironmentOrProjCost(requestContext, query) {
    console.log('getIndividualEnvironmentOrProjCost mingtong step 1, requestContext', requestContext);
    // ensure that the caller has permissions to read the cost
    // Perform default condition checks to make sure the user is active and has allowed roles
    const allowIfHasCorrectRoles = (reqContext, { action }) =>
      allowIfHasRole(reqContext, { action, resource: 'environment-or-project-cost' }, ['admin', 'researcher']);
    console.log('getIndividualEnvironmentOrProjCost mingtong step 2');
    await this.assertAuthorized(
      requestContext,
      { action: 'read', conditions: [allowIfActive, allowIfHasCorrectRoles] },
      query,
    );
    console.log('getIndividualEnvironmentOrProjCost mingtong step 3');
    const { env, scEnv, proj, groupByUser, groupByEnv, groupByService, numberOfDaysInPast } = query;
    const [environmentService, environmentScService, costApiCacheService] = await this.service([
      'environmentService',
      'environmentScService',
      'costApiCacheService',
    ]);
    console.log('getIndividualEnvironmentOrProjCost mingtong step 4');
    if (groupByUser === 'true' && groupByEnv === 'true' && groupByService === 'true') {
      return 'Can not groupByUser, groupByEnv, and groupByService. Please pick at most 2 out of the 3.';
    }
    let indexId = '';
    console.log('getIndividualEnvironmentOrProjCost mingtong step 5');
    if (proj) {
      indexId = proj;
      console.log('getIndividualEnvironmentOrProjCost mingtong step 5-1, indexId', indexId);
    } else if (env) {
      // The following will only succeed if the user has permissions to access the specified environment
      const result = await environmentService.mustFind(requestContext, { id: env });
      indexId = result.indexId;
      console.log('getIndividualEnvironmentOrProjCost mingtong step 5-2, indexId', indexId);
    } else if (scEnv) {
      // The following will only succeed if the user has permissions to access the specified service catalog based environment
      const result = await environmentScService.mustFind(requestContext, { id: scEnv, fields: ['indexId'] });
      indexId = result.indexId;
      console.log('getIndividualEnvironmentOrProjCost mingtong step 5-3, indexId', indexId);
    }

    const cacheResponse = await costApiCacheService.find(requestContext, { indexId, query: JSON.stringify(query) });
    if (cacheResponse) {
      console.log('getIndividualEnvironmentOrProjCost mingtong step 6, cacheResponse', cacheResponse);
      const updatedAt = new Date(cacheResponse.updatedAt);
      const now = new Date();
      const elapsedHours = (now - updatedAt) / 1000 / 60 / 60;
      if (elapsedHours < 12) {
        return JSON.parse(cacheResponse.result);
      }
    }
    console.log('getIndividualEnvironmentOrProjCost mingtong step 7');
    let filter = {};
    if (proj) {
      filter = {
        Tags: {
          Key: 'Proj',
          Values: [proj],
        },
      };
    } else {
      filter = {
        Tags: {
          Key: 'Env',
          Values: [env || scEnv],
        },
      };
    }

    const groupBy = [];
    if (groupByService === 'true') {
      groupBy.push({
        Type: 'DIMENSION',
        Key: 'SERVICE',
      });
    }
    if (groupByUser === 'true') {
      groupBy.push({
        Type: 'TAG',
        Key: 'CreatedBy',
      });
    }
    if (groupByEnv === 'true') {
      groupBy.push({
        Type: 'TAG',
        Key: 'Env',
      });
    }
    console.log('getIndividualEnvironmentOrProjCost mingtong step 8');
    const response = await this.callAwsCostExplorerApi(requestContext, indexId, numberOfDaysInPast, filter, groupBy);
    console.log('getIndividualEnvironmentOrProjCost mingtong step 9');

    if (response) {
      const rawCacheData = {
        indexId,
        query: JSON.stringify(query),
        result: JSON.stringify(response),
      };
      await costApiCacheService.create(requestContext, rawCacheData);
    }
    console.log('getIndividualEnvironmentOrProjCost mingtong step 10, response', response);
    return response || [];
  }

  async callAwsCostExplorerApi(requestContext, indexId, numberOfDaysInPast, filter, groupBy) {
    console.log('callAwsCostExplorerApi mingtong step 1');
    const [aws] = await this.service(['aws']);
    const { accessKeyId, secretAccessKey, sessionToken } = await this.getCredentials(requestContext, indexId);
    console.log('callAwsCostExplorerApi mingtong step 2');
    const costExplorer = new aws.sdk.CostExplorer({
      apiVersion: '2017-10-25',
      region: 'cn-northwest-1',
      accessKeyId,
      secretAccessKey,
      sessionToken,
    });
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() - numberOfDaysInPast);
    console.log('callAwsCostExplorerApi mingtong step 3');
    const result = await costExplorer
      .getCostAndUsage({
        TimePeriod: {
          Start: startDate.toISOString().split('T')[0],
          End: now.toISOString().split('T')[0],
        },
        Granularity: 'DAILY',
        Metrics: ['BlendedCost'],
        Filter: filter,
        GroupBy: groupBy,
      })
      .promise()
      .catch(e => {
        // The DataUnavailableException represents non-availability of data for specific cost usage search criteria.
        // Just return undefined instead of throwing error in this case for easier API usage in the client code.
        if (e.code === 'DataUnavailableException') {
          return undefined;
        }
        throw e;
      });
    console.log('callAwsCostExplorerApi mingtong step 4');
    let response;
    if (result) {
      console.log('callAwsCostExplorerApi mingtong step 5, result', result);
      response = result.ResultsByTime.map(item => {
        const costItems = {};
        item.Groups.forEach(group => {
          if (group.Metrics.BlendedCost.Amount > 0) {
            costItems[group.Keys] = {
              amount: Math.round(group.Metrics.BlendedCost.Amount * 100) / 100,
              unit: group.Metrics.BlendedCost.Unit,
            };
          }
        });
        return {
          startDate: item.TimePeriod.Start,
          cost: costItems,
        };
      });
    }
    console.log('callAwsCostExplorerApi mingtong step 6, response', response);
    return response;
  }

  async getCredentials(requestContext, indexId) {
    console.log('getCredentials mingtong step 1');
    const [aws, awsAccountsService, indexesService] = await this.service([
      'aws',
      'awsAccountsService',
      'indexesService',
    ]);
    console.log('getCredentials mingtong step 2');
    const { roleArn: RoleArn, externalId: ExternalId } = await runAndCatch(
      async () => {
        const { awsAccountId } = await indexesService.mustFind(requestContext, { id: indexId });

        return awsAccountsService.mustFind(requestContext, { id: awsAccountId });
      },
      async () => {
        throw this.boom.badRequest(`account with id "${indexId} is not available`);
      },
    );
    console.log('getCredentials mingtong step 3');
    const by = _.get(requestContext, 'principalIdentifier.uid');
    console.log('getCredentials mingtong step 4, by', by);
    // const sts = new aws.sdk.STS({ region: 'us-east-1' });
    const sts = new aws.sdk.STS({ region: 'cn-north-1' });
    console.log('getCredentials mingtong step 5');
    const {
      Credentials: { AccessKeyId: accessKeyId, SecretAccessKey: secretAccessKey, SessionToken: sessionToken },
    } = await sts
      .assumeRole({
        RoleArn,
        RoleSessionName: `RaaS-${by}`,
        ExternalId,
      })
      .promise();
    console.log('getCredentials mingtong step 6');
    return { accessKeyId, secretAccessKey, sessionToken };
  }

  async assertAuthorized(requestContext, { action, conditions }, ...args) {
    const authorizationService = await this.service('authorizationService');

    // The "authorizationService.assertAuthorized" below will evaluate permissions by calling the "conditions" functions first
    // It will then give a chance to all registered plugins (if any) to perform their authorization.
    // The plugins can even override the authorization decision returned by the conditions
    // See "authorizationService.authorize" method for more details
    await authorizationService.assertAuthorized(
      requestContext,
      { extensionPoint: 'cost-authz', action, conditions },
      ...args,
    );
  }
}

module.exports = CostsService;
