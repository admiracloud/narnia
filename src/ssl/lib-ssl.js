import { mkdirSync, readFileSync, existsSync, writeFileSync, rmSync } from 'fs';
import path    from 'path';
import { get } from 'httpie';
import acme    from 'acme-client';

export class LibSSL {

  constructor(config, proxy) {
    this.config = config
    this.proxy  = proxy
    this.dir    = this.config.certs_dir + proxy.domain + '/'

    // Create directory for the domain's certificates, if it doesn't exist
    mkdirSync(this.dir, { recursive: true })

    this.path = {}

    // Common path for let's encrypt account file
    this.path.account_url = this.config.letsencrypt + 'account.url';
    this.path.account_key = this.config.letsencrypt + 'account.key';

    // Paths for keys, certificates
    this.path.domain_key  = this.dir + `${this.proxy.domain}.key`;
    this.path.cert        = this.dir + `${this.proxy.domain}.crt`;
    this.path.csr         = this.dir + `${this.proxy.domain}.csr`;
    this.path.fullchain   = this.dir + 'fullchain.crt';

    // Path for challenges files
    this.path.challenge   = this.config.public + '.well-known/acme-challenge/';

    // Expire days
    this.expire_days = 30

    // Staging -- default to false
    this.staging = false
  }

  // Create or load the account key
  async getAccountKey() {
    if (!existsSync(this.path.account_key)) {
      const account_key = await acme.crypto.createPrivateRsaKey();
      writeFileSync(this.path.account_key, account_key);
      return account_key;
    }

    return readFileSync(this.path.account_key, 'utf8');
  }

  async getAccountUrl(client) {
    if (!existsSync(this.path.account_url)) {
      const accountOptions = { termsOfServiceAgreed: true };

      if (this.config.email) {
        accountOptions.contact = [`mailto:${this.config.email}`];
      }

      await client.createAccount(accountOptions);
      writeFileSync(this.path.account_url, client.api.accountUrl);
    }
    else {
      const account_url = readFileSync(this.path.account_url, 'utf8');
      client.api.accountUrl = account_url;
    }

    return client;
  }

  // Create or load the domain key
  async getDomainKey() {
    if (!existsSync(this.path.domain_key)) {
      const domain_key = await acme.crypto.createPrivateRsaKey();
      writeFileSync(this.path.domain_key, domain_key);
      return domain_key;
    }
    return readFileSync(this.path.domain_key, 'utf8');
  }
  
  // Check certificate expiration
  expiring() {
    if (!existsSync(this.path.cert)) return { expired: true };

    const certPem = readFileSync(this.path.cert, 'utf8');
    const cert = acme.crypto.readCertificateInfo(certPem);
    const remaining_days = (new Date(cert.notAfter) - new Date()) / (1000 * 60 * 60 * 24);

    return {
      days: remaining_days,
      expired: remaining_days < this.expire_days
    };
  }

  // Asynchronous function to handle the HTTP challenge
  async httpChallenge(client, authorization) {
    const challenge = authorization.challenges.find(c => c.type === 'http-01');
    const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);

    const wellknown = {
      key: keyAuthorization,
      token: challenge.token,
      path: this.path.challenge + challenge.token
    };

    writeFileSync(wellknown.path, wellknown.key);

    // Delay to ensure the file is accessible by the ACME server
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    await delay(500);
    
    return wellknown;
  }

  // Check the http challenge before asking Let's Encrypt to do so
  async checkChallenge(wellknown) {
    const url = `http://${this.proxy.domain}/.well-known/acme-challenge/${wellknown.token}`

    try {
      const { data } = await get(url);
      const equal = wellknown.key.trim() === data.trim()

      return equal ? { success: true } : { error: `${this.proxy.domain}: pre-verification challenge key doesn't match on ${url}` }
    }
    catch(err) {
      return { error: `${this.proxy.domain}: error ${err.statusCode} on pre-verification challenge with url ${url}` }
    }
  }

  // Create ACME client
  async client() {
    const account_key = await this.getAccountKey();

    const client = new acme.Client({
      directoryUrl: this.staging ? acme.directory.letsencrypt.staging : acme.directory.letsencrypt.production,
      accountKey: account_key
    });

    return this.getAccountUrl(client);
  }

  // Order and finalize the certificate
  async order() {
    const client = await this.client();
    const domain_key = await this.getDomainKey();

    const [certificateKey, certificateCsr] = await acme.crypto.createCsr({
      commonName: this.proxy.domain,
      altNames: Array.from(new Set([this.proxy.domain].concat(this.proxy.additional)))
    }, domain_key);

    writeFileSync(this.path.csr, certificateCsr);
    writeFileSync(this.path.domain_key, certificateKey);

    const order = await client.createOrder({  
      identifiers: Array.from(new Set([this.proxy.domain].concat(this.proxy.additional)))  
        .map(domain => ({ type: 'dns', value: domain }))  
    });

    const authorizations = await client.getAuthorizations(order);

    for (const auth of authorizations) {
      const wellknown = await this.httpChallenge(client, auth);
      const check     = await this.checkChallenge(wellknown);

      // Stop if the challenge fails on our own http check 
      if (check.error) {
        this.cleanup(wellknown)
        return { error: check.error }
      }

      try {
        const challenge = auth.challenges.find(c => c.type === 'http-01');

        await client.verifyChallenge(auth, challenge);
        await client.completeChallenge(challenge);
        await client.waitForValidStatus(challenge);
      }
      catch(err) {
        this.cleanup(wellknown)
        return { error: `${this.proxy.domain}: ${err?.message || 'Challenge failed'}` }
      }

      this.cleanup(wellknown)
    }

    const finalized = await client.finalizeOrder(order, certificateCsr);
    const cert = await client.getCertificate(finalized);

    // Write the certificate and fullchain
    writeFileSync(this.path.cert, cert);
    writeFileSync(this.path.fullchain, cert);

    return { success: `Successfully generated certificate for ${this.proxy.domain}` };
  };

  cleanup(wellknown) {
    rmSync(wellknown.path, { force: true });
  }

  // Main function to check, generate and renew certificate
  async generate() {
    const { days, expired } = this.expiring()
    return expired ? this.order() : { success: `Certificate for ${this.proxy.domain} still valid for ${Math.floor(days)} days` };
  }

}
