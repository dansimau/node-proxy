var console = require('console');
var fs = require('fs');
var util = require('util');
var events = require('events');
var proxyUtils = require('./utils');

function MemoryCache(options) {
	events.EventEmitter.call(this);
	var self = this;

	this.options = options || {};
	this.options.maxmem = this.options.maxmem * 1024 * 1024;

	this.keys = [];
	this.buffers = {};

	this.keyCount = 0;
	this.bufferBytes = 0;

	this.addListener('memorycleanup', cleanMemory);

	setInterval(function() {
		self._printMemoryUsage();
	}, 300000); // 5 mins

	setInterval(function() {
		self.emit('memorycleanup', self);
	}, 30000);
};

util.inherits(MemoryCache, events.EventEmitter);
exports.MemoryCache = MemoryCache;

MemoryCache.prototype.get = function(key) {
	if (typeof(this.buffers[key]) === 'undefined') return false;
	return this.buffers[key].toString();
};

MemoryCache.prototype.set = function(key, value) {

	if (this.get(key) !== false) {
		this.del();
	}

	this.buffers[key] = new Buffer(value);
	this.keys.push(key);

	this.keyCount = this.keyCount + 1;
	this.bufferBytes = this.bufferBytes + Buffer.byteLength(this.buffers[key].toString(), 'utf8');
	return;
};

MemoryCache.prototype.del = function(key) {
	if (typeof(key) === 'undefined') {
		key = this.keys.shift();
	}
	if (typeof(this.buffers[key]) === 'undefined') return false;

	var oldBufferSize = Buffer.byteLength(this.buffers[key].toString(), 'utf8');

	if (delete this.buffers[key]) {
		this.keyCount = this.keyCount - 1;
		this.bufferBytes = this.bufferBytes - oldBufferSize;
		return key;
	} else {
		return false;
	}
};

MemoryCache.prototype._printMemoryUsage = function() {
		console.log("\nCache memory stats\n------------------");
		console.log("items: " + self.keyCount + "; size: " + (new Number(self.bufferBytes / 1024 / 1024)).toFixed(2) + " MB; max: " + (new Number(self.options.maxmem / 1024 / 1024)).toFixed(2));
		console.log("\nProcess memory usage\n--------------------");
		proxyUtils.printMemoryUsage();
}

function cleanMemory(obj) {
	while (obj.bufferBytes > obj.options.maxmem || obj.keyCount > obj.options.maxitems) {
		// Delete oldest memory item
		obj.del();
	}
}

exports._cleanMemory = cleanMemory;

function DiskCache(options) {
	if (!options) options = {};
	this.cachePath = options.cachePath || 'cache';
	fs.stat(this.cachePath, function(err, stats) {
		if (err)
			throw err;
		if (!stats.isDirectory())
			throw 'Cache directory: not a directory (' + this.cachePath + ')';
	});
};

exports.DiskCache = DiskCache;

DiskCache.prototype.get = function(key) {
	var hash, value;
	try {
		hash = proxyUtils.md5sum(key);
		value = fs.readFileSync(this.cachePath + '/' + hash[0] + '/' + hash, 'utf8');
	}
	catch (err) {
		return false;
	}
	return value;
};

DiskCache.prototype.set = function(key, value) {
	var hash = proxyUtils.md5sum(key);
	try {
		fs.statSync(this.cachePath + '/' + hash[0]);
	}
	catch (err) {
		fs.mkdirSync(this.cachePath + '/' + hash[0], 0770);
	}
	fs.writeFile(this.cachePath + '/' + hash[0] + '/' + hash, value, function(err) {
		if (err) {
			// Handle write error
		}
	});
};

function Cache(options) {
	var self = this;

	events.EventEmitter.call(this);
	if (!options) options = {};

	this.memory = new MemoryCache(options.memory);
	this.disk = new DiskCache(options.disk);

	this.stats = {
		hits: 0,
		misses: 0,
		memory: {
			hits: 0,
			misses: 0
		},
		disk: {
			hits: 0,
			misses: 0
		}
	};

	setInterval(function() {
		self._printStats();
	}, 300000); //5 mins
}

exports.Cache = Cache;

Cache.prototype.get = function(key) {
	var value;

	value = this.memory.get(key);
	if (value !== false) {
		this.stats.hits++;
		this.stats.memory.hits++;
		return {
			"hit": "MEM",
			"value": value
		};
	} else {
		this.stats.memory.misses++;
	}

	value = this.disk.get(key);
	if (value !== false) {
		this.stats.hits++;
		this.stats.disk.hits++;
		this.memory.set(key, value);
		return {
			"hit": "DISK",
			"value": value
		};
	} else {
		this.stats.disk.misses++;
	}

	this.stats.misses++;
	return false;
};

Cache.prototype.set = function(key, value) {
	this.memory.set(key, value);
	this.disk.set(key, value);
};

Cache.prototype._printStats = function() {

	var o = 'Cache stats' + "\n" + '-----------';

	o += 'memory hits: ' + this.stats.memory.hits + "\n";
	o += 'memory misses: ' + this.stats.memory.misses + "\n";
	o += 'memory hit rate: ' + (new Number(this.stats.memory.hits / (this.stats.memory.hits + this.stats.memory.misses))).toFixed(2) + "\n";
	o += 'disk hits: ' + this.stats.disk.hits + "\n";
	o += 'disk misses: ' + this.stats.disk.misses + "\n";
	o += 'disk hit rate: ' + (new Number(this.stats.disk.hits / (this.stats.disk.hits + this.stats.disk.misses))).toFixed(2) + "\n";
	o += 'cache hits: ' + this.stats.hits + "\n";
	o += 'cache misses: ' + this.stats.misses + "\n";
	o += 'cache hit rate: ' + (new Number(this.stats.hits / (this.stats.hits + this.stats.misses))).toFixed(2);

	console.log(o);
}
