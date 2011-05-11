var console = require("console");

var testName = "Array memory test";
var testBufferSize = 8192;
var testBufferItems = new Array(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 50, 100, 500, 1000);

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
	console.log("objects stored: " + l + "; size: " + s);
}

function createString(size) {
	var b;
	for (var i=0; i<size; i++) {
		b = b + "0";
	}
	return b;
}

printMemoryUsage();

for (var t=0, l=testBufferItems.length; t<l; t++) {

	// Test array
	var test = [];

	// Run test
	for (var i=0; i<testBufferItems[t]; i++) {
		test[i] = createString(testBufferSize);
	}
	
	// Print results
	printStoredTotals(test);
	printMemoryUsage();
}