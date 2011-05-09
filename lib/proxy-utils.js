var console = require("console");

exports.log = function(msg) {
	console.log("[" + (new Date()) + "]: " + msg);
}
