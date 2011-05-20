#!/usr/bin/env node

var util = require('util');
var http_proxy = require('./lib/proxy');
var fs = require('fs');

var configFile = __dirname + '/proxy.conf';
var conf = {};

try {
	conf = JSON.parse(fs.readFileSync(configFile, 'utf8'));
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