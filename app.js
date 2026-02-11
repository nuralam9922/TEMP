const LED_COUNT = 12;
const HIGH = 1;
const LOW = 0;
const OUTPUT = 'OUTPUT';
const INPUT = 'INPUT';

const codeEditor = document.getElementById('codeEditor');
const consoleEl = document.getElementById('console');
const ledStripEl = document.getElementById('ledStrip');
const runBtn = document.getElementById('runBtn');
const stopBtn = document.getElementById('stopBtn');
const resetBtn = document.getElementById('resetBtn');
const loopSafetyEl = document.getElementById('loopSafety');

const leds = [];
const pinModes = new Map();
const pinValues = new Map();
let runningToken = 0;
let startTime = Date.now();

function log(message) {
  consoleEl.textContent += `${message}\n`;
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function clearLog() {
  consoleEl.textContent = '';
}

function clampPin(pin) {
  const n = Number(pin);
  if (!Number.isInteger(n) || n < 0 || n >= LED_COUNT) {
    throw new Error(`Invalid pin ${pin}. Use 0-${LED_COUNT - 1}.`);
  }
  return n;
}

function renderPin(pin) {
  const value = pinValues.get(pin) ?? 0;
  const brightness = Math.max(0, Math.min(255, value));
  const alpha = brightness / 255;
  leds[pin].style.background = `rgba(255, 35, 35, ${Math.max(0.08, alpha)})`;
  leds[pin].style.boxShadow = `0 0 ${6 + alpha * 16}px rgba(255, 55, 55, ${Math.max(0.1, alpha)})`;
}

function renderAll() {
  for (let i = 0; i < LED_COUNT; i += 1) {
    renderPin(i);
  }
}

function createLeds() {
  for (let i = 0; i < LED_COUNT; i += 1) {
    const led = document.createElement('div');
    led.className = 'led';
    led.title = `Pin ${i}`;
    leds.push(led);
    ledStripEl.appendChild(led);
    pinModes.set(i, OUTPUT);
    pinValues.set(i, 0);
  }
  renderAll();
}

function normalizeForJavaScript(source) {
  return source
    .replace(/\bvoid\s+setup\s*\(\s*\)/g, 'async function setup()')
    .replace(/\bvoid\s+loop\s*\(\s*\)/g, 'async function loop()')
    .replace(/\b(?:int|float|double|long|short|byte|bool|String)\s+/g, 'let ')
    .replace(/\btrue\b/g, 'true')
    .replace(/\bfalse\b/g, 'false');
}

function buildRuntime() {
  return {
    HIGH,
    LOW,
    OUTPUT,
    INPUT,
    pinMode(pin, mode) {
      const p = clampPin(pin);
      pinModes.set(p, mode);
    },
    digitalWrite(pin, value) {
      const p = clampPin(pin);
      if (pinModes.get(p) !== OUTPUT) {
        throw new Error(`Pin ${p} is not OUTPUT.`);
      }
      const normalized = value === HIGH ? 255 : 0;
      pinValues.set(p, normalized);
      renderPin(p);
    },
    analogWrite(pin, value) {
      const p = clampPin(pin);
      const normalized = Math.max(0, Math.min(255, Number(value)));
      pinValues.set(p, normalized);
      renderPin(p);
    },
    toggle(pin) {
      const p = clampPin(pin);
      const current = pinValues.get(p) ?? 0;
      pinValues.set(p, current > 0 ? 0 : 255);
      renderPin(p);
    },
    setAll(value) {
      const normalized = value === HIGH ? 255 : value === LOW ? 0 : Math.max(0, Math.min(255, Number(value)));
      for (let i = 0; i < LED_COUNT; i += 1) {
        pinValues.set(i, normalized);
      }
      renderAll();
    },
    shiftLeft() {
      for (let i = 0; i < LED_COUNT - 1; i += 1) {
        pinValues.set(i, pinValues.get(i + 1) ?? 0);
      }
      pinValues.set(LED_COUNT - 1, 0);
      renderAll();
    },
    shiftRight() {
      for (let i = LED_COUNT - 1; i > 0; i -= 1) {
        pinValues.set(i, pinValues.get(i - 1) ?? 0);
      }
      pinValues.set(0, 0);
      renderAll();
    },
    delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
    },
    millis() {
      return Date.now() - startTime;
    },
    random(min, max) {
      if (typeof max === 'undefined') {
        return Math.floor(Math.random() * Number(min));
      }
      const low = Number(min);
      const high = Number(max);
      return Math.floor(Math.random() * (high - low) + low);
    },
    print(value) {
      log(String(value));
    },
  };
}

async function compileUserCode(code, runtime) {
  const transformed = normalizeForJavaScript(code);
  const argNames = Object.keys(runtime);
  const argValues = Object.values(runtime);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const factory = new AsyncFunction(
    ...argNames,
    `${transformed}\nif (typeof setup !== 'function' || typeof loop !== 'function') { throw new Error('Define setup() and loop().'); }\nreturn { setup, loop };`
  );
  return factory(...argValues);
}

async function runProgram() {
  const token = ++runningToken;
  clearLog();
  startTime = Date.now();
  log('Compiling sketch...');

  try {
    const runtime = buildRuntime();
    const sketch = await compileUserCode(codeEditor.value, runtime);
    log('Running setup()...');
    await sketch.setup();
    log('Entering loop()... (press Stop to halt)');

    while (token === runningToken) {
      await sketch.loop();
      const safetyDelay = Number(loopSafetyEl.value) || 0;
      if (safetyDelay > 0) {
        await runtime.delay(safetyDelay);
      }
    }
  } catch (error) {
    log(`Error: ${error.message}`);
    runningToken += 1;
  }
}

function stopProgram() {
  runningToken += 1;
  log('Program stopped.');
}

function resetLeds() {
  for (let i = 0; i < LED_COUNT; i += 1) {
    pinValues.set(i, 0);
  }
  renderAll();
  log('LEDs reset.');
}

codeEditor.value = `// Arduino-style LED example\nvoid setup() {\n  for (let pin = 0; pin < 12; pin++) {\n    pinMode(pin, OUTPUT);\n  }\n}\n\nvoid loop() {\n  for (let i = 0; i < 12; i++) {\n    digitalWrite(i, HIGH);\n    delay(80);\n    digitalWrite(i, LOW);\n  }\n\n  for (let i = 0; i < 12; i++) {\n    analogWrite(i, random(40, 255));\n  }\n  delay(250);\n  setAll(LOW);\n}`;

runBtn.addEventListener('click', runProgram);
stopBtn.addEventListener('click', stopProgram);
resetBtn.addEventListener('click', resetLeds);

createLeds();
