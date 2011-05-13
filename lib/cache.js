function MemoryCache(options) {
	if (!options) options = {};
	this.maxItems = options.maxItems || 1000;
	this.index = [];
};
exports.MemoryCache = MemoryCache;

MemoryCache.prototype.get = function(key) {
	if (typeof(this.index[key]) === 'undefined') return false;
	return this.index[key].toString();
};

MemoryCache.prototype.set = function(key, value) {
	this.index[key] = new Buffer(value);
	return;
};
