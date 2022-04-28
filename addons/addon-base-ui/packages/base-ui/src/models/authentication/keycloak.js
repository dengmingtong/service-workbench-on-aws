// import Keycloak from 'keycloak-js'

// class KeycloakClient {
//     constructor() {
//         this.initialized = false
//         console.log('KeycloakClient constructor mingtong step 2')
//         this.keycloak = new Keycloak(
//             { 
//                 url: 'https://keycloak-mingtong.demo.solutions.aws.a2z.org.cn/auth/', 
//                 realm: 'SWB-Test', 
//                 clientId: 'swb-test-client-new' 
//             });
//     }   

//     init = () => {
//         console.log('KeycloakClient init mingtong step1');
//         this.keycloak.init({onLoad: "login-required"})
//         .then(authenticated => {
//             console.log('KeycloakClient init mingtong step2, authenticated', authenticated)
//             // if (authenticated) {
//             //     this.initialized = true
    
//             //     callback(this.keycloak)
//             // }
//         });
//     }

//     isAuthenticated = (path) => {
//         return this.keycloak.authenticated
//     } 
    
//     getIdToken() {
//         console.log('getIdToken mingtong step 1, keycloak,', this.keycloak);
//         console.log('getIdToken mingtong step 1, token,', this.keycloak.token);
//         return this.keycloak.idToken;
//     }
// }

// const keycloakClient = new KeycloakClient()
// export default keycloakClient

import Keycloak from 'keycloak-js'

// Setup Keycloak instance as needed
// Pass initialization options as required or leave blank to load from 'keycloak.json'
const keycloak = new Keycloak(
    { 
        url: 'https://keycloak-mingtong.demo.solutions.aws.a2z.org.cn/auth/', 
        realm: 'SWB-Test', 
        clientId: 'swb-test-client-new' 
    });

export default keycloak