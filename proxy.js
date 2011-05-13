var http_proxy = require("./lib/proxy");
var utils = require("./lib/proxy-utils");

// Configuration - TODO: move to config file
var listen_port = 80;

var proxy = http_proxy.createServer({
	"targetHost": "213.129.83.20",
	"targetPort": "80",
}).listen(listen_port);
utils.log("master: Listening on port " + listen_port);
