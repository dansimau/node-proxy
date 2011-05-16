var console = require('console');

function MemoryCache(options) {
	var self = this;

	if (!options) options = {};
	this.maxItems = options.maxItems || 10000;
	this.maxMem = (options.maxMem * 1024 * 1024) || 20971520;
	this.keys = [];
	this.buffers = {};

	this.keyCount = 0;
	this.bufferBytes = 0;

	setInterval(function() {
		console.log("\nCache memory stats\n------------------");
		console.log("items: " + self.keyCount + "; size: " + (new Number(self.bufferBytes / 1024 / 1024)).toFixed(2) + " MB; max: " + (new Number(self.maxMem / 1024 / 1024)).toFixed(2));
		console.log("\nProcess memory usage\n--------------------");
		printMemoryUsage();
	}, 300000); // 5 mins

	setInterval(function() {
		while (self.bufferBytes > self.maxMem || self.keyCount > self.maxItems) {
			self.del();
		}
	}, 30000);
};
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

	console.log('Deleting key ' + key);

	var oldBufferSize = Buffer.byteLength(this.buffers[key].toString(), 'utf8');

	if (delete this.buffers[key]) {
		this.keyCount = this.keyCount - 1;
		this.bufferBytes = this.bufferBytes - oldBufferSize;
		return key;
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
