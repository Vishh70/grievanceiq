class RedisMock {
  constructor() {}
  on() {}
  quit() { return Promise.resolve(); }
  ping() { return Promise.resolve('PONG'); }
}

module.exports = RedisMock;
