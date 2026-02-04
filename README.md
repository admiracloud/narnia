# Narnia Proxy Manager

Narnia is a CLI (command line interface) program designed to manage proxies in Nginx. It also provides a native built-in SSL certificate client for Let's Encrypt.

## Overview

Narnia simplifies the management of Nginx proxy configurations by providing a command-line interface to create, enable, disable, and manage SSL certificates for your proxies.

## Installation

```bash
# Install Narnia
narnia install
```

This command creates the necessary directories for Narnia to function properly.

## Configuration

Narnia reads configuration from the following files (in order of precedence):

- `/etc/narnia/narnia.conf`
- `./local.conf` (in the Narnia installation directory)
- `./local.conf` (in the current working directory)

## Commands

### List Proxies

```bash
narnia list
```

Lists all configured proxies and their status.

### Create a Proxy

```bash
narnia create <name> --address <address> [--keepalive <value>] [--additional <domains>] [--template <template>]
```

Creates a new proxy configuration.

- `<name>`: The domain name for the proxy
- `--address`: The target address (e.g., `http://localhost:3000`)
- `--keepalive`: (Optional) Number of keepalive connections (default: 192)
- `--additional`: (Optional) Additional domain names, comma-separated
- `--template`: (Optional) Allow to choose a template. Default to `standard`

### Update a Proxy

```bash
narnia set <name> [--address <address>] [--keepalive <value>] [--additional <domains>] [--add-domain <domains>] [--template <template>]
```

Updates an existing proxy configuration.

- `<name>`: The domain name for the proxy
- `--address`: (Optional) New target address (e.g., `http://localhost:4000`)
- `--keepalive`: (Optional) Replace all additional domains
- `--additional`: (Optional) Replace all additional domains with the specified comma-separated domains
- `--add-domain`: (Optional) Add more domains to the existing list

### Enable a Proxy

```bash
narnia enable <name>
```

Enables a proxy by creating a symlink in Nginx's sites-enabled directory and reloading Nginx.

### Disable a Proxy

```bash
narnia disable <name>
```

Disables a proxy by removing the symlink from Nginx's sites-enabled directory and reloading Nginx.

### Delete a Proxy

```bash
narnia delete <name>
```

Deletes a proxy configuration and removes it from Nginx.

### SSL Certificate Management

```bash
narnia ssl:generate <name> [--staging]
```

Generates an SSL certificate for the proxy using Let's Encrypt.

- `<name>`: The domain name of the proxy
- `--staging`: (Optional) Use Let's Encrypt staging environment for testing

```bash
narnia ssl:renew [<name>]
```

Generates an SSL certificate for the proxy using Let's Encrypt. When `<name>` is not passed, all certificates are renewed when having less than 30 days of expiration.

- `<name>`: (Optional) The domain name of the proxy

```bash
narnia ssl:check
```

Checks and updates proxy data when necessary for proxies generated before version 0.4.0.

### Help and Version

```bash
narnia --help  
narnia --version
```