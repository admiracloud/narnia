const list_columns = {
  domain: 'DOMAIN',
  state: 'STATE',
  address: 'PROXY ADDRESS',
  certificate: 'CERTIFICATE',
  keepalive: 'KEEPALIVE',
  additional: 'ADDITIONAL DOMAINS',
  template: 'TEMPLATE',
}

const length = {
  domain: 6,
  state: 6,
  address: 13,
  certificate: 11,
  keepalive: 9,
  additional: 18,
  template: 8,
}

const pad   = 4
const stdout = process.stdout

export const list_table = function ( proxies ) {
  const columns = Object.keys( list_columns )

  // Calculate max length for each column
  for ( const domain in proxies ) {
    const proxy = proxies[domain]

    for ( const column of columns ) {
      // Join arrays
      if ( Array.isArray(proxy[column]) )
        proxy[column] = proxy[column].join(', ')

      // Convert column value to string, in case it's a number
      proxy[column] = '' + (proxy[column] || '')

      // Replace certificate boolean
      if ( column == 'certificate' )
        proxy[column] = ( proxy[column] === true || proxy[column] === 'true' ) ? 'enabled' : ''

      // Replace keepalive with empty string when 0
      if ( column == 'keepalive' )
        proxy[column] = ( proxy[column] == '0' || !proxy[column] ) ? '' : proxy[column]

      if (proxy[column].length > length[column])
        length[column] = proxy[column].length
    }
  }

  // Print headers with padding
  for ( const column of columns )
    stdout.write( list_columns[column].padEnd(length[column] + pad) )

  // Print proxies with padding
  for ( const domain in proxies ) {
    const proxy = proxies[domain]

    stdout.write( '\n' )

    for ( const column of columns ) {
      stdout.write( proxy[column].padEnd(length[column] + pad) )
    }
  }

  // New line between end of content and terminal prompt
  stdout.write( '\n' )

}