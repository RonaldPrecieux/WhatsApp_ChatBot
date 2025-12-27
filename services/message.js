
"use strict";

module.exports = class Message {
  constructor(rawMessage) {
    this.id = rawMessage.id;

    let type = rawMessage.type;
    if (type === 'interactive') {
      this.type = rawMessage.interactive.button_reply.id;
    } else {
      this.type = 'unknown'
    }

    this.senderPhoneNumber = rawMessage.from;
  }
};
