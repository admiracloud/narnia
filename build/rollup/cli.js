import json       from '@rollup/plugin-json';
// import { string }     from "rollup-plugin-string";
import commonjs     from '@rollup/plugin-commonjs';
import { nodeResolve }  from '@rollup/plugin-node-resolve';
// import terser       from '@rollup/plugin-terser';

export default {
  input: 'src/cli.js',

  output: {
    file: 'cli.js',
    format: 'esm',
    banner: '#!/usr/bin/env node'
  },

  plugins: [
    json(),
    // string( { include: '**/*.md' } ),
    nodeResolve({ jsnext: true }),
    commonjs(),
    // terser()
  ],

  onwarn ( warning, warn ) {
    if ( warning.code === 'CIRCULAR_DEPENDENCY' ) return;
    warn( warning )
  }
};