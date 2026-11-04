var assert = require('assert');
var http = require('http');
var path = require('path');
var spawn = require('child_process').spawn;

// Runs index.js as its own process: it forks cluster workers, which inside the mocha process would re-run the tests.
describe('wsProxy', function() {
	this.timeout(5000);

	it('starts from the command line and serves HTTP', function(done) {
		var port = 15992;
		var child = spawn(process.execPath, [path.join(__dirname, '..', 'index.js'), '-p', String(port),
			'-a', 'game.invalid:6901', '--proxy-protocol', '--connect-map', 'game.invalid:6901=127.0.0.1:6900'],
			{ stdio: 'ignore' });
		var finished = false;
		function finish(err) {
			if (finished) { return; }
			finished = true;
			child.kill();
			done(err);
		}
		child.on('exit', function(code) { finish(new Error('wsProxy exited with code ' + code)); });

		setTimeout(function() {
			http.get('http://127.0.0.1:' + port + '/', function(res) {
				var body = '';
				res.on('data', function(d) { body += d; });
				res.on('end', function() {
					try { assert.strictEqual(body, 'wsProxy running...\n'); finish(); } catch (e) { finish(e); }
				});
			}).on('error', finish);
		}, 1000);
	});
});
