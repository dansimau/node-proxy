var http = require("http");
var console = require("console");
var crypto = require('crypto');
var fs = require("fs");
var utils = require("./proxy-utils")

var name = "node-proxy";
var target = "213.129.83.20";
var target_port = "80";
var access_log = "access.log"

// Max time in seconds before a stale object won't be served any more (-1 = no maximum)
var max_stale = 86400;

var cache_path = "cache"

process.on('uncaughtexception', function(e) {
	console.warn("Uncaught exception: " + e);
});

exports.createServer = function(options, handler) {
	return http.createServer(function(client_request, response) {

		var object_data = null;
		var cache_lookup = true;
		var cache_stale = false;
		var cache_send = true;

		var request_time = new Date();
		var now = Math.round(request_time.getTime() / 1000);

		// Create object hash
		var object_key_plain = [
			target,
			target_port,
			client_request.headers.host,
			client_request.method,
			client_request.url
		];
		var object_key = crypto.createHash('md5').update(JSON.stringify(object_key_plain)).digest("hex");

		// Try to load cache object from filesystem
		try {
			object_data = fs.readFileSync(cache_path + "/" + object_key, 'utf8');
		} catch (e) {
			cache_lookup = false;
			cache_stale = true;
			cache_send = false;
		}

		// Cached object exists
		if (cache_lookup) {

			object_data = JSON.parse(object_data);

			object_data.headers["x-cache"] = "";
			object_data.headers["x-cache-lookup"] = "";

			// Calculate if object is stale
			var age = (now - object_data.timestamp);
			var max_age = getMaxAge(object_data.headers);

			if (age > max_age) {
				cache_stale = true;
				cache_send = true;
				object_data.headers["x-cache-lookup"] = "MISS from " + name;
			} else {
				object_data.headers["x-cache-lookup"] = "HIT from " + name;
			}

			// If object is stale past the max_stale value, then don't serve it from the cache
			if (age > max_stale) {
				cache_stale = true;
				cache_send = false;
			}

			// Send object from cache
			if (cache_send) {
				object_data.headers["x-cache"] = "HIT from " + name;
				object_data.headers["age"] = age;

				response.writeHead(object_data.statusCode, object_data.headers)
				response.end(object_data.data);

				var log_stale
				if (cache_stale) {
					log_stale = "STALE";
				} else {
					log_stale = "FRESH";
				}

				logAccess(client_request.connection.remoteAddress + " " +
						   "-" + " " +
						   "-" + " " +
						   "[" + formatAccessLogDate(request_time) + "]" + " " +
						   "\"" + client_request.method + " " + client_request.url + "\" " +
						   object_data.statusCode + " " +
						   "-" + " " +
						   "HIT:" + log_stale);
			}
		}

		// If object was stale or nonexistent, fetch it from backend server
		if (cache_stale) {

			object_data = {
				"key": object_key_plain,
				"statusCode": 0,
				"timestamp": 0,
				"headers": "",
				"data": "",
			};

			// Do upstream request
			//utils.log("Backend: " + target + ":" + target_port + " " + client_request.method + " " + client_request.url);

			// Do the upstream/backend request
			var proxy_request = http.request({
				host: target,
				port: target_port,
				method: client_request.method,
				path: client_request.url,
				headers: client_request.headers
			}, function(proxy_response) {

				var cacheable = false;

				// Determine if object is cacheable
				if (typeof proxy_response.headers["cache-control"] == "undefined") {
					cacheable = true;
				} else {
					if (proxy_response.headers["cache-control"].indexOf("public") > -1 ||
						proxy_response.headers["cache-control"].indexOf("max-age") > -1) {
						cacheable = true;
					}
				}

				// Set object meta info
				object_data.timestamp = now;
				object_data.statusCode = proxy_response.statusCode;
				object_data.headers = proxy_response.headers;

				// Set/send output headers and response code
				if (!cache_send) {
					response_headers = proxy_response.headers;
					response_headers["x-cache"] = "MISS from " + name;
					response_headers["x-cache-lookup"] = "MISS from " + name;
					if (cacheable) response_headers["age"] = "0";
					response.writeHead(proxy_response.statusCode, response_headers);

					logAccess(client_request.connection.remoteAddress + " " +
							   "-" + " " +
							   "-" + " " +
							   "[" + formatAccessLogDate(request_time) + "]" + " " +
							   "\"" + client_request.method + " " + client_request.url + "\" " +
							   object_data.statusCode + " " +
							   "-" + " " +
							   "MISS:FRESH");
				}

				// Wipe the cache object if it's no longer cacheable
				if (cache_lookup && !cacheable) {
					fs.unlink(cache_path + "/" + object_key);
				}

				// Proxy data from remote request back to the client
				proxy_response.on('data', function(chunk) {
					if (!cache_send) response.write(chunk, 'binary');
					if (cacheable) object_data.data = object_data.data + chunk;
				});

				// End the response when the remote response is finished
				proxy_response.on('end', function() {

					// Save the cache item
					if (cacheable) fs.writeFile(cache_path + "/" + object_key, JSON.stringify(object_data));

					if (!cache_send) response.end();
				});
			});

			// Proxy data from the request through to the backend
			client_request.on('data', function(chunk) {
				proxy_request.write(chunk, 'binary');
			});

			// When the client connection closes, close the backend connection too
			client_request.on('end', function() {
				proxy_request.end();
			});
		}
	})
}

function logAccess(msg) {
	console.log(msg);
}

function getMaxAge(headers) {

	// Inspect cache-control header
	if (headers["cache-control"]) {
		var params = headers["cache-control"].split(",");
		for (var i=0, len=params.length; i<len; ++i ) {
			if (params[i].indexOf("max-age") > -1) {
				return params[i].split("=")[1];
			}
		}
	}
	return 0;
}

function formatAccessLogDate(date) {
	return ("0" + date.getDate()).slice(-2) + "/" +
	       ("0" + (date.getMonth()+1)).slice(-2) + "/" +
	       date.getFullYear() + ":" +
	       ("0" + date.getHours()).slice(-2) + ":" +
	       ("0" + date.getMinutes()).slice(-2) + ":" +
	       ("0" + date.getSeconds()).slice(-2) + " " +
	       "+" + (-date.getTimezoneOffset()/60*1000);
}
