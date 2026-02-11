const LED_COUNT = 12;
const HIGH = 1;
const LOW = 0;
const OUTPUT = 'OUTPUT';
const INPUT = 'INPUT';
const DRAFT_KEY = 'lumalab:draft:v1';
const RUN_CACHE_KEY = 'lumalab:runcache:v1';

const codeEditor = document.getElementById('codeEditor');
const lineNumbers = document.getElementById('lineNumbers');
const consoleEl = document.getElementById('console');
const ledStripEl = document.getElementById('ledStrip');
const runBtn = document.getElementById('runBtn');
const stopBtn = document.getElementById('stopBtn');
const resetBtn = document.getElementById('resetBtn');
const clearConsoleBtn = document.getElementById('clearConsoleBtn');
const saveDraftBtn = document.getElementById('saveDraftBtn');
const loadPresetBtn = document.getElementById('loadPresetBtn');
const presetSelect = document.getElementById('presetSelect');
const loopSafetyEl = document.getElementById('loopSafety');
const maxRunMsEl = document.getElementById('maxRunMs');
const runtimeStatus = document.getElementById('runtimeStatus');
const cacheStatus = document.getElementById('cacheStatus');
const lastRun = document.getElementById('lastRun');
const litCountEl = document.getElementById('litCount');
const avgBrightnessEl = document.getElementById('avgBrightness');
const loopCounterEl = document.getElementById('loopCounter');

const leds = [];
const pinModes = new Map();
const pinValues = new Map();
const compiledSketchCache = new Map();
let runningToken = 0;
let startTime = Date.now();
let loopCounter = 0;

const presets = {
  scanner: `void setup() {\n  for (let pin = 0; pin < 12; pin++) pinMode(pin, OUTPUT);\n}\n\nvoid loop() {\n  for (let i = 0; i < 12; i++) {\n    setAll(LOW);\n    analogWrite(i, 255);\n    delay(45);\n  }\n  for (let i = 10; i > 0; i--) {\n    setAll(LOW);\n    analogWrite(i, 255);\n    delay(45);\n  }\n}`,
  pulse: `void setup() {\n  for (let pin = 0; pin < 12; pin++) pinMode(pin, OUTPUT);\n}\n\nvoid loop() {\n  for (let b = 20; b < 255; b += 12) {\n    setAll(b);\n    delay(20);\n  }\n  for (let b = 255; b > 0; b -= 10) {\n    setAll(b);\n    delay(18);\n  }\n}`,
  randomize: `void setup() {\n  for (let pin = 0; pin < 12; pin++) pinMode(pin, OUTPUT);\n}\n\nvoid loop() {\n  for (let i = 0; i < 12; i++) analogWrite(i, random(0, 256));\n  delay(140);\n}`,
};

function formatError(error) {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  return error.stack || error.message || String(error);
}

function nowTime() {
  return new Date().toLocaleTimeString();
}

function setRuntimeBadge(label, kind = 'idle') {
  runtimeStatus.textContent = label;
  runtimeStatus.className = `pill ${kind}`;
}

function log(message, level = 'info') {
  const prefix = level === 'error' ? '[ERR]' : level === 'warn' ? '[WARN]' : '[INFO]';
  consoleEl.textContent += `${prefix} ${message}\n`;
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function clearLog() {
  consoleEl.textContent = '';
}

function saveRunCacheStats() {
  try {
    localStorage.setItem(RUN_CACHE_KEY, JSON.stringify({ cachedItems: compiledSketchCache.size, updatedAt: Date.now() }));
  } catch (_error) {
    log('Local cache unavailable (private mode or storage quota).', 'warn');
  }
  cacheStatus.textContent = `Compiled cache: ${compiledSketchCache.size}`;
}

function restoreDraftOrPreset() {
  try {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      codeEditor.value = draft;
      log('Recovered draft from local cache.');
      return;
    }
  } catch (_error) {
    log('Draft cache unavailable, using default preset.', 'warn');
  }
  codeEditor.value = presets.scanner;
}

function persistDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, codeEditor.value);
    log('Draft saved to local cache.');
  } catch (_error) {
    log('Could not save draft cache.', 'warn');
  }
}

function updateLineNumbers() {
  const lines = Math.max(1, codeEditor.value.split('\n').length);
  lineNumbers.textContent = Array.from({ length: lines }, (_v, i) => `${i + 1}`).join('\n');
}

function isProgramRunning() {
  return runBtn.disabled;
}

function setProgramRunningState(running) {
  runBtn.disabled = running;
  stopBtn.disabled = !running;
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
  const brightness = Math.max(0, Math.min(255, Number.isFinite(value) ? value : 0));
  const alpha = brightness / 255;
  leds[pin].style.background = `rgba(255, 45, 55, ${Math.max(0.07, alpha)})`;
  leds[pin].style.boxShadow = `0 0 ${6 + alpha * 18}px rgba(255, 70, 70, ${Math.max(0.14, alpha)})`;
}

function updateStats() {
  let lit = 0;
  let total = 0;
  for (let i = 0; i < LED_COUNT; i += 1) {
    const value = pinValues.get(i) ?? 0;
    if (value > 0) lit += 1;
    total += value;
  }
  litCountEl.textContent = String(lit);
  avgBrightnessEl.textContent = `${Math.round((total / (LED_COUNT * 255)) * 100)}%`;
  loopCounterEl.textContent = String(loopCounter);
}

function renderAll() {
  for (let i = 0; i < LED_COUNT; i += 1) renderPin(i);
  updateStats();
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
  const normalized = source
    .replace(/\bvoid\s+setup\s*\(\s*\)/g, 'async function setup()')
    .replace(/\bvoid\s+loop\s*\(\s*\)/g, 'async function loop()')
    .replace(/\b(?:int|float|double|long|short|byte|bool|String)\s+/g, 'let ');

  return normalized.replace(/(^|[^.\w$])delay\s*\(/g, '$1await delay(');
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
      if (pinModes.get(p) !== OUTPUT) throw new Error(`Pin ${p} is not OUTPUT.`);
      pinValues.set(p, value === HIGH ? 255 : 0);
      renderPin(p);
      updateStats();
    },
    analogWrite(pin, value) {
      const p = clampPin(pin);
      if (pinModes.get(p) !== OUTPUT) throw new Error(`Pin ${p} is not OUTPUT.`);
      const normalized = Math.max(0, Math.min(255, Number(value) || 0));
      pinValues.set(p, normalized);
      renderPin(p);
      updateStats();
    },
    toggle(pin) {
      const p = clampPin(pin);
      pinValues.set(p, (pinValues.get(p) ?? 0) > 0 ? 0 : 255);
      renderPin(p);
      updateStats();
    },
    setAll(value) {
      const normalized = value === HIGH ? 255 : value === LOW ? 0 : Math.max(0, Math.min(255, Number(value) || 0));
      for (let i = 0; i < LED_COUNT; i += 1) pinValues.set(i, normalized);
      renderAll();
    },
    shiftLeft() {
      for (let i = 0; i < LED_COUNT - 1; i += 1) pinValues.set(i, pinValues.get(i + 1) ?? 0);
      pinValues.set(LED_COUNT - 1, 0);
      renderAll();
    },
    shiftRight() {
      for (let i = LED_COUNT - 1; i > 0; i -= 1) pinValues.set(i, pinValues.get(i - 1) ?? 0);
      pinValues.set(0, 0);
      renderAll();
    },
    async delay(ms) {
      const durationMs = Math.max(0, Number(ms) || 0);
      if (durationMs === 0) return;
      const startedAt = Date.now();
      while (Date.now() - startedAt < durationMs) {
        if (runningToken === 0) throw new Error('Program stopped.');
        await new Promise((resolve) => setTimeout(resolve, Math.min(16, durationMs)));
      }
    },
    millis() {
      return Date.now() - startTime;
    },
    random(min, max) {
      if (typeof max === 'undefined') {
        const upper = Number(min);
        if (!Number.isFinite(upper) || upper <= 0) throw new Error('random(max) requires max > 0.');
        return Math.floor(Math.random() * upper);
      }
      const low = Number(min);
      const high = Number(max);
      if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) {
        throw new Error('random(min, max) requires finite numbers with max > min.');
      }
      return Math.floor(Math.random() * (high - low) + low);
    },
    print(value) {
      log(String(value));
    },
  };
}

async function compileUserCode(code, runtime) {
  const transformed = normalizeForJavaScript(code);
  if (compiledSketchCache.has(transformed)) {
    cacheStatus.textContent = `Compiled cache: ${compiledSketchCache.size} (hit)`;
    return compiledSketchCache.get(transformed)(runtime);
  }

  const argNames = Object.keys(runtime);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const factory = new AsyncFunction(
    ...argNames,
    `${transformed}\nif (typeof setup !== 'function' || typeof loop !== 'function') { throw new Error('Define setup() and loop().'); }\nreturn { setup, loop };`
  );

  const instantiator = (runtimeContext) => factory(...argNames.map((name) => runtimeContext[name]));
  compiledSketchCache.set(transformed, instantiator);
  saveRunCacheStats();
  return instantiator(runtime);
}

async function runProgram() {
  if (isProgramRunning()) return;

  const token = ++runningToken;
  const maxRuntimeMs = Math.max(100, Number(maxRunMsEl.value) || 15000);
  setProgramRunningState(true);
  setRuntimeBadge('Running', 'running');
  loopCounter = 0;
  clearLog();
  startTime = Date.now();
  lastRun.textContent = `Started ${nowTime()}`;
  log('Compiling sketch...');

  try {
    const runtime = buildRuntime();
    const sketch = await compileUserCode(codeEditor.value, runtime);
    log('Running setup()...');
    await sketch.setup();
    log('Entering loop()... (press Stop to halt)');

    while (token === runningToken) {
      await sketch.loop();
      loopCounter += 1;
      updateStats();
      if (Date.now() - startTime > maxRuntimeMs) {
        throw new Error(`Runtime guard tripped after ${maxRuntimeMs}ms. Increase max runtime if intentional.`);
      }
      const safetyDelay = Math.max(0, Number(loopSafetyEl.value) || 0);
      if (safetyDelay > 0) await runtime.delay(safetyDelay);
    }
  } catch (error) {
    if (error.message !== 'Program stopped.') {
      setRuntimeBadge('Error', 'error');
      log(formatError(error), 'error');
    }
    runningToken = 0;
  } finally {
    setProgramRunningState(false);
    if (runtimeStatus.classList.contains('running')) {
      setRuntimeBadge('Idle', 'idle');
    }
    lastRun.textContent = `Last run ${nowTime()}`;
  }
}

function stopProgram() {
  if (!isProgramRunning()) return;
  runningToken = 0;
  setRuntimeBadge('Stopped', 'idle');
  log('Program stopped.');
}

function resetLeds() {
  for (let i = 0; i < LED_COUNT; i += 1) pinValues.set(i, 0);
  loopCounter = 0;
  renderAll();
  log('LEDs reset.');
}

function populatePresets() {
  Object.keys(presets).forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    presetSelect.appendChild(option);
  });
}

function loadSelectedPreset() {
  const preset = presets[presetSelect.value];
  if (!preset) return;
  codeEditor.value = preset;
  updateLineNumbers();
  log(`Loaded preset: ${presetSelect.value}`);
}

window.addEventListener('error', (event) => {
  log(formatError(event.error || event.message), 'error');
  setRuntimeBadge('Error', 'error');
});

codeEditor.addEventListener('input', () => {
  updateLineNumbers();
});

codeEditor.addEventListener('scroll', () => {
  lineNumbers.scrollTop = codeEditor.scrollTop;
});

runBtn.addEventListener('click', runProgram);
stopBtn.addEventListener('click', stopProgram);
resetBtn.addEventListener('click', resetLeds);
clearConsoleBtn.addEventListener('click', clearLog);
saveDraftBtn.addEventListener('click', persistDraft);
loadPresetBtn.addEventListener('click', loadSelectedPreset);

createLeds();
populatePresets();
restoreDraftOrPreset();
updateLineNumbers();
setProgramRunningState(false);
setRuntimeBadge('Idle', 'idle');
saveRunCacheStats();
