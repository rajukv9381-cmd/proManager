export function createSearchScheduler(apply, delay) {
  let lastRun = -Infinity;
  let lastValue = '';
  let timer;

  function run(value) {
    lastRun = performance.now();
    lastValue = value;
    apply(value);
  }

  return {
    schedule(value) {
      clearTimeout(timer);
      if (value === lastValue) return;
      if (performance.now() - lastRun >= delay) {
        run(value);
      } else {
        timer = setTimeout(() => run(value), delay);
      }
    },
    cancel() {
      clearTimeout(timer);
    }
  };
}
