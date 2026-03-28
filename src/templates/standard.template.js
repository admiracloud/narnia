export class StandardTemplate {

	constructor( proxy, address, config, wellknown = false ) {

		this.domain      = proxy.domain
		this.protocol    = address.protocol
		this.host        = address.host
		this.port        = address.port
		this.public      = config.public
		this.certs_dir   = config.certs_dir
		this.certificate = proxy.certificate
		this.wellknown   = wellknown
		this.domain_slug = proxy.domain.replaceAll('.', '_')
		this.keepalive   = proxy.keepalive ?? config.keepalive
		this.server_name = proxy.domain

		// proxy pass should not use upstream definition
		// when keepalive connections is set to zero (0)
		this.proxy_pass  = `${this.protocol}://`
		this.proxy_pass += this.keepalive == '0'
			? `${this.host}:${this.port}`
			: `${this.domain_slug}_proxy`

		if ( proxy.additional.length > 0 )
			this.server_name += ' ' + proxy.additional.join(' ')
	}

	// Reusable template for the upstream directive
	upstream = () =>

	`
	upstream ${this.domain_slug}_proxy {
		server ${this.host}:${this.port};
		keepalive ${this.keepalive};
		keepalive_requests 1000;
		keepalive_time    1h;
		keepalive_timeout 75s;
	}
	`

	// Template for http part of proxy
	http = () =>

	`
	server {
		server_name ${this.server_name};
		listen 80;
		listen [::]:80;

		root ${this.public};

		${this.wellknown ? this.wellknown_location() : ''}

		${this.certificate ? this.redirect_location() : this.proxy_location()}
	}
	`

	// Template for https part of proxy
	https = () =>

	`
	server {
		server_name ${this.server_name};
		listen 443 ssl;
		listen [::]:443 ssl;
		http2 on;

		root ${this.public};

		${this.wellknown ? this.wellknown_location() : ''}

		${this.proxy_location()}

		ssl_certificate ${this.certs_dir}${this.domain}/fullchain.crt;
		ssl_certificate_key ${this.certs_dir}${this.domain}/${this.domain}.key;
	}
	`

	proxy_location = () =>

		`location / {
			include              proxy-headers.conf;
			proxy_pass           ${this.proxy_pass};
			client_max_body_size 512M;
		}`

	wellknown_location = () =>

		`location /.well-known {
			alias ${this.public}.well-known;
		}`

	redirect_location = () =>

		`location / {
			return 301 https://$host$request_uri;
		}`

	generate = () =>
		( this.keepalive != '0' ? this.upstream() : '' )
		+ this.http()
		+ ( this.certificate ? this.https() : '' )
}