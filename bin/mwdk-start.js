#! /usr/bin/env node
var shell = require("shelljs");

shell.exec("env RUNNING_DEV_SERVER=true node ./node_modules/materia-widget-development-kit/express.js --mode=development");