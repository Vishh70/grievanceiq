const EventEmitter = require('events');
const registeredWorkers = {};

class Queue {
  constructor(name) {
    console.log('[MockBullMQ] Queue created:', name);
    this.name = name;
  }
  async add(jobName, data) {
    console.log(`[MockBullMQ] Queue ${this.name} added job: ${jobName}`);
    if (registeredWorkers[this.name]) {
      // Execute immediately asynchronously
      Promise.resolve().then(() => {
        registeredWorkers[this.name]({ data });
      }).catch(err => console.error('[MockBullMQ] Worker failed:', err));
    } else {
      console.log(`[MockBullMQ] NO WORKER REGISTERED FOR QUEUE: ${this.name}`);
    }
    return { id: 'mock-job-id', data };
  }
  on() {}
  async close() {
    return true;
  }
}

class Worker extends EventEmitter {
  constructor(name, processor) {
    super();
    console.log('[MockBullMQ] Worker created:', name);
    this.name = name;
    this.processor = processor;
    registeredWorkers[name] = processor;
  }
  async close() {
    return true;
  }
}

module.exports = {
  Queue,
  Worker
};
