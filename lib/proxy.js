var fs = require("fs");
var util = require("util");
var http = require("http");
var cache = require("./cache");
var proxyUtils = require("./utils");

var months = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec"];

function ReverseProxyServer(options, requestListener) {
	if (!(this instanceof ReverseProxyServer)) return new ReverseProxyServer(requestListener);
	http.Server.call(this);

	this.addListener('request', proxyRequestListener);
	this.addListener('refresh', refreshHandler);

	if (requestListener) {
		this.addListener('request', requestListener);
	}

	this.options = options || {};
	this.cache = new cache.Cache(this.options.cache);

	this.accesslog = fs.createWriteStream(this.options.accesslog.path, {flags: 'a', encoding: 'utf8'});
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

	if (requestCacheable(req)) {
		try {
			var cachedata = self.cache.get(req._proxyMeta.meta.key);
			if (cachedata) req._proxyMeta.cache = JSON.parse(cachedata.value);
			req._proxyMeta.cache.headers.age = proxyUtils.timestamp() - req._proxyMeta.cache.timestamp;
		}
		catch (err) {
			console.log('Error decoding cache contents: ' + err);
		}
	}

	// If we've retrieved a cache object, we call requestCacheable() again to check object's age
	// against the request max-age
	if (req._proxyMeta.cache && requestCacheable(req)) {

		if (isExpired(req._proxyMeta.cache.headers)) {
			// Background refresh
			self.emit('refresh', req);
			req._proxyMeta.meta.cacheStatus = {'cache': 'HIT', 'lookup': 'MISS'};
		} else {
			req._proxyMeta.meta.cacheStatus = {'cache': 'HIT', 'lookup': 'HIT'};
		}

		req._proxyMeta.meta.cacheStatus.source = cachedata.hit;
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
		host: self.options.origins[0].host,
		port: self.options.origins[0].port,
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
	if (responseCacheable(upstreamRes)) {
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
		self.options.origins[0].host,
		self.options.origins[0].port,
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

function isExpired(cacheObjectHeaders, cacheControlHeaders) {
	// Second parameter is optional. If it's not specified, we'll assume we're checking against
	// the original origin server's cache-control headers
	if (typeof(cacheControlHeaders) === 'undefined') {
		cacheControlHeaders = cacheObjectHeaders;
	}

	if (cacheObjectHeaders['age'] > calculateMaxAge(cacheControlHeaders)) {
		return true;
	} else {
		return false;
	}
}

exports._isExpired = isExpired;

function requestCacheable(req) {

	// If we have proxy meta cache data attached to the request object, then it means this request
	// passed an earlier requestCacheable test, so we are checking the object age to see if it is
	// valid as per the request max-age
	if (req._proxyMeta.cache) {
		if (isExpired(req._proxyMeta.cache.headers, req.headers)) {
			return false;
		}
	}

	if (req.method !== 'GET') {
		return false;
	}

	if (typeof(req.headers["cache-control"]) !== "undefined") {
		if (req.headers["cache-control"].indexOf("private") > -1) {
			return false;
		} else if (req.headers["cache-control"].indexOf("no-cache") > -1) {
			return false;
		} else if (req.headers["cache-control"].indexOf("no-store") > -1) {
			return false;
		} else {
			return true;
		}
	}
	if (typeof(req.headers["pragma"]) !== "undefined") {
		if (req.headers["pragma"].indexOf("no-cache") > -1) {
			return false;
		}
	}
	// If nothing is specified, then allow stuff to be cached
	return true;
}

exports._requestCacheable = requestCacheable;

function responseCacheable(res) {
	if (typeof(res.headers["cache-control"]) !== "undefined") {
		if (res.headers["cache-control"].indexOf("private") > -1) {
			return false;
		} else if (res.headers["cache-control"].indexOf("no-cache") > -1) {
			return false;
		} else if (res.headers["cache-control"].indexOf("no-store") > -1) {
			return false;
		} else {
			return true;
		}
	}
	if (typeof(res.headers["pragma"]) !== "undefined") {
		if (res.headers["pragma"].indexOf("no-cache") > -1) {
			return false;
		}
	}
	// If nothing is specified, then allow stuff to be cached
	return true;
}

exports._responseCacheable = responseCacheable;

function appendHeader(key, value, headers) {
	if (typeof(headers[key]) == "undefined") {
		headers[key] = value;
	} else {
		headers[key] = headers[key] + ", " + value;
	}
}

exports._appendHeader = appendHeader;

function appendXcacheHeaders(headers, cacheMeta) {
	appendHeader('x-cache', cacheMeta.cache + ' from ' + self.options.name, headers);
	appendHeader('x-cache-lookup', cacheMeta.lookup +' from ' + self.options.name, headers);
}

exports._appendXcacheHeaders = appendXcacheHeaders;

function writeLog(req) {
	if (typeof(req._proxyMeta.meta.cacheStatus.source) !== 'undefined') {
		req._proxyMeta.meta.cacheStatus.cache = req._proxyMeta.meta.cacheStatus.source + '_' + req._proxyMeta.meta.cacheStatus.cache;
	}
	self.accesslog.write(req.connection.remoteAddress + " " +
			   "-" + " " +
			   "-" + " " +
			   "[" + formatAccessLogDate(req._proxyMeta.date) + "]" + " " +
			   "\"" + req.method + " " + req.url + " HTTP/" +  req.httpVersion + "\" " +
			   req._proxyMeta.cache.statusCode + " " +
			   req._proxyMeta.cache.body.length + " " +
			   req._proxyMeta.meta.cacheStatus.cache + ":" + req._proxyMeta.meta.cacheStatus.lookup + "\n", 'utf8');
}

exports._writeLog = writeLog;

function formatAccessLogDate(date) {
	return ("0" + date.getDate()).slice(-2) + "/" +
	       months[date.getMonth()] + "/" +
	       date.getFullYear() + ":" +
	       ("0" + date.getHours()).slice(-2) + ":" +
	       ("0" + date.getMinutes()).slice(-2) + ":" +
	       ("0" + date.getSeconds()).slice(-2) + " " +
	       "+" + (-date.getTimezoneOffset()/60*1000);
}

exports._formatAccessLogDate = formatAccessLogDate;
