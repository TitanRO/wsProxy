/**
 * Dependencies
 */
var net     = require('net');
var mes     = require('./message');
var proxyprotocol = require('./proxyprotocol');

/**
 * Constructor
 */
var Proxy = function Constructor(ws, options) {
	options = options || {};
	this._tcp;
	this._from = ws.upgradeReq.connection.remoteAddress;
	this._to   = ws.upgradeReq.url.substr(1);
	this._ws   = ws;

	// --proxy-protocol: send a PROXY v2 header with the player's address first; hold client data until it's out.
	this._proxyProtocol = !!options.proxyProtocol;
	this._client  = this._proxyProtocol ? proxyprotocol.clientAddress(ws.upgradeReq) : null;
	this._ready   = !this._proxyProtocol;
	this._pending = [];

	// Bind data
	this._ws.on('message', this.clientData.bind(this) );
	this._ws.on('close', this.close.bind(this) );
	this._ws.on('error', this.close.bind(this) );

	// Initialize proxy
	var args = this._to.split(':');

	// Connect to server (--connect-host: dial that host instead, on the requested port; the allow-list still
	// checks the requested host:port)
	var host = options.connectHost || args[0];
	mes.info("Requested connection from '%s'%s to '%s'%s [ACCEPTED].", this._from,
		this._client ? " (client " + this._client + ")" : "", this._to,
		options.connectHost ? " via " + options.connectHost : "");
	this._tcp = net.connect( args[1], host );

	// Disable nagle algorithm
	this._tcp.setTimeout(0)
	this._tcp.setNoDelay(true)

	this._tcp.on('data', this.serverData.bind(this) );
	this._tcp.on('close', this.close.bind(this) );
	this._tcp.on('error', function(error) {
		console.log(error);
	});
	
	this._tcp.on('connect', this.connectAccept.bind(this) );
}


/**
 * OnClientData
 * Client -> Server
 */
Proxy.prototype.clientData = function OnServerData(data) {
	if (!this._tcp) {
		// wth ? Not initialized yet ?
		return;
	}

	if (!this._ready) {
		this._pending.push(data);
		return;
	}

	try {
		this._tcp.write(data);
	}
	catch(e) {

	}
}


/**
 * OnServerData
 * Server -> Client
 */
Proxy.prototype.serverData = function OnClientData(data) {
	this._ws.send(data, function(error){
		/*
		if (error !== null) {
			OnClose();
		}
		*/
	});
}


/**
 * OnClose
 * Clean up events/sockets
 */
Proxy.prototype.close = function OnClose() {
	if (this._tcp) {
		mes.info("Connection closed from '%s'.", this._to);

		this._tcp.removeListener('close', this.close.bind(this) );
		this._tcp.removeListener('error', this.close.bind(this) );
		this._tcp.removeListener('data',  this.serverData.bind(this) );
		this._tcp.end();
	}

	if (this._ws) {
		mes.info("Connection closed from '%s'.", this._from);

		this._ws.removeListener('close',   this.close.bind(this) );
		this._ws.removeListener('error',   this.close.bind(this) );
		this._ws.removeListener('message', this.clientData.bind(this) );
		this._ws.close();
	}
}


/**
 * On server accepts connection
 */
Proxy.prototype.connectAccept = function OnConnectAccept() {
	mes.status("Connection accepted from '%s'.", this._to);

	if (this._proxyProtocol) {
		var src = this._client || proxyprotocol.normalize(this._tcp.localAddress);
		var dst = proxyprotocol.normalize(this._tcp.remoteAddress);
		try {
			this._tcp.write(proxyprotocol.header(src, 0, dst, this._tcp.remotePort));
			while (this._pending.length) {
				this._tcp.write(this._pending.shift());
			}
		}
		catch(e) {
			console.log(e);
		}
		this._ready = true;
	}
}

/**
 * Exports
 */
module.exports = Proxy;
