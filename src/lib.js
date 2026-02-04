import { mkdirSync, readdirSync, readFileSync, existsSync, writeFileSync, rmSync } from 'fs';
import { execSync } from 'child_process';

import * as utils     from '#utils/index.js'
import * as templates from '#templates/index.js';
import { LibSSL }     from '#ssl/lib-ssl.js';

export class Narnia {

  config = {}
  proxies = {}

  constructor( config = {} ) {
    this.config.lib_dir = import.meta.url
      .replace( 'file://', '' )
      .replace( '/src/lib.js', '/' )
      .replace( '/cli.js', '/' )

    // Default config
    this.config.nginx_dir        = '/etc/nginx/'
    this.config.data_dir         = '/etc/narnia/'
    this.config.reload           = 'sudo /usr/sbin/service nginx reload'
    this.config.timeout          = 10000
    this.config.keepalive        = "0"
    this.config.default_template = "Standard"

    // Merge with local config
    Object.assign( this.config, config )

    // Derivative config properties

    // Data subdirectories
    this.config.proxy_dir   = this.config.data_dir + 'proxies/'
    this.config.public      = this.config.data_dir + 'public/'
    this.config.challenge   = this.config.data_dir + 'public/.well-known/acme-challenge/'
    this.config.certs_dir   = this.config.data_dir + 'certs/'
    this.config.letsencrypt = this.config.data_dir + 'letsencrypt/'

    // Nginx sites availavle and enabled directories
    this.config.sites_available = this.config.nginx_dir + 'sites-available/'
    this.config.sites_enabled   = this.config.nginx_dir + 'sites-enabled/'
  }

  install() {
    const dirs = ['data_dir', 'proxy_dir', 'public', 'certs_dir', 'letsencrypt', 'challenge']

    for ( const dir of dirs )
      mkdirSync(this.config[dir], { recursive: true })
  }

  list() {
    this.retrieve()
    utils.list_table(this.proxies)
  }

  retrieve() {
    const proxy_files = readdirSync(this.config.proxy_dir);

    for ( const proxy of proxy_files ) {
      // skips hidden files
      if (proxy.startsWith('.'))
        continue;

      this.proxies[proxy] = JSON.parse(readFileSync(this.config.proxy_dir + proxy, 'utf8'));
    }
  }

  create( options ) {
    if ( !options.name ) return { error: 'narnia create <name> is required' }
    if ( !options.address ) return { error: '--address <address> is required' }

    const address = utils.parseUrl(options.address)
    if ( !address.host ) return { error: 'Invalid --address <address>' }

    const path = this.config.proxy_dir + options.name
    if ( existsSync(path) ) return { error: `Proxy ${options.name} already exists` }

    // Handle template selection
    if ( !options.template ) options.template = 'standard';

    // Prepare template name in Title Case
    options.template = utils.titleCase(options.template);

    // If informed tamplate doesn't exist, return error
    if (!templates[options.template]) {
      const available_templates = Object.keys(templates).join(', ');
      return { error: `Invalid template "${options.template.toLowerCase()}". Available templates: ${available_templates}` }
    }

    const proxy = {
      domain: options.name,
      state: 'disabled',
      address: `${address.protocol}://${address.host}:${address.port}`,
      certificate: false,
      keepalive: Number.isInteger(options.keepalive) ? '' + options.keepalive : this.config.keepalive,
      additional: options.additional
        ? options.additional.split(',').map(d => d.trim())
        : [],
      template: options.template
    }

    // Create proxy configuration
    this.save(path, proxy)

    return { success: `Proxy ${options.name} created` }
  }

  set( options ) {
    const { proxy, path, error } = this.ensure(options, 'set')
    if ( error ) return { error };

    // Address
    if ( options.address ) {
      const address = utils.parseUrl(options.address)
      if ( !address.host ) return { error: 'Invalid --address <address>' }

      proxy.address = `${address.protocol}://${address.host}:${address.port}`
    }

    // Keepalive
    if ( Number.isInteger( options.keepalive ) ) {
      proxy.keepalive = '' + options.keepalive
    }

    // Additional
    if ( options.additional ) {
      proxy.additional = options.additional.split(',').map(d => d.trim())
    }

    // Add domain
    if ( options['add-domain'] ) {
      const additional = options['add-domain'].split(',').map(d => d.trim())
      proxy.additional = Array.from(new Set(proxy.additional.concat(additional)))
    }

    if ( options.template ) {
      // Prepare template name in Title Case
      options.template = utils.titleCase(options.template);

      // If informed tamplate doesn't exist, return error
      if (!templates[options.template]) {
        const available_templates = Object.keys(templates).join(', ');
        return { error: `Invalid template "${options.template.toLowerCase()}". Available templates: ${available_templates}` }
      }
    }

    // Update proxy configuration
    this.save(path, proxy)

    // Reload nginx if proxy is already enabled
    if ( proxy.state == 'enabled' )
      this.reload()

    return { success: `Proxy ${options.name} updated` }
  }

  enable( options, enable = true ) {
    const { proxy, path, error } = this.ensure(options, enable ? 'enable' : 'disable')
    if ( error ) return { error };

    if ( enable && proxy.state == 'enabled' )
      return { error: `Proxy ${options.name} already enabled` }

    if ( !enable && proxy.state == 'disabled' )
      return { error: `Proxy ${options.name} already disabled` }

    proxy.state = enable ? 'enabled' : 'disabled'

    // Update proxy configuration
    this.save(path, proxy)

    // Create or remove the symlink to sites-enabled
    const available = this.config.sites_available + options.name
    const enabled   = this.config.sites_enabled + options.name
    const command   = enable
      ? `ln -s ${available} ${enabled}`
      : `rm ${enabled}`

    execSync(command, { timeout: this.config.timeout })

    // Reload nginx if proxy is already enabled
    this.reload()

    return enable
      ? { success: `Proxy ${options.name} enabled` }
      : { success: `Proxy ${options.name} disabled` }
  }

  disable( options ) {
    const enable = false
    return this.enable( options, enable )
  }

  save( path, proxy, wellknown = false ) {
    // Create/update proxy configuration reference
    writeFileSync( path, JSON.stringify(proxy), { mode: 0o644 })

    // Use the stored template (fallback to Standard for old proxies)
    const templateName  = proxy.template || 'Standard';
    const TemplateClass = templates[templateName] || templates.Standard;

    // Create/update nginx configuration
    const template = new TemplateClass(proxy, utils.parseUrl(proxy.address), this.config, wellknown)

    // Write nginx configuration
    writeFileSync(
      this.config.sites_available + proxy.domain,
      template.generate(),
      { mode: 0o644 }
    )
  }

  ssl_generate( options, command = 'ssl:generate' ) {
    let { proxy, path, error } = this.ensure(options, command)
    if ( error ) return { error };

    return this.ssl_single( proxy, path );
  }

  async ssl_single( proxy, path ) {
    if (!path) path = this.config.proxy_dir + proxy.domain;

    const staging = !!options?.staging;

    // Enable .well-known directory and reload nginx
    let wellknown = true
    this.save( path, proxy, wellknown )
    this.reload()

    const libssl = new LibSSL(this.config, proxy)

    if( staging ) libssl.staging = true

    const result = await libssl.generate( staging )

    if ( !staging && result.success ) {
      proxy.certificate = result.certDate.getTime();
    }

    // Disable .well-known directory and reload nginx
    wellknown = false
    this.save( path, proxy, wellknown )
    this.reload()

    return result;
  }

  async ssl_renew ( options ) {
    // 1. Single proxy renew

    if (options.name)
      return this.ssl_generate(options, 'ssl:renew')

    // 2. All proxies renew
    
    // Retrieve and populate this.proxies
    this.retrieve()

    // Renew each one sequentially, to avoid being blocked
    // by Let's Encrypt servers
    for ( const proxy in this.proxies ) {
      // Skip if there is no certificate
      if (proxy.certificate == false) {
        console.log( `[Skip]: Proxy ${domain} with SSL not enabled` )
        continue;
      }

      // Ask for renew if there is a certificate
      const response = await this.ssl_single(proxy)
      this.print_response(response)
    }

    return { success: 'SSL renew operation concluded' }
  }

  async ssl_check() {
    // Retrieve and populate this.proxies
    this.retrieve()

    // Iterate, ensuring the certificate expiration date is added when missing
    // for retro-compatibility
    Object.entries(this.proxies).forEach(this.ensure_ssl_date)

    return { success: 'SSL check operation concluded' }
  }

  ensure_ssl_date( domain ) {
    const proxy = this.proxies[domain];

    // Skip if there is no certificate
    if (proxy.certificate == false) {
      console.log( `[Skip]: Proxy ${domain} with SSL not enabled` )
      return;
    }

    // Skip if timestamp is already there
    if (utils.isValidTimestamp(proxy.certificate)) {
      console.log( `[OK]: Proxy ${domain} already with certificate expiration` )
      return;
    }

    // If there is a certificate but not a valid timestamp,
    // this is probably a proxy from an old version of narnia
    // Let's update it!

    const libssl = new LibSSL(this.config, proxy);
    const path  = this.config.proxy_dir + domain;

    // If there is no certificate file, well, then we consider this proxy as
    // certificate-less as a safe measure
    if (!libssl.certExists()) {
      proxy.certificate = false;
      console.log( `[Change]: No certificate found on proxy ${domain}` )
    }
    // Otherwise, victory! The proxy now has a valid timestamp and can be
    // updated!
    else {
      proxy.certificate = libssl.certDate().certDate.getTime()
      console.log( `[Change]: Proxy ${domain} certificate expiration checked` )
    }

    // Save the changes
    const wellknown = false;
    this.save( path, proxy, wellknown );
    
    return;
  }

  reload() {
    execSync(this.config.reload, { timeout: this.config.timeout })
  }

  delete( options ) {
    if ( !options.name )
      return { error: 'Name is required to delete a proxy' }

    const path      = this.config.proxy_dir + options.name
    const available = this.config.sites_available + options.name
    const enabled   = this.config.sites_enabled + options.name

    if ( !existsSync(path) )
      return { error: `Proxy ${options.name} doesn't exist` }

    const proxy = JSON.parse(readFileSync(path, 'utf8'));

    rmSync(enabled, { force: true })
    rmSync(available, { force: true })
    rmSync(path, { force: true })

    return { success: `Proxy ${options.name} deleted` }
  }

  ensure( options, command ) {
    if ( !options.name ) return { error: `narnia ${command} <name> is required` }

    const path = this.config.proxy_dir + options.name
    if ( !existsSync(path) ) return { error: `Proxy ${options.name} doesn't exist` }

    return { proxy: JSON.parse(readFileSync(path, 'utf8')), path }
  }

  ensure_config() {
    let response = { error: null }

    if ( !existsSync(this.config.proxy_dir) )
      response.error = `Proxy directory ${this.config.proxy_dir} doesn't exist\nRun 'narnia install' to create it`;

    return response;
  }

  print_response(response) {
    if ( response?.error )
      console.log( 'Error: ' + response.error )

    if ( response?.success )
      console.log( response.success )
  }

}