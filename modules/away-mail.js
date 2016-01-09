'use strict';

var nodemailer = require('nodemailer');

var transporter = nodemailer.createTransport();

function AwayMail(options) {
    this.name = options.name;
    this.address = options.address;
}

AwayMail.prototype.handleIrcClient = function( ircClient, bouncer ) {
    if (!this.address) {
        return;
    }
    if (!this.address.to) {
        return;
    }

    ircClient.on('privmsg', (function( message ) {
        if (!message.params[1].startsWith(ircClient.nick)) {
            return;
        }
        if (bouncer.isAttached()) {
            return;
        }

        var mailBody =
            '<p>' + message.nick + ' &lt;' + message.user + '@' + message.host + '&gt; user mentioned you at ' + bouncer.name + '/' + message.params[0] + '</p>' +
            '<blockquote style="background-color: #F2D8FF; padding: 10px 10px 10px 12px; margin: 0; border-left: 5px solid #A500FF;">' +
                '&lt;' + message.nick + '&gt; ' + message.params[1] +
            '</blockquote>';

        transporter.sendMail({
            from: this.address.from || "Akemi Homura <akemi@homura.irc>",
            to: this.address.to,
            subject: 'Away mail from homura',
            html: mailBody
        });
    }).bind(this));
};

module.exports = AwayMail;
