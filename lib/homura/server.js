'use strict';

var util = require('util');
var irc = require('../irc');
var Log = require('../util/log');
var Bouncer = require('./bouncer');
var Session = require('./session');

function Server(options) {
    options.session = Session;
    irc.Server.call(this, options);

    this.password = options.password;

    this.bouncers = {};
}

util.inherits(Server, irc.Server);

Server.prototype.tagForLog = function() {
    return 'homura.Server' + '(' + this.host + ':' + this.port + ')';
};

Server.prototype.tryAttach = function(session) {
    var found = this.bouncers[ session.bouncerName ];

    if (found) {
        found.tryAttach( session );
    }
    else {
        if (session.bouncerName === '__NOBOUNCER__') {
            Log.error(this.tagForLog(), "Attach failed. You should specify network name within IRC user like YOURNAME@BOUNCERNAME.");
        }
        else {
            Log.error(this.tagForLog(), "Attach failed. Can not find network named \"" + ( session.bouncerName ) + "\" for \"" + session.prefix + "\"");
        }
        session.disconnect();
    }
};

Server.prototype.addBouncer = function(bouncer) {
    this.bouncers[ bouncer.name ] = bouncer;
};

module.exports = Server;
