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

const request = require('request');
const jwkToPem = require('jwk-to-pem');
const _ = require('lodash');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

async function getKeycloakTokenVerifier(issuer, logger = console) {

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
  
  logger.info('getKeycloakTokenVerifier mingtong step 1');

  function getSigningKey (header = decoded.header, callback) {
    logger.info('getKeycloakTokenVerifier mingtong step 3 header: ', header);
    keyClient.getSigningKey(header.kid, function(err, key) {
      const signingKey = key.publicKey || key.rsaPublicKey;
      logger.info('getKeycloakTokenVerifier mingtong step 4 signingKey: ', signingKey);
      callback(null, signingKey);
    })
  }  

  const verify = async token => {
    // First attempt to decode token before attempting to verify the signature
    logger.info('getKeycloakTokenVerifier mingtong step 2, token', token);
    let decoded_output;
    var promise = new Promise(function(resolve, reject) {
      jwt.verify(token, getSigningKey, verificationOptions, function (error, decoded) {
        if (error) {
          logger.info('getKeycloakTokenVerifier mingtong step 5 error: ', error);
          resolve(error);
        } else {
          logger.info('getKeycloakTokenVerifier mingtong step 6 decoded: ', decoded);
          resolve(decoded);
        }
      });
    });
    await promise.then(function(data) {
      console.log('resolved! ', data);
      decoded_output = data;
      logger.info('getKeycloakTokenVerifier mingtong step 7 decoded_output: ', decoded_output);
    });
    logger.info('getKeycloakTokenVerifier mingtong step 8 decoded_output: ', decoded_output);
    return decoded_output;
  };

  return { verify };
}

module.exports = { getKeycloakTokenVerifier };
