# Recommendations

## Nginx config for a transparent proxy at the host

```nginx
user  nginx;
worker_processes  auto;

error_log  /dev/null crit; #/var/log/nginx/error.log warn;
pid        /var/run/nginx.pid;

worker_rlimit_nofile 1048576;

#Worker Connections
events {
	worker_connections 524288;
	use epoll;
	multi_accept on;
}

# Services stream proxy
# include services-proxy.conf;

http {
	log_format  main        '$remote_addr - $remote_user [$time_local] "$request" '
	'$status $body_bytes_sent "$http_referer" '
	'"$http_user_agent" "$http_x_forwarded_for"';

	access_log  off; #/var/log/nginx/access.log  main;

	# Nginx Defaults for Proxies
	tcp_nodelay on;
	keepalive_timeout  30s;
	gzip  off;

	# Rules for a better transparent proxy
	proxy_buffering off;
	proxy_request_buffering off;

	# Upstream connection efficiency
	proxy_http_version 1.1;
	proxy_set_header   Connection "";

	# Timeouts
	proxy_connect_timeout  10s;
	proxy_send_timeout     3600s;
	proxy_read_timeout     3600s;

	# TCP-level keepalive on upstream sockets
	proxy_socket_keepalive on;

	# Header buffer (still used even with buffering off)
	proxy_buffer_size     8k;

	# Sockets
	map $http_upgrade $connection_upgrade {
		default upgrade;
		''      "";
	}

	include ssl-performance.conf;

	# Adimira Defaults
	client_body_buffer_size 32K;
	client_header_buffer_size 1k;
	large_client_header_buffers 4 16k;
	# The max body size can optionally be customized per proxy
	client_max_body_size 512m;

	include /etc/nginx/conf.d/*.conf;
	include /etc/nginx/sites-enabled/*;
	server_names_hash_bucket_size 128;
}
```

## Values for `ssl-performance.conf`

```nginx
# /etc/nginx/ssl-performance.conf

# intermediate configuration
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ecdh_curve X25519:prime256v1:secp384r1;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384:DHE-RSA-CHACHA20-POLY1305;
ssl_prefer_server_ciphers on;

# see also ssl_session_ticket_key alternative to stateful session cache
ssl_session_timeout 1d;
ssl_session_cache shared:MozSSL:250m;  # about 1000000 sessions

# openssl dhparam -out /etc/ssl/certs/dhparam.pem 4096
ssl_dhparam "/etc/ssl/certs/dhparam.pem";

# OCSP stapling
ssl_stapling on;
ssl_stapling_verify on;

# verify chain of trust of OCSP response using Root CA and Intermediate certs
# This will be added in each virtual server, individually for each domain
# ssl_trusted_certificate /path/to/root_CA_cert_plus_intermediates;

# Using Cloudflare DNS resolver
resolver 1.1.1.1 1.0.0.1 valid=300s;
resolver_timeout 5s;
```

## Values for `/etc/nginx/proxy-headers.conf`

```nginx
# /etc/nginx/proxy-headers.conf

proxy_set_header Host               $host;
proxy_set_header X-Real-IP          $remote_addr;
proxy_set_header X-Forwarded-For    $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Host   $host;
proxy_set_header X-Forwarded-Proto  $scheme;
proxy_set_header Upgrade            $http_upgrade;
proxy_set_header Connection         $connection_upgrade;
```