var http = require("http");
var util = require("util");

var port = 80;
var target = "209.85.229.99";

try {
	http.createServer(function(request, response) {
	
		// Create unique connection ID
		var id = new Date();
		id = id.getTime();
	
		util.log("[" + id + "]: Request: " + request.method + " " + request.url + ", " + request.connection.remoteAddress);

		// Do upstream request
		util.log("[" + id + "]: Backend request: " + target + ":" + port + " " + request.method + " " + request.url);

		// Do the upstream/backend request
		var proxy_request = http.request({
			host: target,
			port: port,
			method: request.method,
			path: request.url,
			headers: request.headers
		}, function(proxy_response) {
	
			util.log("[" + id + "]: Backend response: " + proxy_response.statusCode);
			response.writeHead(proxy_response.statusCode, proxy_response.headers);

			// Proxy chunks of data from remote request back to the client	
			proxy_response.on('data', function(chunk) {
				response.write(chunk, 'binary');
			});

			// End the response when the remote response is finished
			proxy_response.on('end', function() {
				util.log("[" + id + "]: Backend response: " + proxy_response.statusCode);
				response.end();
			});
		});

		// Proxy the chunks of data from the request through to the backend
		request.on('data', function(chunk) {
			proxy_request.write(chunk, 'binary');
		});

		// If/when the client connection closes, close the backend connection too		
		request.on('end', function() {
			proxy_request.end();
		});

	}).listen(port);

	util.log("Listening on port " + port);
}
catch (e) {
	util.log("ERROR: Could not create socket 0.0.0.0." + port + " (" + e + ")");
	process.exit(1);
}
