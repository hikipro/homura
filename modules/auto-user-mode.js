'use strict';

function AutoUserMode(options) {
    this.name = options.name;
    this.mode = options.mode;
}

AutoUserMode.prototype.handleIrcClient = function(ircClient, bouncer) {
    if ( this.mode[ bouncer.name ] ) {
        var mode = this.mode[bouncer.name];

        ircClient.on( 'register', (function() {
            ircClient.send( 'MODE', [
                ircClient.nick,
                mode
            ]);
        }).bind(this));
    }
};

module.exports = AutoUserMode;
