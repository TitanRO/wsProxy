var assert = require('assert');
var net = require('net');
var WebSocket = require('ws');
var pp = require('../src/proxyprotocol');

var SIG = '0d0a0d0a000d0a515549540a';

describe('proxyprotocol.header', function() {
	it('encodes TCP4', function() {
		var h = pp.header('203.0.113.7', 0, '206.189.252.142', 6901);
		assert.strictEqual(h.toString('hex'),
			SIG + '21' + '11' + '000c' + 'cb007107' + 'cebdfc8e' + '0000' + '1af5');
	});

	it('encodes TCP6 (and maps the IPv4 side) when either address is IPv6', function() {
		var h = pp.header('2001:db8::1', 0, '206.189.252.142', 6901);
		assert.strictEqual(h.length, 16 + 36);
		assert.strictEqual(h.slice(12, 16).toString('hex'), '21' + '21' + '0024');
		assert.strictEqual(h.slice(16, 32).toString('hex'), '20010db8000000000000000000000001');
		assert.strictEqual(h.slice(32, 48).toString('hex'), '00000000000000000000ffffcebdfc8e');
		assert.strictEqual(h.slice(50, 52).toString('hex'), '1af5');
	});
});

describe('proxyprotocol.clientAddress', function() {
	function req(xff, peer) {
		return { headers: xff === undefined ? {} : { 'x-forwarded-for': xff }, socket: { remoteAddress: peer } };
	}

	it('takes the last X-Forwarded-For entry (the one Envoy appended)', function() {
		assert.strictEqual(pp.clientAddress(req('6.6.6.6, 203.0.113.7', '10.200.0.12')), '203.0.113.7');
	});

	it('handles IPv6 and IPv4-mapped entries', function() {
		assert.strictEqual(pp.clientAddress(req('2001:db8::1')), '2001:db8::1');
		assert.strictEqual(pp.clientAddress(req('::ffff:203.0.113.7')), '203.0.113.7');
	});

	it('falls back to the socket peer without a usable header', function() {
		assert.strictEqual(pp.clientAddress(req(undefined, '::ffff:10.200.0.12')), '10.200.0.12');
		assert.strictEqual(pp.clientAddress(req('garbage', '10.200.0.12')), '10.200.0.12');
	});
});

describe('wsProxy --proxy-protocol end to end', function() {
	var Server = require('../src/server');
	var backend, received = Buffer.alloc(0), backendPort, wsPort = 15998;

	before(function(done) {
		backend = net.createServer(function(sock) {
			sock.on('data', function(d) { received = Buffer.concat([received, d]); });
		});
		backend.listen(0, '127.0.0.1', function() {
			backendPort = backend.address().port;
			new Server({ port: wsPort, proxyProtocol: true });
			setTimeout(done, 200);
		});
	});

	after(function() { backend.close(); });

	it('sends the PROXY v2 header before any client data, even data sent right away', function(done) {
		var ws = new WebSocket('ws://127.0.0.1:' + wsPort + '/127.0.0.1:' + backendPort,
			{ headers: { 'X-Forwarded-For': '6.6.6.6, 203.0.113.7' } });
		ws.on('open', function() { ws.send(Buffer.from('hello')); });
		setTimeout(function() {
			var expected = Buffer.concat([pp.header('203.0.113.7', 0, '127.0.0.1', backendPort), Buffer.from('hello')]);
			try {
				assert.strictEqual(received.toString('hex'), expected.toString('hex'));
				ws.close();
				done();
			} catch (e) { done(e); }
		}, 500);
	});
});

describe('allow module', function() {
	var allowed = require('../allowed');
	var allow = require('../src/modules/allow');

	afterEach(function() { allowed.length = 0; });

	it('rejects targets not on the list, calling next exactly once', function() {
		allowed.push('play.titanro.net:6901');
		var calls = [];
		allow.verify({ req: { url: '/evil.example.com:25', connection: { remoteAddress: '10.0.0.1' } } },
			function(ok) { calls.push(ok); });
		assert.deepStrictEqual(calls, [false]);
	});

	it('accepts listed targets', function() {
		allowed.push('play.titanro.net:6901');
		var calls = [];
		allow.verify({ req: { url: '/play.titanro.net:6901', connection: { remoteAddress: '10.0.0.1' } } },
			function(ok) { calls.push(ok); });
		assert.deepStrictEqual(calls, [true]);
	});
});
