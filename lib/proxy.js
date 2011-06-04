var fs = require("fs");
var util = require("util");
var http = require("http");
var cache = require("./cache");
var proxyUtils = require("./utils");
var filters = require("../filters");

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
			cacheStatus: {
				cache: "",
				lookup: "",
				responseCacheable: false,
				needsRefresh: true,
				source: ""
			},
		},
		cache: false
	};

	// Initial check to see if cached response looks possible based on request details
	if ((req.method === 'GET' || req.method === 'HEAD') && cacheable(req.headers)) {
		try {
			var cachedata = self.cache.get(req._proxyMeta.meta.key);
			if (cachedata) {
				req._proxyMeta.cache = JSON.parse(cachedata.value);
				req._proxyMeta.cache.headers.age = proxyUtils.timestamp() - req._proxyMeta.cache.timestamp;
			}
		}
		catch (err) {
			console.log('Error decoding cache contents: ' + err);
		}
	}

	// Cache lookup was successful
	if (req._proxyMeta.cache) {

		// Check if the cached object can be used, according to the max-age in request header
		if (isExpired(req._proxyMeta.cache.headers, req.headers)) {
			req._proxyMeta.meta.cacheStatus.responseCacheable = false;
			req._proxyMeta.meta.cacheStatus.needsRefresh = true;

		// Check if the cache object has expired according to max-age in original response header
		} else if (isExpired(req._proxyMeta.cache.headers)) {
			req._proxyMeta.meta.cacheStatus.responseCacheable = true;
			req._proxyMeta.meta.cacheStatus.needsRefresh = true;
		} else {
			req._proxyMeta.meta.cacheStatus.responseCacheable = true;
			req._proxyMeta.meta.cacheStatus.needsRefresh = false;
		}
	} else {
		req._proxyMeta.meta.cacheStatus.responseCacheable = false;
		req._proxyMeta.meta.cacheStatus.needsRefresh = false;
	}

	// Run filters
	for (var i=0, l=self.options.filters.request.length; i<l; i++) {
		if (filters[self.options.filters.request[0]](req, res) === false) {
			return;
		}
	}

	// Set the right stuff for the x-cache headers
	if (req._proxyMeta.meta.cacheStatus.responseCacheable) {
		req._proxyMeta.meta.cacheStatus.cache = "HIT";
	} else {
		req._proxyMeta.meta.cacheStatus.cache = "MISS";
	}
	if (req._proxyMeta.meta.cacheStatus.needsRefresh) {
		req._proxyMeta.meta.cacheStatus.lookup = "MISS";
	} else {
		req._proxyMeta.meta.cacheStatus.lookup = "HIT";
	}

	if (req._proxyMeta.meta.cacheStatus.responseCacheable) {

		req._proxyMeta.meta.cacheStatus.source = cachedata.hit;
		appendXcacheHeaders(req._proxyMeta.cache.headers, req._proxyMeta.meta.cacheStatus);

		res.writeHead(req._proxyMeta.cache.statusCode, req._proxyMeta.cache.headers);
		res.end((new Buffer(req._proxyMeta.cache.body, 'base64')));

		writeLog(req);
	}

	if (req._proxyMeta.meta.cacheStatus.needsRefresh) {
		if (req._proxyMeta.meta.cacheStatus.responseCacheable) {
			// Async refresh
			self.emit('refresh', req);
		} else {
			// Sync refresh
			self.emit('refresh', req, res);
		}
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
		req._proxyMeta.dateEnd = new Date();
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
	if (cacheable(upstreamRes)) {
		upstreamRes.addListener('end', function() {
			self.cache.set(req._proxyMeta.meta.key, JSON.stringify(req._proxyMeta.cache));
		});
	}

	if (res !== null) {
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
	return false;
}

exports._calculateMaxAge = calculateMaxAge;

function isExpired(cacheObjectHeaders, cacheControlHeaders) {
	// Second parameter is optional. If it's not specified, we'll assume we're checking against
	// the original origin server's cache-control headers
	if (typeof(cacheControlHeaders) === 'undefined') {
		cacheControlHeaders = cacheObjectHeaders;
	}

	var maxAge = calculateMaxAge(cacheControlHeaders);

	if (maxAge == false) {
		return false;
	} else if (cacheObjectHeaders['age'] > maxAge) {
		return true;
	} else {
		return false;
	}
}

exports._isExpired = isExpired;

function cacheable(headers) {

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

exports._cacheable = cacheable;


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

	var agent, reqTime, reqUrl;

	if (typeof(req._proxyMeta.meta.cacheStatus.source) !== 'undefined') {
		req._proxyMeta.meta.cacheStatus.cache = req._proxyMeta.meta.cacheStatus.source + '_' + req._proxyMeta.meta.cacheStatus.cache;
	}

	if (typeof(req.headers["user-agent"]) === 'undefined') {
		agent = "-";
	} else {
		agent = req.headers["user-agent"];
	}

	if (typeof(req.headers["host"]) === 'undefined') {
		reqUrl = "http://" + self.options.origins[0].host + req.url;
	} else {
		reqUrl = "http://" + req.headers["host"] + req.url;
	}

//	reqTime = (req._proxyMeta.dateEnd.getTime() - req._proxyMeta.date.getTime());

	self.accesslog.write(req.connection.remoteAddress + " " +
			   "-" + " " +
			   "-" + " " +
			   "[" + formatAccessLogDate(req._proxyMeta.date) + "]" + " " +
			   "\"" + reqUrl + " HTTP/" +  req.httpVersion + "\" " +
			   req._proxyMeta.cache.statusCode + " " +
			   req._proxyMeta.cache.body.length + " " +
			   "\"-\" " +
			   "\"" + agent + "\" " +
			   req._proxyMeta.meta.cacheStatus.cache + ":" + req._proxyMeta.meta.cacheStatus.lookup + " " +
			   "\"-\"" +
			   "\n", 'utf8');
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
