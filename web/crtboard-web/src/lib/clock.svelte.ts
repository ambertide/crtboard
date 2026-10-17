/** Wall clock that ticks on every second boundary; flashing and countdowns follow it. */
class Clock {
  now = $state(Date.now());

  constructor() {
    const tick = () => {
      this.now = Date.now();
      setTimeout(tick, 1000 - (this.now % 1000));
    };
    setTimeout(tick, 1000 - (this.now % 1000));
  }
}

export const clock = new Clock();
