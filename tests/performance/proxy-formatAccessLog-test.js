var console = require("console");

var testName = "function formatAccessLogDate()";

// Code to test
function formatAccessLogDate(date) {
	return ("0" + date.getDate()).slice(-2) + "/" +
	       ("0" + (date.getMonth()+1)).slice(-2) + "/" +
	       date.getFullYear() + ":" +
	       ("0" + date.getHours()).slice(-2) + ":" +
	       ("0" + date.getMinutes()).slice(-2) + ":" +
	       ("0" + date.getSeconds()).slice(-2) + " " +
	       "+" + (-date.getTimezoneOffset()/60*1000);
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
		formatAccessLogDate(testDate);
	}
	
	// End time
	var endTime = (new Date()).getTime();
	var totalTime = (endTime - startTime);
	
	// Print results
	console.log("Iterations: " + testIterations[t] + "; Time: " + totalTime + " ms");
}