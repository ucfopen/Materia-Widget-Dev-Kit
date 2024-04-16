#! /usr/bin/env node

// command line options
const args = process.argv.slice(2);

const shell = require("shelljs");

shell.exec(`export NODE_ENV=development || set NODE_ENV=development && node ./node_modules/materia-widget-development-kit/express.js ${args.join(' ')}`);