#!/usr/bin/env node

// Import library
var args    = require('optimist').argv;
var main    = require('./src/main');
var modules = require('./src/modules');
var allowed = require('./allowed');
var connectmap = require('./src/connectmap');


// Arguments
if(args.h || args.help) {
	console.log('Example usage:');
	console.log('wsproxy -p 5999');
	console.log('-p, --port port to run wsProxy on. [Default: 5999]');
	console.log('-a, --allow list of allowed ip:port to proxy to (comma separated) [Default: none] [Example: 127.0.0.1:6900,127.0.0.1:5121,127.0.0.1:6121]');
	console.log('-t, --threads number of \"threads\" to spawn, set it to the number of cpu\'s you have. [Default: 1]');
	console.log('-s, --ssl enable ssl.');
	console.log('-k, --key path to ssl key file. [Default: ./default.key]');
	console.log('-c, --cert path to ssl cert file. [Default: ./default.crt]');
	console.log('--connect-host dial this host instead of the requested one (same port); the allow-list still checks the requested host:port.');
	console.log('--connect-map dial a different host:port for specific requested ones (comma separated requested-host:port=dial-host:port); takes precedence over --connect-host.');
	console.log('--proxy-protocol start each TCP connection with a PROXY v2 header carrying the client address (last X-Forwarded-For entry, else the peer).');
	process.exit(0);
}


// Load modules
modules.load('allow');


// Parse allowed ip:port option into array
// Overrides the default allowed.js file
// TODO: remove this allowed.js file, and write a standard way to handle this allowed_ip option.
// Fill the shared array in place: the allow module holds its own reference to it (reassigning the variable
// here used to leave that list empty, i.e. every target was allowed). Entries are trimmed because values
// passed as one argv token ("-a host:port,...") keep the leading space.
if(args.a || args.allow) {
	var list = String(args.a || args.allow).split(',').map(function(s) { return s.trim(); }).filter(Boolean);
	allowed.length = 0;
	Array.prototype.push.apply(allowed, list);
}


// Init
main({
	port: args.port || args.p || process.env.PORT || 5999,
	workers: args.threads || args.t || 1,
	ssl: args.ssl || args.s || false,
	key: args.key || args.k || "./default.key",
	cert: args.cert || args.c || "./default.crt",
	proxyProtocol: !!(args['proxy-protocol'] || process.env.WSPROXY_PROXY_PROTOCOL === '1'),
	connectHost: (typeof args['connect-host'] === 'string' && args['connect-host'].trim()) || process.env.WSPROXY_CONNECT_HOST || null,
	connectMap: connectmap.parse(typeof args['connect-map'] === 'string' ? args['connect-map'] : process.env.WSPROXY_CONNECT_MAP),
});
