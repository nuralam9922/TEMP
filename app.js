const DEFAULT_LED_COUNT = 12;
const HIGH = 1;
const LOW = 0;
const OUTPUT = 'OUTPUT';
const INPUT = 'INPUT';
const DRAFT_KEY = 'lumalab:draft:v1';
const RUN_CACHE_KEY = 'lumalab:runcache:v1';
const PREFS_KEY = 'lumalab:prefs:v2';

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
const loopRateEl = document.getElementById('loopRate');
const litCountEl = document.getElementById('litCount');
const avgBrightnessEl = document.getElementById('avgBrightness');
const loopCounterEl = document.getElementById('loopCounter');
const formatCodeBtn = document.getElementById('formatCodeBtn');
const apiListEl = document.getElementById('apiList');
const snippetToolbar = document.getElementById('snippetToolbar');
const cursorStatus = document.getElementById('cursorStatus');
const autocompleteList = document.getElementById('autocompleteList');
const shellResize = document.getElementById('shellResize');
const consoleResize = document.getElementById('consoleResize');
const apiSearch = document.getElementById('apiSearch');
const ledCountEl = document.getElementById('ledCount');
const ledCountValue = document.getElementById('ledCountValue');
const autosaveToggle = document.getElementById('autosaveToggle');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const exportDraftBtn = document.getElementById('exportDraftBtn');
const importDraftBtn = document.getElementById('importDraftBtn');
const importDraftFile = document.getElementById('importDraftFile');

const leds = [];
const pinModes = new Map();
const pinValues = new Map();
const compiledSketchCache = new Map();
let runningToken = 0;
let startTime = Date.now();
let loopCounter = 0;
let ledCount = DEFAULT_LED_COUNT;
let autosaveTimer = 0;

const API_DOCS = [
  ['pinMode(pin, mode)', 'Configure pin mode. Use OUTPUT or INPUT.'],
  ['digitalWrite(pin, HIGH|LOW)', 'Switch a LED fully on/off.'],
  ['analogWrite(pin, 0..255)', 'Set PWM intensity from 0 to 255.'],
  ['toggle(pin)', 'Toggle LED from ON to OFF or OFF to ON.'],
  ['setAll(value)', 'Set all LEDs with HIGH, LOW, or 0..255 brightness.'],
  ['shiftLeft()', 'Move LED values left by one pin.'],
  ['shiftRight()', 'Move LED values right by one pin.'],
  ['delay(ms)', 'Pause execution safely (auto-await supported).'],
  ['millis()', 'Get elapsed milliseconds since run start.'],
  ['random(min, max)', 'Generate random integer in [min, max).'],
  ['print(value)', 'Write logs to the console panel.'],
];

const snippets = {
  setupLoop: `void setup() {\n  for (let pin = 0; pin < 12; pin++) pinMode(pin, OUTPUT);\n}\n\nvoid loop() {\n  // your loop logic\n  delay(80);\n}`,
  forLoop: `for (let i = 0; i < 12; i++) {\n  analogWrite(i, 255);\n}`,
  guard: `if (millis() > 6000) {\n  setAll(LOW);\n}`,
  print: `print('debug value: ' + value);`,
};

const autocompleteTerms = [
  'pinMode(', 'digitalWrite(', 'analogWrite(', 'toggle(', 'setAll(', 'shiftLeft()', 'shiftRight()', 'delay(', 'millis()', 'random(',
  'print(', 'void setup()', 'void loop()', 'for (let i = 0; i < 12; i++) {\n  \n}', 'if () {\n  \n}'
];

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

function showFallback(message) {
  const fallback = document.getElementById('globalFallback');
  const messageEl = document.getElementById('fallbackMessage');
  if (!fallback || !messageEl) return;
  messageEl.textContent = message;
  fallback.classList.remove('hidden');
}

function safeInvoke(label, fn) {
  try {
    fn();
  } catch (error) {
    log(`${label} failed: ${formatError(error)}`, 'error');
    showFallback(`${label} failed. Workspace is still usable.`);
  }
}

function wireEvent(target, type, handler) {
  if (!target) return;
  target.addEventListener(type, (event) => {
    try {
      handler(event);
    } catch (error) {
      log(`Event error (${type}): ${formatError(error)}`, 'error');
      showFallback('A non-blocking UI error occurred.');
    }
  });
}

function persistPrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      autosave: autosaveToggle.checked,
      ledCount,
      highContrast: document.body.classList.contains('high-contrast'),
      leftWidth: getComputedStyle(document.documentElement).getPropertyValue('--left-width').trim(),
      consoleHeight: getComputedStyle(document.documentElement).getPropertyValue('--console-height').trim(),
    }));
  } catch (_error) {
    log('Could not persist preferences.', 'warn');
  }
}

function restorePrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return;
    const prefs = JSON.parse(raw);
    autosaveToggle.checked = prefs.autosave !== false;
    if (prefs.highContrast) document.body.classList.add('high-contrast');
    if (prefs.leftWidth) document.documentElement.style.setProperty('--left-width', prefs.leftWidth);
    if (prefs.consoleHeight) document.documentElement.style.setProperty('--console-height', prefs.consoleHeight);
    if (Number.isInteger(prefs.ledCount) && prefs.ledCount >= 6 && prefs.ledCount <= 24) {
      ledCount = prefs.ledCount;
      ledCountEl.value = String(ledCount);
      ledCountValue.textContent = String(ledCount);
    }
  } catch (_error) {
    log('Could not restore preferences.', 'warn');
  }
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

function queueAutosave() {
  if (!autosaveToggle.checked) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => {
    persistDraft();
  }, 550);
}

function updateLineNumbers() {
  const lines = Math.max(1, codeEditor.value.split('\n').length);
  lineNumbers.textContent = Array.from({ length: lines }, (_v, i) => `${i + 1}`).join('\n');
}

function updateCursorStatus() {
  const cursor = codeEditor.selectionStart;
  const textBefore = codeEditor.value.slice(0, cursor);
  const lines = textBefore.split('\n');
  const line = lines.length;
  const col = lines[lines.length - 1].length + 1;
  cursorStatus.textContent = `Ln ${line}, Col ${col}`;
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
  if (!Number.isInteger(n) || n < 0 || n >= ledCount) {
    throw new Error(`Invalid pin ${pin}. Use 0-${ledCount - 1}.`);
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
  for (let i = 0; i < ledCount; i += 1) {
    const value = pinValues.get(i) ?? 0;
    if (value > 0) lit += 1;
    total += value;
  }
  litCountEl.textContent = String(lit);
  avgBrightnessEl.textContent = `${Math.round((total / (Math.max(1, ledCount) * 255)) * 100)}%`;
  loopCounterEl.textContent = String(loopCounter);
}

function renderAll() {
  for (let i = 0; i < ledCount; i += 1) renderPin(i);
  updateStats();
}

function clearLedsState() {
  leds.splice(0, leds.length);
  pinModes.clear();
  pinValues.clear();
  ledStripEl.innerHTML = '';
}

function createLeds() {
  clearLedsState();
  const columns = ledCount > 18 ? 8 : ledCount > 12 ? 7 : 6;
  ledStripEl.style.gridTemplateColumns = `repeat(${columns}, minmax(32px, 1fr))`;
  for (let i = 0; i < ledCount; i += 1) {
    const led = document.createElement('div');
    led.className = 'led';
    led.title = `Pin ${i}`;
    led.addEventListener('click', () => {
      if (isProgramRunning()) return;
      pinValues.set(i, (pinValues.get(i) ?? 0) > 0 ? 0 : 255);
      renderPin(i);
      updateStats();
    });
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
      for (let i = 0; i < ledCount; i += 1) pinValues.set(i, normalized);
      renderAll();
    },
    shiftLeft() {
      for (let i = 0; i < ledCount - 1; i += 1) pinValues.set(i, pinValues.get(i + 1) ?? 0);
      pinValues.set(ledCount - 1, 0);
      renderAll();
    },
    shiftRight() {
      for (let i = ledCount - 1; i > 0; i -= 1) pinValues.set(i, pinValues.get(i - 1) ?? 0);
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

function validateSettings() {
  const safety = Number(loopSafetyEl.value);
  const maxRun = Number(maxRunMsEl.value);

  if (!Number.isFinite(safety) || safety < 0 || safety > 2000) throw new Error('Loop safety delay must be in range 0..2000ms.');
  if (!Number.isFinite(maxRun) || maxRun < 100 || maxRun > 120000) throw new Error('Max runtime must be in range 100..120000ms.');
  if (!/void\s+setup\s*\(/.test(codeEditor.value) || !/void\s+loop\s*\(/.test(codeEditor.value)) {
    throw new Error('Sketch must contain both void setup() and void loop().');
  }
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

  try {
    validateSettings();
    const runtime = buildRuntime();
    const sketch = await compileUserCode(codeEditor.value, runtime);
    log('Running setup()...');
    await sketch.setup();
    log('Entering loop()... (press Stop to halt)');

    while (token === runningToken) {
      await sketch.loop();
      loopCounter += 1;
      const elapsedSec = Math.max(1, (Date.now() - startTime) / 1000);
      loopRateEl.textContent = `${Math.round(loopCounter / elapsedSec)} loops/s`;
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
    if (runtimeStatus.classList.contains('running')) setRuntimeBadge('Idle', 'idle');
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
  for (let i = 0; i < ledCount; i += 1) pinValues.set(i, 0);
  loopCounter = 0;
  loopRateEl.textContent = '0 loops/s';
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
  updateCursorStatus();
  log(`Loaded preset: ${presetSelect.value}`);
}

function renderApiDocs(search = '') {
  apiListEl.innerHTML = '';
  const filter = search.trim().toLowerCase();
  API_DOCS.filter(([signature, desc]) => `${signature} ${desc}`.toLowerCase().includes(filter)).forEach(([signature, explanation]) => {
    const item = document.createElement('article');
    item.className = 'api-item';
    item.innerHTML = `<code>${signature}</code><p>${explanation}</p>`;
    apiListEl.appendChild(item);
  });
}

function insertAtCursor(value) {
  const start = codeEditor.selectionStart;
  const end = codeEditor.selectionEnd;
  const initial = codeEditor.value;
  codeEditor.value = `${initial.slice(0, start)}${value}${initial.slice(end)}`;
  codeEditor.selectionStart = codeEditor.selectionEnd = start + value.length;
  codeEditor.focus();
  updateLineNumbers();
  updateCursorStatus();
}

function renderSnippetButtons() {
  Object.entries(snippets).forEach(([key, value]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'snippet-btn';
    btn.textContent = key;
    btn.addEventListener('click', () => insertAtCursor(`\n${value}\n`));
    snippetToolbar.appendChild(btn);
  });
}

function formatCode() {
  const lines = codeEditor.value.split('\n');
  let depth = 0;
  codeEditor.value = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('}')) depth = Math.max(0, depth - 1);
    const nextLine = `${'  '.repeat(depth)}${trimmed}`;
    if (trimmed.endsWith('{')) depth += 1;
    return nextLine;
  }).join('\n');
  updateLineNumbers();
  updateCursorStatus();
  log('Code formatted.');
}

function getCurrentWord() {
  const before = codeEditor.value.slice(0, codeEditor.selectionStart);
  const match = before.match(/[a-zA-Z_][\w]*$/);
  return match ? match[0] : '';
}

function showAutocomplete() {
  const token = getCurrentWord().toLowerCase();
  const suggestions = autocompleteTerms.filter((term) => term.toLowerCase().includes(token)).slice(0, 8);
  if (!suggestions.length) return autocompleteList.classList.add('hidden');
  autocompleteList.innerHTML = '';
  suggestions.forEach((term, index) => {
    const item = document.createElement('li');
    item.textContent = term;
    if (index === 0) item.classList.add('active');
    item.addEventListener('click', () => {
      insertAtCursor(term);
      autocompleteList.classList.add('hidden');
    });
    autocompleteList.appendChild(item);
  });
  autocompleteList.classList.remove('hidden');
}

function validateField(inputEl) {
  const value = Number(inputEl.value);
  const min = Number(inputEl.min);
  const max = Number(inputEl.max);
  if (!Number.isFinite(value) || value < min || value > max) {
    inputEl.style.borderColor = '#ab3e58';
    log(`${inputEl.id} out of range (${min}..${max}).`, 'warn');
    return;
  }
  inputEl.style.borderColor = '#345';
}

function attachResize(handle, type) {
  if (!handle) return;
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const move = (moveEvent) => {
      if (type === 'col') {
        const pct = Math.max(35, Math.min(75, (moveEvent.clientX / window.innerWidth) * 100));
        document.documentElement.style.setProperty('--left-width', `${pct}%`);
      } else {
        const workspaceTop = document.querySelector('.workspace').getBoundingClientRect().top;
        const pct = Math.max(16, Math.min(45, ((window.innerHeight - moveEvent.clientY + workspaceTop) / window.innerHeight) * 100));
        document.documentElement.style.setProperty('--console-height', `${pct}%`);
      }
      persistPrefs();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

function exportDraft() {
  const blob = new Blob([codeEditor.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `lumalab-draft-${Date.now()}.ino`;
  link.click();
  URL.revokeObjectURL(url);
  log('Draft exported.');
}

function importDraft(file) {
  const reader = new FileReader();
  reader.onload = () => {
    codeEditor.value = String(reader.result || '');
    updateLineNumbers();
    updateCursorStatus();
    queueAutosave();
    log(`Imported draft: ${file.name}`);
  };
  reader.onerror = () => showFallback('Failed to import draft file.');
  reader.readAsText(file);
}

window.addEventListener('error', (event) => {
  log(formatError(event.error || event.message), 'error');
  setRuntimeBadge('Error', 'error');
  showFallback('Runtime error captured. You can recover and continue.');
});

wireEvent(codeEditor, 'input', () => {
  updateLineNumbers();
  updateCursorStatus();
  queueAutosave();
});
wireEvent(codeEditor, 'click', updateCursorStatus);
wireEvent(codeEditor, 'keyup', updateCursorStatus);
wireEvent(codeEditor, 'scroll', () => { lineNumbers.scrollTop = codeEditor.scrollTop; });

wireEvent(codeEditor, 'keydown', (event) => {
  if (event.key === 'Tab') {
    event.preventDefault();
    insertAtCursor('  ');
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'enter') {
    event.preventDefault();
    runProgram();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    persistDraft();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key === ' ') {
    event.preventDefault();
    showAutocomplete();
  }
  if (event.key === '(' || event.key === '[' || event.key === '{' || event.key === '"') {
    const map = { '(': ')', '[': ']', '{': '}', '"': '"' };
    event.preventDefault();
    const close = map[event.key];
    const pos = codeEditor.selectionStart;
    insertAtCursor(`${event.key}${close}`);
    codeEditor.selectionStart = codeEditor.selectionEnd = pos + 1;
  }
});

wireEvent(autocompleteList, 'mouseleave', () => autocompleteList.classList.add('hidden'));
wireEvent(runBtn, 'click', runProgram);
wireEvent(stopBtn, 'click', stopProgram);
wireEvent(resetBtn, 'click', resetLeds);
wireEvent(clearConsoleBtn, 'click', clearLog);
wireEvent(saveDraftBtn, 'click', persistDraft);
wireEvent(loadPresetBtn, 'click', loadSelectedPreset);
wireEvent(formatCodeBtn, 'click', formatCode);
wireEvent(loopSafetyEl, 'change', () => validateField(loopSafetyEl));
wireEvent(maxRunMsEl, 'change', () => validateField(maxRunMsEl));
wireEvent(apiSearch, 'input', () => renderApiDocs(apiSearch.value));
wireEvent(autosaveToggle, 'change', persistPrefs);
wireEvent(themeToggleBtn, 'click', () => {
  document.body.classList.toggle('high-contrast');
  persistPrefs();
});
wireEvent(exportDraftBtn, 'click', exportDraft);
wireEvent(importDraftBtn, 'click', () => importDraftFile.click());
wireEvent(importDraftFile, 'change', () => {
  const file = importDraftFile.files?.[0];
  if (file) importDraft(file);
  importDraftFile.value = '';
});
wireEvent(ledCountEl, 'input', () => {
  ledCount = Number(ledCountEl.value);
  ledCountValue.textContent = String(ledCount);
  createLeds();
  persistPrefs();
});
wireEvent(document.getElementById('recoverBtn'), 'click', () => {
  document.getElementById('globalFallback')?.classList.add('hidden');
  setRuntimeBadge('Idle', 'idle');
  log('Workspace recovery completed.');
});

safeInvoke('restorePrefs', restorePrefs);
safeInvoke('createLeds', createLeds);
safeInvoke('populatePresets', populatePresets);
safeInvoke('restoreDraftOrPreset', restoreDraftOrPreset);
safeInvoke('renderApiDocs', () => renderApiDocs(''));
safeInvoke('renderSnippetButtons', renderSnippetButtons);
safeInvoke('updateLineNumbers', updateLineNumbers);
safeInvoke('updateCursorStatus', updateCursorStatus);
safeInvoke('setProgramRunningState', () => setProgramRunningState(false));
safeInvoke('setRuntimeBadge', () => setRuntimeBadge('Idle', 'idle'));
safeInvoke('saveRunCacheStats', saveRunCacheStats);
safeInvoke('attachResize(shell)', () => attachResize(shellResize, 'col'));
safeInvoke('attachResize(console)', () => attachResize(consoleResize, 'row'));
