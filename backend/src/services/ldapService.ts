// ldapjs types are optional; keep runtime support but avoid TS dependency on @types/ldapjs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ldap = require('ldapjs') as any;
import { env } from '../config/env';

export class LDAPService {
  private client: any;

  constructor() {
    if (!env.LDAP_SERVER || !env.LDAP_BASE_DN) {
      throw new Error('LDAP server/base DN not configured');
    }

    this.client = ldap.createClient({
      url: env.LDAP_SERVER,
      reconnect: true,
      timeout: 5000,
      connectTimeout: 5000
    });
  }

  async authenticate(username: string, password: string) {
    const dn = `cn=${username},${env.LDAP_BASE_DN}`;

    return new Promise<void>((resolve, reject) => {
      this.client.bind(dn, password, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

