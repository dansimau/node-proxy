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
	util.log('Check that the file exists and syntax is correct.');
	process.exit(1);
}

for (var i = 0, l = conf.length; i < l; i++) {
	var listen_port = conf[i].port;
	var proxy = http_proxy.createServer(
		conf[i].proxy
	).listen(conf[i].port, conf[i].interface, function() {
		util.log("Listening on port " + listen_port);
	});
}