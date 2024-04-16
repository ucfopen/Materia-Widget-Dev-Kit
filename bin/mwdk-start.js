#! /usr/bin/env node

// command line options
const args = process.argv.slice(2);

const shell = require("shelljs");

// check if the NODE_ENV is set to anything
// if so, don't change it
let node_env = process.env.NODE_ENV;
if (node_env === undefined || node_env === null || node_env === '') {
    node_env = 'development';
}

shell.exec(`export NODE_ENV=${node_env} || set NODE_ENV=${node_env} && node ./node_modules/materia-widget-development-kit/express.js ${args.join(' ')}`);