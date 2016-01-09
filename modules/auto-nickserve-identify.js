'use strict';

function AutoNickServeIdentify(options) {
    this.name = options.name;
    this.accounts = options.accounts;
}

AutoNickServeIdentify.prototype.handleIrcClient = function(ircClient, bouncer) {
    if ( this.accounts[ bouncer.name ] ) {
        var account = this.accounts[ bouncer.name ];

        var nickserv = account.nickserv || "NickServ";
        var nick = account.nick || ircClient.nick;
        var password = account.password;

        if (!password) {
			return;
		}

        ircClient.on('register', (function () {
            ircClient.send( 'PRIVMSG', [
                nickserv,
                'IDENTIFY ' + (nick ? nick + " " : "") + password
            ]);
        }).bind(this));
    }
};

module.exports = AutoNickServeIdentify;
