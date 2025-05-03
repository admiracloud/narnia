import { readFileSync, existsSync } from 'fs';

const dir = import.meta.url
  .replace( 'file://', '' )
  .replace( '/src/lib.js', '/' )
  .replace( '/src/utils/read-conf.js', '/' )
  .replace( '/cli.js', '/' )

const files = [
  '/etc/narnia/narnia.conf',
  dir + 'local.conf',
  process.cwd() + '/local.conf'

  ]

function readOne( path ) {
  const data   = readFileSync( path, 'utf8' )
  const lines  = data.split('\n')
  const config = {}

  for ( let line of lines ) {
    line = line.trim()
    if ( !line || line.startsWith('#') ) continue;
    
    const [key, value] = line.split('=').map(item => item.trim())
    
    if ( key && value ) config[key] = value
  }

  return config;
}

export function readConf() {
  const config = {}

  for ( const file of files ) {
    if (!existsSync(file)) continue;

    Object.assign(config, readOne(file))
  }

  return config;
}