'use strict';

var net = require('net');
var tls = require('tls');
var fs = require('fs');
var util = require('util');
var events = require('events');

var Log = require('../util/log');
var Message = require('./message');
var Isupport = require('./isupport');
var Channel = require('./channel');
var Topic = require('./topic');
var User = require('./user');
var ModeParser = require('./mode_parser');

function Client(options) {
    this.host     = options.host;
    this.port     = options.port;
    this.nick     = options.nick;
    this.user     = options.user || options.nick;
    this.real     = options.real || options.nick;
    this.password = options.password;
    this.tls      = options.tls;

    this.mode     = {};
    this.isupport = new Isupport();
    this.channels = {};
    this.away     = false;

    this.encoding = options.encoding;

    events.EventEmitter.call(this);

    this.on('error', function() { });
}

util.inherits(Client, events.EventEmitter);

Client.prototype.tagForLog = function() {
    return 'irc.Client' + '(' + this.nick + '!' + this.user + '@' + this.host + ')';
};

Client.prototype.connect = function() {
    Log.info(this.tagForLog(), 'Starting connection');

    function onConnect() {
        Log.info(this.tagForLog(), 'Connection is established');
        if (this.password) {
            this.send('PASS', [ this.password ]);
        }
        this.send('NICK', [ this.nick ]);
        this.send('USER', [ this.user, '0', '*', this.real ]);
        this.emit('connect');
    }

    Log.debug(this.tagForLog(), "Start connecting");
    if (this.tls) {
        ['pfx', 'ca', 'key', 'cert'].forEach( (function(keybase) {
            var key = keybase + '_file';
            if ( this.tls[ key ]) {
                this.tls[ keybase ] = fs.readFileSync( this.tls[ key ] );
                delete this.tls[ key ];
            }
        }).bind(this) );

        var selfSigned = this.tls.selfSigned;
        var acceptInvalidCert = this.tls.acceptInvalidCert;

        delete this.tls.selfSigned;
        delete this.tls.acceptInvalidCert;

        this.connection = tls.connect(
            this.port,
            this.host,
            this.tls,
            (function() {
                if ( 
                    this.connection.authorized ||
                    ( selfSigned && this.connection.authorizationError === 'DEPTH_ZERO_SELF_SIGNED_CERT' ) ||
                    acceptInvalidCert
                ) {
                    Log.info(this.tagForLog(), 'TLS onnection has been authorized');
                    onConnect.call(this);
                }
                else {
                    Log.info(this.tagForLog(), 'TLS onnection has been authorized');
                    this.connection.end();
                }
            }).bind(this)
        );
    }
    else {
        this.connection = net.connect(
            this.port,
            this.host,
            (function() {
                onConnect.call(this);
            }).bind(this)
        );
    }

    this.connection.setTimeout(5 * 60 * 1000, (function() { // 30 second
        Log.info(this.tagForLog(), "Connection timed out");
        this.connection.destroy();
    }).bind(this)); 

    var buffer = '';
    this.connection.on('data', (function(data) {
        buffer += data;
        var lines = buffer.split("\r\n");
        buffer = lines.pop();

        lines.forEach( (function(line) {
            this.onRaw( line );
        }).bind(this) );
    }).bind(this));
    this.connection.on('end', (function() {
        Log.debug(this.tagForLog(), "Connection end");
    }).bind(this));
    this.connection.on('close', (function(isError) {
        Log.info(this.tagForLog(), "Connection closed");
        if (!isError) {
            this.emit('close');
        }
    }).bind(this));
    this.connection.on('error', (function(error) {
        Log.debug(this.tagForLog(), "Network error: " + error);
        this.emit('close');
    }).bind(this));
};

Client.prototype.send = function(command, params) {
    var message = new Message( null, command, params );
    Log.debug(this.tagForLog(), "Sending message: " + message.toRaw());
    this.connection.write( message.toRaw(this.encoding) );
    this.emit('sendMessage', message);
};

Client.prototype.onRaw = function(raw) {
    var message = Message.parse( raw, this.encoding );

    Log.debug(this.tagForLog(), 'Received message: ' + message.toRaw());
    var meth = 'on_' + message.command.toLowerCase();
    meth = meth.replace(/_./g, function($0) {
        return $0[1].toUpperCase();
    });
    if ( this[ meth ] ) {
        this[ meth ].call(this, message);                // default overridable handler for specific command
    }
    this.onMessage(message);                             // overridable handler to capture all message

    this.emit( message.command.toLowerCase(), message ); // event for specifc command message
};

Client.prototype.onMessage = function(message) {
    // should be overridden to capture all message
}

Client.prototype.onError = function(message) {
};

Client.prototype.onPing = function(message) {
    this.send( 'PONG', [ message.params[0] ] );
};

Client.prototype.on005 = function(message) {
    this.isupport.update( message.params.slice(1, -2) );
};

// for away handling

Client.prototype.on305 = function(message) {
    this.away = false;
}

Client.prototype.on306 = function(message) {
    this.away = true;
}

// for channel handling

Client.prototype.findOrCreateChannel = function(channelName) {
    if (!this.channels[channelName]) {
        this.channels[channelName] = new Channel(channelName);
    }
    return this.channels[channelName];
};

Client.prototype.findOrCreateUser = function(channel, nick) {
    if (!channel.users[nick]) {
        channel.users[nick] = new User(nick);
    }
    return channel.users[nick];
}

Client.prototype.findOrCreateTopic = function(channel) {
    if (!channel.topic) {
        channel.topic = new Topic({});
    }
    return channel.topic;
}

Client.prototype.on001 = function(message) {
    this.nick = message.params[0];
    this.emit('register');
}

Client.prototype.on353 = function(message) {
    var type = message.params[1];
    var channelName = message.params[2];
    var users = message.params[3] || '';

    var channel = this.findOrCreateChannel( channelName );

    switch(type) {
        case '@':
            channel.mode['s'] = true;
            break;
        case '*':
            channel.mode['p'] = true;
            break;
        case '=':
            // public
            break;
        default:
            // nop
    }

    var prefixes = '';
    var prefixToMode = {};
    for ( var mode in this.isupport.config.PREFIX ) {
        var prefix = this.isupport.config.PREFIX[ mode ];
        prefixToMode[ prefix ] = mode;
        prefixes += prefix;
    }
    users.split(' ').forEach((function(user) {
        var m = user.match( '^([' + prefixes + ']*)(.*)' );
        var nick  = m[2];
        var u = this.findOrCreateUser(channel, nick);
        channel.users[nick] = u;
        m[1].split('').forEach( function(c) {
            u.mode[prefixToMode[c]] = true;
        } );
    }).bind(this));
};

Client.prototype.onPart = function(message) {
    var nick = message.nick;
    var channelName = message.params[0];

    var channel = this.findOrCreateChannel(channelName);
    delete channel.users[nick];
};

Client.prototype.onQuit = function(message) {
    var nick = message.nick;

    Object.keys(this.channels).forEach((function(channelName) {
        var channel = this.findOrCreateChannel(channelName);
        delete channel.users[nick];
    }).bind(this));
};

Client.prototype.onKick = function(message) {
    message.params[0].split(/,/).forEach( (function(channelName) {
        var channel = this.findOrCreateChannel(channelName);
        message.params[1].split(/,/).forEach( function(nick) {
            delete channel.users[nick];
        });
    }).bind(this));
};

Client.prototype.onNick = function(message) {
    var oldNick = message.nick;
    var newNick = message.params[0];

    if (oldNick === this.nick) {
        this.nick = newNick;
    }

    Object.keys(this.channels).forEach((function(channelName) {
        var channel = this.channels[ channelName ];
        var user = channel.users[oldNick];

        if (user) {
            delete channel.users[oldNick];

            user.nick = newNick;
            channel.users[newNick] = user;
        }
    }).bind(this));
};

Client.prototype.onMode = function(message) {
    var target = message.params[0];

    if ( target.match( '[' + this.isupport.config.CHANTYPES + ']' ) ) {
        var addAndRemove = [].concat(
            this.isupport.config.CHANMODES[0],
            this.isupport.config.CHANMODES[1],
            Object.keys(this.isupport.config.PREFIX)
        );

        var paramModes = {
            add    : addAndRemove.concat( this.isupport.config.CHANTYPES[2] ),
            remove : addAndRemove
        };

        var modes = ModeParser.parse(message.params[1], message.params.slice(2), paramModes);

        var channel = this.findOrCreateChannel(target);
        modes.forEach( (function(e) {
            var direction = e[0];
            var mode      = e[1];
            var param     = e[2];

            if (Object.keys(this.isupport.config.PREFIX).indexOf( mode ) !== -1) {
                var user = this.findOrCreateUser(channel, param);

                if (direction === 'add') {
                    user.mode[ mode ] = true;
                }
                else {
                    delete user.mode[ mode ];
                }
            }
            else {
                if (direction === 'add') {
                    channel.mode[ mode ] = param === null ? param : true;
                }
                else {
                    delete channel.mode[ mode ];
                }
            }
        }).bind(this));
    }
    else {
        var modes = ModeParser.parse(message.params[1], message.params.slice(2));

        modes.forEach( (function(e) {
            var direction = e[0];
            var mode      = e[1];

            if (direction === 'add') {
                this.mode[ mode ] = true;
            }
            else {
                delete this.mode[ mode ];
            }
        }).bind(this) );
    }
};

Client.prototype.onJoin = function(message) {
    var nick = message.nick;
    var channelName = message.params[0];

    var channel = this.findOrCreateChannel(channelName);
    var user = this.findOrCreateUser(channel, nick);
    channel.users[nick] = user;
};

Client.prototype.onTopic = function(message) {
    var nick = message.nick;
    var channelName = message.params[0];
    var content = message.params[1];

    var channel = this.findOrCreateChannel(channelName);
    if (content) {
        channel.topic = new Topic({
            content : content,
            who     : message.prefix,
            time    : String(new Date().getTime()),
        });
    }
}

Client.prototype.on331 = function(message) {
    var nick = message.nick;
    var channelName = message.params[0];
    var content = message.params[1];

    var channel = this.findOrCreateChannel(channelName);
    channel.topic = undefined;
}

Client.prototype.on332 = function(message) {
    var nick = message.nick;
    var channelName = message.params[1];
    var content = message.params[2];

    var channel = this.findOrCreateChannel(channelName);
    channel.topic = this.findOrCreateTopic(channel);
    channel.topic.content = content;
}

Client.prototype.on333 = function(message) {
    var nick = message.nick;
    var channelName = message.params[1];
    var who = message.params[2];
    var time = message.params[3];

    var channel = this.findOrCreateChannel(channelName);
    channel.topic = this.findOrCreateTopic(channel);
    channel.topic.who = who;
    channel.topic.time = time;
}

module.exports = Client;
