var util = require("util");
var http = require("http");
var cache = require("./cache");

function ReverseProxyServer(options, requestListener) {
	if (!(this instanceof ReverseProxyServer)) return new ReverseProxyServer(requestListener);
	http.Server.call(this);

	this.addListener('request', proxyRequestListener);
	this.addListener('refresh', refreshHandler);

	if (requestListener) {
		this.addListener('request', requestListener);
	}

	this.targetHost = options.targetHost;
	this.targetPort = options.targetPort || 80;
	this.visibleName = options.visibleName || 'nody-proxy';

	//this.cacheStoreType = options.cacheStoreType || 'MemoryCache';
	//this.cacheStoreOptions = options.cacheStoreOptions || {};

	this.cache = new cache.MemoryCache();
}

util.inherits(ReverseProxyServer, http.Server);
exports.ReverseProxyServer = ReverseProxyServer;

exports.createServer = function(options, requestListener) {
	return new ReverseProxyServer(options, requestListener);
}

function proxyRequestListener(req, res) {
	self = this;

	req.cacheKey = generateCacheKey(req);
	var cacheData = false;

	if (req.method === 'GET') {
		cacheData = JSON.parse(self.cache.get(req.cacheKey));
	}

	if (cacheData) {

		appendHeader('x-cache', 'HIT from ' + self.visibleName, cacheData.headers);
		cacheData.headers['age'] = getTimestamp() - cacheData.timestamp;

		if (isExpired(cacheData.headers)) {
			// Background refresh
			self.emit('refresh', req);
			appendHeader('x-cache-lookup', 'MISS from ' + self.visibleName, cacheData.headers);
		} else {
			appendHeader('x-cache-lookup', 'HIT from ' + self.visibleName, cacheData.headers);
		}

		res.writeHead(cacheData.statusCode, cacheData.headers);
		res.end(cacheData.body);

	} else {
		self.emit('refresh', req, res);
	}
}

exports._proxyRequestListener = proxyRequestListener;

function refreshHandler(req, res) {
	self = this;
	// response object is optional - only exists if a client is waiting on a response from the
	// upstream request (because the item wasn't in the cache at all)
	if (typeof(res) === 'undefined') res = null;

	var options = {
		host: self.targetHost,
		port: self.targetPort,
		method: req.method,
		path: req.url,
		headers: req.headers
	};

	var upstreamReq = http.request(options, function(upstreamRes) {
		upstreamResponseHandler(upstreamRes, req, res);
	});

	req.addListener('data', function(chunk) {
		upstreamReq.write(chunk, 'binary');
	});
	req.addListener('end', function() {
		upstreamReq.end();
	});
	req.addListener('error', function(err) {
		res.writeHead(500, {
			'content-type': 'text/plain',
			'content-length': err.message.length
		});
		res.end(err.message);
	});
}

exports._refreshHandler = refreshHandler;

function upstreamResponseHandler(upstreamRes, req, res) {

	var cacheObj = {
		'timestamp': getTimestamp(),
		'statusCode': upstreamRes.statusCode,
		'headers': copyObj(upstreamRes.headers),
		'body': ''
	};

	upstreamRes.addListener('data', function(chunk) {
		cacheObj.body = cacheObj.body + chunk;
	});

	upstreamRes.addListener('end', function() {
		self.cache.set(req.cacheKey, JSON.stringify(cacheObj));
	});

	if (res !== null) {
		upstreamRes.headers['age'] = '0';
		appendHeader('x-cache', 'MISS from ' + self.visibleName, upstreamRes.headers);
		appendHeader('x-cache-lookup', 'MISS from ' + self.visibleName, upstreamRes.headers);
		res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
		upstreamRes.addListener('data', function(chunk) {
			res.write(chunk, 'binary');
		});
		upstreamRes.addListener('end', function() {
			res.end();
		});
	}
}

exports._upstreamResponseHandler = upstreamResponseHandler;

function generateCacheKey(req) {
	return JSON.stringify([
		self.targetHost,
		self.targetPort,
		req.method,
		req.url,
		req.headers['host']
	]);
}

function calculateMaxAge(headers) {
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

function isExpired(headers) {
	if (headers["age"] > calculateMaxAge(headers)) {
		return true;
	} else {
		return false;
	}
}

function appendHeader(key, value, headers) {
	if (typeof(headers[key]) == "undefined") {
		headers[key] = value;
	} else {
		headers[key] = headers[key] + ", " + value;
	}
	//return headers;
}

function getTimestamp(date) {
	if (typeof(date) !== 'Date') date = new Date();
	return Math.round(date.getTime() / 1000);
}

function copyObj(obj) {
	var clone = {};
	for (var i in obj) {
		if (typeof(obj[i])=="object")
			clone[i] = copyObj(obj[i]);
		else
			clone[i] = obj[i];
	}
	return clone;
}