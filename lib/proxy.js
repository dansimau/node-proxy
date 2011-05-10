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
	return http.createServer(handleClientRequest);
}

function logAccess(connection) {

	var cacheHitStatus;
	var cacheFreshStatus;

	if (connection.object.cacheHit) {
		cacheHitStatus = "HIT";
	} else {
		cacheHitStatus = "MISS";
	}

	if (connection.object.stale) {
		cacheFreshStatus = "STALE";
	} else {
		cacheFreshStatus = "FRESH";
	}

	console.log(connection.request.remoteAddress + " " +
			   "-" + " " +
			   "-" + " " +
			   "[" + formatAccessLogDate(connection.request.date) + "]" + " " +
			   "\"" + connection.request.method + " " + connection.request.url + "\" " +
			   connection.object.data.statusCode + " " +
			   connection.object.data.body.length + " " +
			   cacheHitStatus + ":" + cacheFreshStatus);
}

function isCacheable(headers) {
	if (typeof headers["cache-control"] == "undefined") {
		return true;
	} else if (headers["cache-control"].indexOf("public") > -1) {
		return true;
	} else if (headers["cache-control"].indexOf("max-age") > -1) {
		return true;
	}
	return false;
}

function getMaxAge(headers) {

	// Inspect cache-control header
	if (typeof headers["cache-control"] != "undefined") {
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

function appendHeader(key, value, headers) {
	if (typeof headers[key] == "undefined") {
		headers[key] = value;
	} else {
		headers[key] = headers[key] + ", " + value;
	}
	return headers;
}

function handleClientRequest(clientHttpRequest, clientHttpResponse) {

	var connection = {
		"request": {
			"date": "",
			"remoteAddress": "",
			"httpVersion": "",
			"method": "",
			"host": "",
			"url": ""
		},
		"response": {
			"headers": ""
		},
		"object": {
			"hash": "",
			"cacheLookup": "",
			"cacheHit": "",
			"age": "",
			"stale": "",
			"maxAge": "",
			"data": {
				"key": "",
				"timestamp": "",
				"statusCode": "",
				"headers": "",
				"body": ""
			}
		}
	};

	// Fill in request details
	connection.request.date = new Date();
	connection.request.remoteAddress = clientHttpRequest.connection.remoteAddress;
	connection.request.httpVersion = clientHttpRequest.httpVersion;
	connection.request.method = clientHttpRequest.method;
	connection.request.url = clientHttpRequest.url;
	connection.request.host = clientHttpRequest.headers["host"];

	// Fill in some initial object details
	connection.object.data.timestamp = Math.round(connection.request.date.getTime() / 1000);
	connection.object.data.key = [
		target,
		target_port,
		connection.request.host,
		connection.request.method,
		connection.request.url
	];
	connection.object.hash = crypto.createHash('md5').update(JSON.stringify(connection.object.data.key)).digest("hex");

	try {

		// Load cache data
		var cachedObjectData = JSON.parse(fs.readFileSync(cache_path + "/" + connection.object.hash, 'utf8'));

		// Restore cached object data
		connection.object.data.statusCode = cachedObjectData.statusCode;
		connection.object.data.headers = cachedObjectData.headers;
		connection.object.data.body = cachedObjectData.body;
		connection.object.age = (connection.object.data.timestamp - cachedObjectData.timestamp);
		connection.object.cacheLookup = true;

	} catch (e) {
		connection.object.cacheLookup = false;
		connection.object.cacheHit = false;
	}

	if (connection.object.cacheLookup) {

		connection.response.headers = connection.object.data.headers;
		connection.response.headers["age"] = connection.object.age;

		connection.object.maxAge = getMaxAge(connection.object.data.headers);

		// Calculate if cache lookup is stale
		if (connection.object.age > connection.object.maxAge) {
			connection.object.stale = true;
			connection.response.headers = appendHeader("x-cache-lookup", "MISS from " + name, connection.response.headers);
		} else {
			connection.object.stale = false;
			connection.response.headers = appendHeader("x-cache-lookup", "HIT from " + name, connection.response.headers);
		}

		// Calculate whether or not we're going to send a stale object
		if (connection.object.cacheLookup && connection.object.age < max_stale) {
			connection.object.cacheHit = true;
		} else {
			connection.object.cacheHit = false;
		}
	}

	if (connection.object.cacheHit) {

		connection.response.headers = appendHeader("x-cache", "HIT from " + name, connection.response.headers);
		connection.response.headers = appendHeader("warning", "110 Response is stale", connection.response.headers);
		connection.response.headers = appendHeader("via", connection.request.httpVersion + " " + name, connection.response.headers);

		logAccess(connection);

		clientHttpResponse.writeHead(connection.object.data.statusCode, connection.response.headers)
		clientHttpResponse.end(connection.object.data.body);

	} else {

		// Do the upstream/backend request
		var backendRequest = http.request({
			host: target,
			port: target_port,
			method: clientHttpRequest.method,
			path: clientHttpRequest.url,
			headers: clientHttpRequest.headers
		}, function(backendResponse) {
			handleBackendResponse(backendResponse, connection, clientHttpResponse);
		});

		// Proxy data from the request through to the backend
		clientHttpRequest.on('data', function(chunk) {
			backendRequest.write(chunk, 'binary');
		});

		// When the client connection closes, close the backend connection too
		clientHttpRequest.on('end', function() {
			backendRequest.end();
		});
	}
}

function handleBackendResponse(backendHttpResponse, connection, clientHttpResponse) {

	var cacheable;

	// Determine if object is cacheable
	cacheable = isCacheable(backendHttpResponse.headers);

	// Set object meta info
	connection.object.data.statusCode = backendHttpResponse.statusCode;
	connection.object.data.headers = backendHttpResponse.headers;

	// Add proxy headers
	connection.response.headers = JSON.parse(JSON.stringify(backendHttpResponse.headers));
	if (cacheable) connection.response.headers["age"] = "0";
	connection.response.headers = appendHeader("x-cache", "MISS from " + name, connection.response.headers);
	connection.response.headers = appendHeader("x-cache-lookup", "MISS from " + name, connection.response.headers);
	connection.response.headers = appendHeader("via", connection.request.httpVersion + " " + name, connection.response.headers);

	// If a client response is attached to this upstream response, then send it
	if (typeof clientHttpResponse != "undefined") {
		clientHttpResponse.writeHead(connection.object.data.statusCode, connection.response.headers);
	}

	// Wipe the cache object if it's no longer cacheable
	if (connection.object.cacheLookup && !cacheable) {
		fs.unlink(cache_path + "/" + connection.object.hash);
	}

	backendHttpResponse.on('data', function(chunk) {
		// If client request is waiting for data directly from this backend connection, send it
		if (typeof clientHttpResponse != "undefined") clientHttpResponse.write(chunk, 'binary');

		// Save chunk to buffer
		connection.object.data.body = connection.object.data.body + chunk;
	});

	backendHttpResponse.on('end', function() {
		// If client request is attached, close the connection
		if (typeof clientHttpResponse != "undefined") {
			clientHttpResponse.end();
		}

		logAccess(connection);

		// Save the cache item
		if (cacheable) fs.writeFile(cache_path + "/" + connection.object.hash, JSON.stringify(connection.object.data));
	});
}