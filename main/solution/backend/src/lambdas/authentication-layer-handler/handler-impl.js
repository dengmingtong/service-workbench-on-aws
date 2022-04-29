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

const { parseMethodArn, buildRestApiPolicy, newUnauthorizedError, customAuthorizerResponse } = require('./apigw');

const bearerPrefix = 'Bearer ';

const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const keyClient = jwksClient({
  cache: true,
  cacheMaxAge: 86400000, //value in ms
  rateLimit: true,
  jwksRequestsPerMinute: 10,
  strictSsl: true,
  jwksUri: 'https://keycloak-mingtong.demo.solutions.aws.a2z.org.cn/auth/realms/SWB-Test/protocol/openid-connect/certs'
})

const verificationOptions = {
  // verify claims, e.g.
  // "audience": "urn:audience"
  "algorithms": "RS256"
}

function getSigningKey (header = decoded.header, callback) {
  console.log('lambda auth newHandler mingtong step 6, header: ', header);
  keyClient.getSigningKey(header.kid, function(err, key) {
    const signingKey = key.publicKey || key.rsaPublicKey;
    console.log('lambda auth newHandler mingtong step 7, signingKey: ', signingKey);
    callback(null, signingKey);
  })
}

async function validateToken(token) {
  console.log('lambda auth newHandler mingtong step 5, token: ', token);
  let authenticated = false;
  var promise = new Promise(function(resolve, reject) {
    jwt.verify(token, getSigningKey, verificationOptions, function (error, decoded) {
      if (error) {
        console.log('lambda auth newHandler mingtong step 11, error: ', error);
        resolve(false);
      } else {
        console.log('lambda auth newHandler mingtong step 12: ')
        resolve(true);
      }
    });
  });
  await promise.then(function(data) {
    console.log('resolved! ', data);
    authenticated = true;
  });
  console.log('lambda auth newHandler mingtong step 13, authenticated', authenticated);
  return authenticated;
}

const getToken = authorizationHeader => {
  if (!authorizationHeader) {
    return '';
  }
  if (authorizationHeader.startsWith(bearerPrefix)) {
    return authorizationHeader.slice(bearerPrefix.length);
  }
  return authorizationHeader;
};

const sanitizeResponseContext = context => {
  return Object.entries(context)
    .filter(([_, value]) => typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number')
    .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
};

const noopAuthenticationService = {
  async authenticate() {
    return { authenticated: false };
  },
};

const consoleLogger = {
  info(...args) {
    // eslint-disable-next-line no-console
    console.log(...args);
  },
};

module.exports = function newHandler({ authenticationService = noopAuthenticationService, log = consoleLogger } = {}) {
  return async ({ methodArn: rawMethodArn, authorizationToken }) => {
    log.info('lambda auth newHandler mingtong step 1');
    log.info('lambda auth newHandler mingtong step 1, rawMethodArn: ', rawMethodArn);
    const methodArn = parseMethodArn(rawMethodArn);
    log.info('lambda auth newHandler mingtong step 2, methodArn: ', methodArn);
    if (!methodArn) {
      throw new Error(`invalid method arn: ${rawMethodArn}`);
    }
    log.info('lambda auth newHandler mingtong step 3, authorizationToken: ', authorizationToken);
    const token = getToken(authorizationToken);
    log.info('lambda auth newHandler mingtong step 4, token: ', token);
    const result = await authenticationService.authenticate(token);
    log.info('lambda auth newHandler mingtong step 5-1, result: ', result);
    const { authenticated, error, ...claims } = result;
    if (error) {
      log.info(
        `authentication error for ${claims.username || '<anonymous>'}/${claims.authenticationProviderId ||
          '<unknown provider>'}: ${error.toString()}`,
      );
    }
    if (!authenticated) {
      throw newUnauthorizedError();
    }
    return customAuthorizerResponse({
      principalId: claims.uid,
      policyDocument: buildRestApiPolicy(methodArn, 'Allow'),
      context: sanitizeResponseContext(claims),
    });

    // mingtong temp working code
    // const authenticated = await validateToken(token);
    // log.info('lambda auth newHandler mingtong step 8, token: ', authenticated);
    // if (!authenticated) {
    //   log.info('lambda auth newHandler mingtong step 9, token: ', authenticated);
    //   throw newUnauthorizedError();
    // }
    // log.info('lambda auth newHandler mingtong step 10, token: ', authenticated);
    // return customAuthorizerResponse({
    //   // principalId: claims.uid,
    //   principalId: 'service-workbench',
    //   policyDocument: buildRestApiPolicy(methodArn, 'Allow'),
    //   // context: sanitizeResponseContext(claims),
    //   context: sanitizeResponseContext('service-workbench'),
    // });
  };
};
