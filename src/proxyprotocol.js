/**
 * PROXY protocol v2 (https://www.haproxy.org/download/2.9/doc/proxy-protocol.txt)
 *
 * With --proxy-protocol, wsProxy starts every TCP connection to a game server with a PROXY v2 header carrying
 * the player's address, so the receiver (Envoy Gateway's edge, which requires PROXY on its listeners) sees the
 * real client instead of wsProxy's pod.
 *
 * The client address is the LAST X-Forwarded-For entry: Envoy appends the address it got from the load
 * balancer's PROXY header, and a client can only add entries in front of it. This is only trustworthy when
 * every request reaches wsProxy through that HTTP listener (no raw TCP route to wsProxy).
 */
var net = require('net');

var SIGNATURE = Buffer.from([0x0D, 0x0A, 0x0D, 0x0A, 0x00, 0x0D, 0x0A, 0x51, 0x55, 0x49, 0x54, 0x0A]);
var CMD_PROXY = 0x21; // version 2, PROXY
var TCP4 = 0x11;
var TCP6 = 0x21;

/**
 * Normalize an address string: trims, drops [brackets] and an IPv4 ":port", unwraps IPv4-mapped IPv6.
 * Returns null unless the result is a valid IP.
 */
function normalize(address) {
	if (!address) {
		return null;
	}
	var ip = String(address).trim();
	if (ip.charAt(0) === '[') {
		ip = ip.slice(1, ip.indexOf(']'));
	}
	if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) {
		ip = ip.split(':')[0];
	}
	var mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
	if (mapped) {
		ip = mapped[1];
	}
	return net.isIP(ip) ? ip : null;
}

/**
 * The player's address for an upgrade request: last X-Forwarded-For entry, else the socket peer.
 */
function clientAddress(req) {
	var xff = req.headers && req.headers['x-forwarded-for'];
	if (xff) {
		var parts = String(xff).split(',');
		var last = normalize(parts[parts.length - 1]);
		if (last) {
			return last;
		}
	}
	return normalize(req.socket && req.socket.remoteAddress);
}

function ipv4Bytes(ip) {
	return Buffer.from(ip.split('.').map(Number));
}

function ipv6Bytes(ip) {
	if (net.isIPv4(ip)) {
		ip = '::ffff:' + ip;
	}
	// Turn an embedded IPv4 tail (::ffff:1.2.3.4) into two hex groups.
	var tail = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
	if (tail) {
		var b = ipv4Bytes(tail[2]);
		ip = tail[1] + ((b[0] << 8) | b[1]).toString(16) + ':' + ((b[2] << 8) | b[3]).toString(16);
	}
	var halves = ip.split('::');
	var head = halves[0] ? halves[0].split(':') : [];
	var rest = halves.length > 1 && halves[1] ? halves[1].split(':') : [];
	var groups = head.concat(new Array(8 - head.length - rest.length).fill('0'), rest);
	var out = Buffer.alloc(16);
	for (var i = 0; i < 8; i++) {
		out.writeUInt16BE(parseInt(groups[i], 16), i * 2);
	}
	return out;
}

/**
 * Build a PROXY v2 header. Both addresses are sent as IPv6 when either one is IPv6.
 */
function header(srcIp, srcPort, dstIp, dstPort) {
	var v4 = net.isIPv4(srcIp) && net.isIPv4(dstIp);
	var addr = v4
		? Buffer.concat([ipv4Bytes(srcIp), ipv4Bytes(dstIp), Buffer.alloc(4)])
		: Buffer.concat([ipv6Bytes(srcIp), ipv6Bytes(dstIp), Buffer.alloc(4)]);
	addr.writeUInt16BE(srcPort || 0, addr.length - 4);
	addr.writeUInt16BE(dstPort || 0, addr.length - 2);
	var fixed = Buffer.alloc(4);
	fixed[0] = CMD_PROXY;
	fixed[1] = v4 ? TCP4 : TCP6;
	fixed.writeUInt16BE(addr.length, 2);
	return Buffer.concat([SIGNATURE, fixed, addr]);
}

module.exports = {
	normalize: normalize,
	clientAddress: clientAddress,
	header: header
};
