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
  console.log( 'Narnia version ' + '0.2.2' )
  console.log( 'Narnia proxy manager help text go here' )
  process.exit()
}

if ( command.version ) {
  console.log( 'Narnia version ' + '0.2.2' )
  process.exit()
}

const config = readConf()
const narnia = new Narnia( config )
const mode   = command[ '_' ][ 0 ]

if ( typeof narnia[mode] != 'function' ) {
  console.log( `Invalid command 'narnia ${mode}'` )
  process.exit()
}

// If second parameter is present, set it as "name"
if ( command[ '_' ].length > 1 )
  command.name = command[ '_' ][ 1 ]

const response = await narnia[mode](command)

if ( response?.error )
  console.log( 'Error: ' + response.error )

if ( response?.success )
  console.log( response.success )