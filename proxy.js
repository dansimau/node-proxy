var http_proxy = require("./lib/proxy");
var utils = require("./lib/proxy-utils");

// Configuration - TODO: move to config file
var listen_port = 80;

var proxy = http_proxy.createServer().listen(listen_port);
utils.log("master: Listening on port " + listen_port);
