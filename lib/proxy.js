var util = require("util");
var http = require("http");
var cache = require("./cache");
var proxyUtils = require("./utils");

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

	if (typeof(options.cache) === 'undefined') {
		options.cache = {};
	}

	this.cache = new cache.Cache(options.cache);
}

util.inherits(ReverseProxyServer, http.Server);
exports.ReverseProxyServer = ReverseProxyServer;

exports.createServer = function(options, requestListener) {
	return new ReverseProxyServer(options, requestListener);
}

function proxyRequestListener(req, res) {
	self = this;

	// Add our own extra data to the ServerRequest
	req._proxyMeta = {
		date: new Date(),
		meta: {
			key: generateCacheKey(req),
			cacheStatus: {}
		},
		cache: false
	};

	if (req.method === 'GET') {
		try {
			req._proxyMeta.cache = JSON.parse(self.cache.get(req._proxyMeta.meta.key));
		}
		catch (err) {
			console.log('Error decoding cache contents: ' + err);
		}
	}

	if (req._proxyMeta.cache) {

		req._proxyMeta.cache.headers.age = proxyUtils.timestamp() - req._proxyMeta.cache.timestamp;

		if (isExpired(req._proxyMeta.cache.headers)) {
			// Background refresh
			self.emit('refresh', req);
			req._proxyMeta.meta.cacheStatus = {'cache': 'HIT', 'lookup': 'MISS'};
		} else {
			req._proxyMeta.meta.cacheStatus = {'cache': 'HIT', 'lookup': 'HIT'};
		}

		appendXcacheHeaders(req._proxyMeta.cache.headers, req._proxyMeta.meta.cacheStatus);

		res.writeHead(req._proxyMeta.cache.statusCode, req._proxyMeta.cache.headers);
		res.end((new Buffer(req._proxyMeta.cache.body, 'base64')));

		writeLog(req);

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

	req._proxyMeta.cache = {
		timestamp: proxyUtils.timestamp(),
		statusCode: upstreamRes.statusCode,
		headers: proxyUtils.copyObj(upstreamRes.headers),
		body: ''
	};

	upstreamRes.addListener('data', function(chunk) {
		req._proxyMeta.cache.body = req._proxyMeta.cache.body + chunk.toString('base64');
	});
	if (isCacheable(upstreamRes.headers)) {
		upstreamRes.addListener('end', function() {
			self.cache.set(req._proxyMeta.meta.key, JSON.stringify(req._proxyMeta.cache));
		});
	}

	if (res !== null) {
		req._proxyMeta.meta.cacheStatus = {'cache': 'MISS', 'lookup': 'MISS'};
		upstreamRes.headers['age'] = '0';
		appendXcacheHeaders(upstreamRes.headers, req._proxyMeta.meta.cacheStatus);

		res.writeHead(upstreamRes.statusCode, upstreamRes.headers);

		upstreamRes.addListener('data', function(chunk) {
			res.write(chunk, 'binary');
		});
		upstreamRes.addListener('end', function() {
			res.end();
			writeLog(req);
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

exports._generateCacheKey = generateCacheKey;

function calculateMaxAge(headers) {
	if (typeof(headers['cache-control']) !== 'undefined') {
		var params = headers["cache-control"].split(',');
		for (var i=0, len=params.length; i<len; ++i ) {
			if (params[i].indexOf('max-age') > -1) {
				return params[i].split('=')[1];
			}
		}
	}
	return 0;
}

exports._calculateMaxAge = calculateMaxAge;

function isExpired(headers) {
	if (headers['age'] > calculateMaxAge(headers)) {
		return true;
	} else {
		return false;
	}
}

exports._isExpired = isExpired;

function isCacheable(headers) {
	if (typeof(headers["cache-control"]) !== "undefined") {
		if (headers["cache-control"].indexOf("private") > -1) {
			return false;
		} else if (headers["cache-control"].indexOf("no-cache") > -1) {
			return false;
		} else if (headers["cache-control"].indexOf("no-store") > -1) {
			return false;
		} else {
			return true;
		}
	}
	if (typeof(headers["pragma"]) !== "undefined") {
		if (headers["pragma"].indexOf("no-cache") > -1) {
			return false;
		}
	}
	// If nothing is specified, then allow stuff to be cached
	return true;
}

exports._isCacheable = isCacheable;

function appendHeader(key, value, headers) {
	if (typeof(headers[key]) == "undefined") {
		headers[key] = value;
	} else {
		headers[key] = headers[key] + ", " + value;
	}
}

exports._appendHeader = appendHeader;

function appendXcacheHeaders(headers, cacheMeta) {
	appendHeader('x-cache', cacheMeta.cache + ' from ' + self.visibleName, headers);
	appendHeader('x-cache-lookup', cacheMeta.lookup +' from ' + self.visibleName, headers);
}

exports._appendXcacheHeaders = appendXcacheHeaders;

function writeLog(req) {
	console.log(req.connection.remoteAddress + " " +
			   "-" + " " +
			   "-" + " " +
			   "[" + formatAccessLogDate(req._proxyMeta.date) + "]" + " " +
			   "\"" + req.method + " " + req.url + "\" " +
			   req._proxyMeta.cache.statusCode + " " +
			   req._proxyMeta.cache.body.length + " " +
			   req._proxyMeta.meta.cacheStatus.cache + ":" + req._proxyMeta.meta.cacheStatus.lookup);
}

exports._writeLog = writeLog;

function formatAccessLogDate(date) {
	return ("0" + date.getDate()).slice(-2) + "/" +
	       ("0" + (date.getMonth()+1)).slice(-2) + "/" +
	       date.getFullYear() + ":" +
	       ("0" + date.getHours()).slice(-2) + ":" +
	       ("0" + date.getMinutes()).slice(-2) + ":" +
	       ("0" + date.getSeconds()).slice(-2) + " " +
	       "+" + (-date.getTimezoneOffset()/60*1000);
}

exports._formatAccessLogDate = formatAccessLogDate;
