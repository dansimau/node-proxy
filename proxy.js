#!/usr/bin/env node

var util = require('util');
var http_proxy = require('./lib/proxy');
var fs = require('fs');

var configFile;
var conf = {};

for (var i = 0, l = process.argv.length; i < l; i++) {
	if (process.argv[i].indexOf('-f') > -1) {
		configFile = process.argv[i+1];
		i++;
		continue;
	}
}

if (typeof(configFile) === 'undefined') configFile = __dirname + '/proxy.conf';

try {
	var lines = fs.readFileSync(configFile, 'utf8').split("\n");

	for (var i=0, l=lines.length; i<l; i++) {
		if (lines[i].match(/^\s*\/\//)) {
			delete lines[i];
		}
	}
	lines = lines.join("\n");
	conf = JSON.parse(lines);
}
catch (err) {
	util.log('Unable to read configuration from file (' + configFile + ').');
	util.log(err);
	process.exit(1);
}

for (var i = 0, l = conf.length; i < l; i++) {
	var listen = {};
	listen.hostname = conf[i].listen.hostname;
	listen.port = conf[i].listen.port;
	var proxy = http_proxy.createServer(
		conf[i].proxy
	).listen(listen.port, listen.hostname, function() {
		util.log("Listening on interface " + listen.hostname + ":" + listen.port);
	});
}