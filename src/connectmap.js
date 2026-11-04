/**
 * --connect-map: dial a different host:port for specific requested targets.
 *
 * The value is a comma-separated list of "requested-host:port=dial-host:port" entries, e.g.
 *   play.titanro.net:6901=login.prod-season.svc.cluster.local:6900
 * roBrowser asks for the addresses the game servers advertise to players; inside a cluster, wsProxy can reach the
 * same servers directly on their Service address and port. The allow-list still checks the requested host:port.
 */

/** Split "host:port" at the last colon (IPv6 hosts in brackets keep theirs). */
function splitHostPort(s) {
	var i = s.lastIndexOf(':');
	if (i <= 0 || i === s.length - 1) {
		return null;
	}
	var port = Number(s.slice(i + 1));
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		return null;
	}
	return { host: s.slice(0, i).replace(/^\[(.*)\]$/, '$1'), port: port };
}

/** Parse the option value into { "requested-host:port": {host, port} }; throws on a malformed entry. */
function parse(value) {
	var map = {};
	String(value || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean).forEach(function(entry) {
		var parts = entry.split('=');
		var from = parts.length === 2 && splitHostPort(parts[0].trim());
		var to = parts.length === 2 && splitHostPort(parts[1].trim());
		if (!from || !to) {
			throw new Error("--connect-map: expected host:port=host:port, got '" + entry + "'");
		}
		map[from.host + ':' + from.port] = to;
	});
	return map;
}

/**
 * Where to dial for a requested "host:port": its --connect-map entry, else --connect-host on the requested port,
 * else the requested target itself.
 */
function resolve(requested, options) {
	options = options || {};
	var target = splitHostPort(requested) || { host: requested, port: NaN };
	var mapped = options.connectMap && options.connectMap[target.host + ':' + target.port];
	if (mapped) {
		return { host: mapped.host, port: mapped.port, via: mapped.host + ':' + mapped.port };
	}
	if (options.connectHost) {
		return { host: options.connectHost, port: target.port, via: options.connectHost };
	}
	return { host: target.host, port: target.port, via: null };
}

module.exports = { parse: parse, resolve: resolve };
