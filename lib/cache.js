var events = require('events');
var util = require('util');
var console = require('console');
var proxyUtils = require('./utils');

function MemoryCache(options) {
	events.EventEmitter.call(this);
	var self = this;

	if (!options) options = {};
	this.maxItems = options.maxItems || 10000;
	this.maxMem = (options.maxMem * 1024 * 1024) || 20971520;
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
		console.log("items: " + self.keyCount + "; size: " + (new Number(self.bufferBytes / 1024 / 1024)).toFixed(2) + " MB; max: " + (new Number(self.maxMem / 1024 / 1024)).toFixed(2));
		console.log("\nProcess memory usage\n--------------------");
		proxyUtils.printMemoryUsage();
}

function cleanMemory(obj) {
	while (obj.bufferBytes > obj.maxMem || obj.keyCount > obj.maxItems) {
		// Delete oldest memory item
		obj.del();
	}
}

exports._cleanMemory = cleanMemory;
