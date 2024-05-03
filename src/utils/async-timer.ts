import { clearTimeout } from "timers";

export class AsyncTimer {
  private timerId: NodeJS.Timeout;
  private isRunning = false;

  constructor() {}

  setInterval(fn: Function, ms: number) {
    this.isRunning = true;
    let loop = () => {
      this.timerId = setTimeout(async () => {
        try {
          await fn();
        } finally {
          if (this.isRunning) {
            loop();
          }
        }
      }, ms);
    };
    loop();
  }

  cancel() {
    this.isRunning = false;
    clearTimeout(this.timerId);
  }
}
