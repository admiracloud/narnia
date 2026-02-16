import mri from 'mri';

import { Narnia }   from '#lib.js';
import { readConf } from '#utils/read-conf.js';

/* Getting command line arguments */
const command = mri( process.argv.slice( 2 ), {
  alias: {
    h: 'help',
    v: 'version',
  }
});

if ( command.help || ( process.argv.length <= 2 && process.stdin.isTTY ) ) {
  console.log( 'Narnia version ' + '0.4.3' )
  console.log( 'Narnia proxy manager help text go here' )
  process.exit()
}

if ( command.version ) {
  console.log( 'Narnia version ' + '0.4.3' )
  process.exit()
}

const config = readConf()
const narnia = new Narnia( config )
const mode   = command[ '_' ][ 0 ].replace(':', '_')

if ( typeof narnia[mode] != 'function' ) {
  console.log( `Invalid command 'narnia ${mode}'` )
  process.exit()
}

// If second parameter is present, set it as "name"
if ( command[ '_' ].length > 1 )
  command.name = command[ '_' ][ 1 ]

// Ensure installation and config directory
let response = await ( mode != 'install' ? narnia.ensure_config() : null );

if ( response?.error ) {
  console.log( 'Error: ' + response.error )
  process.exit()
}

// Call command
response = await narnia[mode](command)
narnia.print_response(response)
process.exit()