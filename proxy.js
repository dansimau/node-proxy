var util = require('util');
var http_proxy = require('./lib/proxy');

// Configuration - TODO: move to config file
var listen_port = 80;

var proxy = http_proxy.createServer({
	"targetHost": "213.129.83.20",
	"targetPort": "80",
	cache: {
		maxMem: 16
	}
}).listen(listen_port);
util.log("master: Listening on port " + listen_port);
