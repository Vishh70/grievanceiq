const EventEmitter = require('events');

class RedisMock extends EventEmitter {
  constructor() {
    super();
    this.status = 'ready';
  }
  quit() { return Promise.resolve('OK'); }
  disconnect() { return Promise.resolve('OK'); }
  ping() { return Promise.resolve('PONG'); }
  defineCommand() {}
}

module.exports = RedisMock;
