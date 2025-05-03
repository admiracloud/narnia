import { readFileSync, writeFileSync } from 'fs';

const dir = import.meta.url
      .replace( 'file://', '' )
      .replace( '/src/deb/template.js', '/' )

const template = ( data ) =>
`Package: narnia
Version: ${data.version}
Section: admin
Priority: optional
Architecture: amd64
Maintainer: Paulo Coghi <paulo@adimira.com>
Description: Naria Proxy Manager for Nginx
 Narnia is a CLI (command line interface) program to manage proxies in Nginx
 It also provides a native built-in SSL certificate client for Let's Encrypt
`

const deb_control_template = () => {
  const data = {
    version: JSON.parse(readFileSync( dir + 'package.json', 'utf8' )).version
  }

  writeFileSync( dir + 'dist/DEBIAN/control', template(data) )
}

deb_control_template()