var console = require('console');
var util = require('util');

var esiMatch = /<\s*esi:include(?:\s+\w+(?:\s*=\s*(?:(?:"[^"]*")|(?:'[^']*')|[^>\s]+))?)*\s*\/?>/g;
var srcAttrMatch = /(src=["'])(.*?)["']/g;

var html = "<foo><esi:include src='http://www.google.com/'><bar><esi:include src='http://www.google.co.uk/'>";

var esiTags = html.match(esiMatch);
var documentFragments = html.split(esiMatch);

var esiFragments = [];

//console.log(util.inspect(esiTags));
//console.log(util.inspect(documentFragments));

//console.log(util.inspect(esiTags[0].match(srcAttrMatch)));

//process.exit();

// Parse esi tags
for (var i=0, l=esiTags.length; i<l; i++) {
	esiFragments[i] = {};
	esiFragments[i].tag = esiTags[i];
	delete(esiTags[i]);
	// Shame JS regexp doens't support lookbehind
	esiFragments[i].src = esiFragments[i].tag.match(srcAttrMatch)[0].replace(srcAttrMatch, function($0, $1, $2) {
		return $2;
	});
}

delete(esiTags);

// Fetch resources for each object
for (var i=0, l=esiFragments.length; i<l; i++) {
	esiFragments[i].data = fetch(esiFragments[i].src);
}

// Reconstruct document
html = "";
for (var i=0, l=documentFragments.length; i<l; i++) {
	html += documentFragments[i];
	if (typeof(esiFragments[i]) !== 'undefined') {
		html += esiFragments[i].data;
	}
}

console.log(html);

// ----

function fetch(src) {
	return src;
}
