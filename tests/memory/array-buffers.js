var console = require("console");
var util = require("util");

var testName = "Array buffer memory test";
var testBufferSize = 8192;
var testBufferItems = new Array(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 50, 100, 500, 1000, 500, 100, 100, 100, 100, 100);

console.log("\n---\nTest: " + testName + "\n---\n");

function printMemoryUsage() {
	var m = process.memoryUsage();
	console.log(
		"rss: " + (new Number(m.rss / 1024 / 1024)).toFixed(2) + " MB; " +
		"vsize: " + (new Number(m.vsize / 1024 / 1024)).toFixed(2) + " MB; " +
		"heapTotal: " + (new Number(m.heapTotal / 1024 / 1024)).toFixed(2) + " MB; " +
		"heapUsed: " + (new Number(m.heapUsed / 1024 / 1024)).toFixed(2) + " MB; " +
		"\n");
}

function printStoredTotals(a) {
	var s = 0;
	var l = a.length
	for (var i=0; i<l; i++) {
		s = s + a[i].length;
	}
	console.log("buffer objects stored: " + l + "; size: " + (new Number(s / 1024 / 1024)).toFixed(2) + " MB");
}

function createString(size) {
	var b;
	var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";
	for (var i=0; i<size; i++) {
		var r = Math.floor(Math.random() * chars.length);
		b = b + chars.substring(r,r+1);;
	}
	return b;
}

printMemoryUsage();

for (var t=0, l=testBufferItems.length; t<l; t++) {

	// Test array
	var test = [];

	// Run test
	for (var i=0; i<testBufferItems[t]; i++) {
		test[i] = new Buffer(createString(testBufferSize).toString(), 'utf8');
	}

	// Print results
	printStoredTotals(test);
	printMemoryUsage();
}