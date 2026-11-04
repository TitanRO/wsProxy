var assert = require('assert');
var net = require('net');
var WebSocket = require('ws');
var cm = require('../src/connectmap');
var pp = require('../src/proxyprotocol');

describe('connectmap.parse', function() {
	it('parses comma-separated requested=target entries', function() {
		assert.deepStrictEqual(cm.parse(' play.titanro.net:6901=login.ns.svc:6900, play.titanro.net:5122=map:5121 '), {
			'play.titanro.net:6901': { host: 'login.ns.svc', port: 6900 },
			'play.titanro.net:5122': { host: 'map', port: 5121 },
		});
	});

	it('is empty without a value', function() {
		assert.deepStrictEqual(cm.parse(undefined), {});
		assert.deepStrictEqual(cm.parse(''), {});
	});

	it('rejects malformed entries', function() {
		['play.titanro.net:6901', 'a:1=b', 'a=b:1', 'a:1=b:99999', 'a:1=b:2=c:3'].forEach(function(bad) {
			assert.throws(function() { cm.parse(bad); }, /--connect-map/);
		});
	});
});

describe('connectmap.resolve', function() {
	var map = cm.parse('play.titanro.net:6901=login:6900');

	it('uses the map entry for a mapped target, even with --connect-host', function() {
		assert.deepStrictEqual(cm.resolve('play.titanro.net:6901', { connectMap: map, connectHost: 'edge' }),
			{ host: 'login', port: 6900, via: 'login:6900' });
	});

	it('falls back to --connect-host on the requested port', function() {
		assert.deepStrictEqual(cm.resolve('play.titanro.net:6122', { connectMap: map, connectHost: 'edge' }),
			{ host: 'edge', port: 6122, via: 'edge' });
	});

	it('dials the requested target otherwise', function() {
		assert.deepStrictEqual(cm.resolve('play.titanro.net:6122', { connectMap: map }),
			{ host: 'play.titanro.net', port: 6122, via: null });
	});
});

describe('wsProxy --connect-map end to end', function() {
	var Server = require('../src/server');
	var backend, received = Buffer.alloc(0), backendPort, wsPort = 15994;

	before(function(done) {
		backend = net.createServer(function(sock) {
			sock.on('data', function(d) { received = Buffer.concat([received, d]); });
		});
		backend.listen(0, '127.0.0.1', function() {
			backendPort = backend.address().port;
			new Server({ port: wsPort, proxyProtocol: true, connectHost: 'edge.invalid',
				connectMap: cm.parse('game.invalid:6901=127.0.0.1:' + backendPort) });
			setTimeout(done, 200);
		});
	});

	after(function() { backend.close(); });

	it('dials the mapped host:port and sends the PROXY header for it', function(done) {
		var ws = new WebSocket('ws://127.0.0.1:' + wsPort + '/game.invalid:6901',
			{ headers: { 'X-Forwarded-For': '203.0.113.7' } });
		ws.on('open', function() { ws.send(Buffer.from('hi')); });
		setTimeout(function() {
			var expected = Buffer.concat([pp.header('203.0.113.7', 0, '127.0.0.1', backendPort), Buffer.from('hi')]);
			try {
				assert.strictEqual(received.toString('hex'), expected.toString('hex'));
				ws.close();
				done();
			} catch (e) { done(e); }
		}, 500);
	});
});
