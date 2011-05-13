function MemoryCache(options) {
	self = this;
	if (!options) options = {};
	this.maxItems = options.maxItems || 1000;
	this.index = [];
};
exports.MemoryCache = MemoryCache;

MemoryCache.prototype.get = function(key) {
	if (typeof(self.index[key]) === 'undefined') return false;
	return self.index[key].toString();
};

MemoryCache.prototype.set = function(key, value) {
	self.index[key] = new Buffer(value);
	return;
};
