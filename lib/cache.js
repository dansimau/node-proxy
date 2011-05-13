function MemoryCache(options) {
	this.maxItems = options.maxItems || 1000;
	this.index = [];
};
exports.MemoryCache = MemoryCache;

MemoryCache.prototype.get = function(key) {
	if (typeof(cache[key]) === 'undefined') return false;
	return index[key].toString();
};

MemoryCache.prototype.set = function(key, value) {
	index[key] = new Buffer(value);
	return;
};
