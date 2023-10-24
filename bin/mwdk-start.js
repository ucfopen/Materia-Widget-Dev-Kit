#! /usr/bin/env node
var shell = require("shelljs");

shell.exec("export NODE_ENV=development || set NODE_ENV=development && node ./node_modules/materia-widget-development-kit/express.js --mode=development");