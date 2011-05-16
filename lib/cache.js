var console = require("console");
var util = require("util")

function MemoryCache(options) {
	var self = this;

	if (!options) options = {};
	this.maxItems = options.maxItems || 5;
	this.keys = [];
	this.buffers = {};

	this.keyCount = 0;
	this.bufferBytes = 0;

	setInterval(function() {
		console.log("\nCache memory stats\n------------------");
		console.log("items: " + self.keyCount + "; size: " + (new Number(self.bufferBytes / 1024 / 1024)).toFixed(2) + " MB");
		console.log("\nProcess memory usage\n--------------------");
		printMemoryUsage();
	}, 300000); // 5 mins
};
exports.MemoryCache = MemoryCache;

MemoryCache.prototype.get = function(key) {
	if (typeof(this.buffers[key]) === 'undefined') return false;
	return this.buffers[key].toString();
};

MemoryCache.prototype.set = function(key, value) {

	if (this.keyCount >= this.maxItems) {
		//this.del(this.keys.shift());
		var evictedKey = this.keys.shift();
		this.del(evictedKey);
		console.log("Cache debug: Evicted key " + evictedKey);
	}

	if (this.get(key) !== false) {
		this.del(this.keys.shift());
	}

	this.buffers[key] = new Buffer(value);
	this.keys.push(key);

	this.keyCount = this.keyCount + 1;
	this.bufferBytes = this.bufferBytes + Buffer.byteLength(this.buffers[key].toString(), 'utf8');
	return;
};

MemoryCache.prototype.del = function(key) {
	if (typeof(this.buffers[key]) === 'undefined') return false;

	var oldBufferSize = Buffer.byteLength(this.buffers[key].toString(), 'utf8');

	if (delete this.buffers[key]) {
		this.keyCount = this.keyCount - 1;
		this.bufferBytes = this.bufferBytes - oldBufferSize;
		return true;
	} else {
		return false;
	}
};

function printMemoryUsage() {
	var m = process.memoryUsage();
	console.log(
		"rss: " + (new Number(m.rss / 1024 / 1024)).toFixed(2) + " MB; " +
		"vsize: " + (new Number(m.vsize / 1024 / 1024)).toFixed(2) + " MB; " +
		"heapTotal: " + (new Number(m.heapTotal / 1024 / 1024)).toFixed(2) + " MB; " +
		"heapUsed: " + (new Number(m.heapUsed / 1024 / 1024)).toFixed(2) + " MB; " +
		"\n");
}
