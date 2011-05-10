var console = require("console");

var testName = "Control test";

// Code to test
function test() {
	return;
}

var testIterations = new Array(100, 1000, 10000, 100000, 1000000);

console.log("\n---\nTest: " + testName + "\n---\n");

for (var t=0, l=testIterations.length; t<l; t++) {

	// Start time
	var startTime = (new Date()).getTime();
	
	// Test init
	var testDate = new Date();
	
	// Run test
	for (var i=0; i<testIterations[t]; i++) {
		test();
	}
	
	// End time
	var endTime = (new Date()).getTime();
	var totalTime = (endTime - startTime);
	
	// Print results
	console.log("Iterations: " + testIterations[t] + "; Time: " + totalTime + " ms");
}