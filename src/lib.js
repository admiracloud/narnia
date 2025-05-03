import { mkdirSync, readdirSync, readFileSync, existsSync, writeFileSync, rmSync } from 'fs';
import { execSync } from 'child_process';

import { list_table }      from '#utils/list-utils.js'
import { parseUrl }        from '#utils/url.js';
import { DefaultTemplate } from '#templates/default.template.js';
import { LibSSL }          from '#ssl/lib-ssl.js';

export class Narnia {

  config = {}
  proxies = {}

  constructor( config = {} ) {
    this.config.lib_dir = import.meta.url
      .replace( 'file://', '' )
      .replace( '/src/lib.js', '/' )
      .replace( '/cli.js', '/' )

    // Default config
    this.config.nginx_dir   = '/etc/nginx/'
    this.config.data_dir    = '/etc/narnia/'
    this.config.reload      = 'sudo /usr/sbin/service nginx reload'
    this.config.timeout     = 10000
    this.config.keepalive   = "192"

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
    if ( !existsSync(this.config.proxy_dir) )
      return { error: `Proxy directory ${this.config.proxy_dir} doesn't exist\nRun 'narnia install' to create it` }

    this.retrieve()
    list_table(this.proxies)
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

    const address = parseUrl(options.address)
    if ( !address.host ) return { error: 'Invalid --address <address>' }

    const path = this.config.proxy_dir + options.name
    if ( existsSync(path) ) return { error: `Proxy ${options.name} already exists` }

    const proxy = {
      domain: options.name,
      state: 'disabled',
      address: `${address.protocol}://${address.host}:${address.port}`,
      certificate: false,
      keepalive: Number.isInteger(options.keepalive) ? '' + options.keepalive : this.config.keepalive,
      additional: options.additional
        ? options.additional.split(',').map(d => d.trim())
        : []
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
      const address = parseUrl(options.address)
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

    // Create/update nginx configuration
    const template = new DefaultTemplate(proxy, parseUrl(proxy.address), this.config, wellknown)

    // Write nginx configuration
    writeFileSync(
      this.config.sites_available + proxy.domain,
      template.generate(),
      { mode: 0o644 }
    )
  }

  async ssl( options ) {
    const { proxy, path, error } = this.ensure(options, 'ssl')
    if ( error ) return { error };

    if ( options.generate ) {
      const staging = !!options?.staging;
      return this.ssl_generate(path, proxy, staging)
    }

    return { error: `Missing or invalid option for 'narnia ssl ${proxy.domain}'` }
  }

  async ssl_generate( path, proxy, staging ) {
    // Enable .well-known directory and reload nginx
    let wellknown = true
    this.save( path, proxy, wellknown )
    this.reload()

    const libssl = new LibSSL(this.config, proxy)

    if( staging ) libssl.staging = true

    const result = await libssl.generate( staging )

    if ( !staging && result.success )
      proxy.certificate = true

    // Disable .well-known directory and reload nginx
    wellknown = false
    this.save( path, proxy, wellknown )
    this.reload()

    return result;
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

}