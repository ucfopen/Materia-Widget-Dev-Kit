#! /usr/bin/env node
var shell = require("shelljs");

shell.exec("export NODE_ENV=production || set NODE_ENV=production && webpack");
