var console = require('console');

exports.timestamp = function(date) {
	if (typeof(date) !== 'Date') date = new Date();
	return Math.round(date.getTime() / 1000);
}

exports.copyObj = function(obj) {
	var clone = (obj instanceof Array) ? [] : {};
	for (var i in obj) {
		if (typeof(obj[i]) === 'object')
			clone[i] = this.copyObj(obj[i]);
		else
			clone[i] = obj[i];
	}
	return clone;
}

exports.printMemoryUsage = function() {
	var m = process.memoryUsage();
	console.log(
		"rss: " + (new Number(m.rss / 1024 / 1024)).toFixed(2) + " MB; " +
		"vsize: " + (new Number(m.vsize / 1024 / 1024)).toFixed(2) + " MB; " +
		"heapTotal: " + (new Number(m.heapTotal / 1024 / 1024)).toFixed(2) + " MB; " +
		"heapUsed: " + (new Number(m.heapUsed / 1024 / 1024)).toFixed(2) + " MB; " +
		"\n");
}
