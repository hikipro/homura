'use strict';

var iconv = require('iconv-lite');

// TODO マッチングをまじめにする

function Message(prefix, command, params) {
    this.prefix = prefix || null;
    this.command = command || null;
    this.params = params || []; // Array

    this.parseUser();
    this.parseServer();
}

Message.parse = function(raw, encoding) {
    if (encoding) {
        try {
            raw = iconv.decode(new Buffer(raw), encoding);
        }
        catch (e) {
            // When the iconv failed to convert charcterset, the raw message will be sent directly.
        }
    }

    var m;

    m = raw.match(/^(?::([^ ]+)[ ]+)?([^ ]+)(.*)/);
    var prefix = m[1];
    var command = m[2];

    var rawParams = m[3];
    m = rawParams.trim().match(/^(.*?)(?:^|\s+):(.*)$/);
    var middle = (m ? m[1] : rawParams).trim();
    var trailing = m ? m[2] : null;
    var params = middle === '' ? [] : middle.split(' ');
    if (trailing) {
        params.push(trailing);
    }

    return new Message( prefix, command, params );
}

Message.prototype.toRaw = function(encoding) {
    var result = '';

    if (this.prefix) {
        result += ':' + this.prefix + ' ';
    }

    result += this.command;

    var params = this.params.concat();
    var trailing = params[ params.length - 1];
    if (
           typeof(trailing) !== 'undefined' 
        && (trailing.match(/\s/) || trailing === '' || this.command === 'PRIVMSG' || this.command === 'NOTICE')
    ) {
        params[ params.length - 1]  = ':' + trailing;
    }

    if (params.length > 0) {
        result += ' ' + params.join(' ');
    }
    result += "\r\n";

    if (encoding) {
        try {
            var iconv = new Iconv('UTF-8', encoding);
            result = iconv.convert(result).toString();
        }
        catch(e) {
            // When the iconv failed to convert charcterset, the raw message will be sent directly.
        }
    }

    return result;
};

Message.prototype.parseUser = function() {
    if (!this.prefix) { return; }

    var m;
    m = this.prefix.match(/^(\S+?)(?:!|$)/);
    if (m) { this.nick = m[1]; }
    m = this.prefix.match(/!(\S+?)(?:@|$)/);
    if (m) { this.user = m[1]; }
    m = this.prefix.match(/@(\S+)$/);
    if (m) { this.host = m[1]; }
};

Message.prototype.parseServer = function() {
    if (!this.prefix) { return; }

    if (/[!@]/.test(this.prefix)) { return; }
    this.server = this.prefix;
};

module.exports = Message;
