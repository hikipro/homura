'use strict';

function LogBuffer(options) {
    this.name = options.name;
    this.size = options.size || 30;
    this.usePrivmsg = options.use_privmsg;

    this.buffers = {};
}

LogBuffer.prototype.handleBouncer = function( bouncer ) {
    this.buffers[ bouncer.name ] = {};

    bouncer.on( 'sync', (function(session) {
        Object.keys( this.buffers[ bouncer.name ] ).forEach( (function( target ) {
            if ( this.buffers[ bouncer.name ][ target ] ) {
                this.buffers[ bouncer.name ][ target ].forEach( (function( text ) {
                    if (this.usePrivmsg) {
                        session.send( session.serverName, 'PRIVMSG', [ target, text ] );
                    } else {
                        session.send( session.serverName, 'NOTICE', [ target, text ] );
                    }
                }).bind(this) );
            }
        }).bind(this) );
    }).bind(this) );
};

LogBuffer.prototype.handleIrcClient = function( ircClient, bouncer ) {
    ircClient.on( 'privmsg', (function(message) {
        this.bufferLog(bouncer.name, '<' + message.nick + '> ' + message.params[1], message.params[0]);
    }).bind(this) );
    ircClient.on( 'notice', (function(message) {
        this.bufferLog(bouncer.name, '-' + message.nick + '- ' + message.params[1], message.params[0]);
    }).bind(this) );
};

LogBuffer.prototype.handleUserSession = function( userSession, bouncer ) {
    userSession.on( 'privmsg', (function(message) {
        this.bufferLog(bouncer.name, '<' + userSession.nick + '> ' + message.params[1], message.params[0]);
    }).bind(this) );
    userSession.on( 'notice', (function(message) {
        this.bufferLog(bouncer.name, '-' + userSession.nick + '- ' + message.params[1], message.params[0]);
    }).bind(this) );
};

LogBuffer.prototype.bufferLog = function( bouncerName, text, target ) {
    if (!this.buffers[ bouncerName ][ target ]) {
        this.buffers[ bouncerName ][ target ] = [];
    }
    if (this.buffers[ bouncerName ][ target ].length >= this.size) {
        this.buffers[ bouncerName ][ target ].shift();
    }

    var dateObj = new Date();
    var month = dateObj.getMonth() + 1;
    var date = dateObj.getDate();
    var hours = dateObj.getHours();
    var minutes = dateObj.getMinutes();
    var seconds  = dateObj.getSeconds();

    this.buffers[ bouncerName ][ target ].push(
        [
            ( month   < 10 ? '0' + month    : month   ),
            ( date    < 10 ? '0' + date     : date    )
        ].join('-') +' ' +
        [
            ( hours   < 10 ? '0' + hours    : hours   ),
            ( minutes < 10 ? '0' + minutes  : minutes ),
            ( seconds < 10 ? '0' + seconds  : seconds )
        ].join(':') + ' ' + text
    );
}

module.exports = LogBuffer;

