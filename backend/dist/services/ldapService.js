"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LDAPService = void 0;
// ldapjs types are optional; keep runtime support but avoid TS dependency on @types/ldapjs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ldap = require('ldapjs');
const env_1 = require("../config/env");
class LDAPService {
    client;
    constructor() {
        if (!env_1.env.LDAP_SERVER || !env_1.env.LDAP_BASE_DN) {
            throw new Error('LDAP server/base DN not configured');
        }
        this.client = ldap.createClient({
            url: env_1.env.LDAP_SERVER,
            reconnect: true,
            timeout: 5000,
            connectTimeout: 5000
        });
    }
    async authenticate(username, password) {
        const dn = `cn=${username},${env_1.env.LDAP_BASE_DN}`;
        return new Promise((resolve, reject) => {
            this.client.bind(dn, password, (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
}
exports.LDAPService = LDAPService;
