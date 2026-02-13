const HIGH = 255;
const LOW = 0;
const OUTPUT = 'OUTPUT';

const DRAFT_KEY = 'lumalabx-draft';
const PREF_KEY = 'lumalabx-prefs';

const APIs = [
  ['pinMode(pin, OUTPUT)', 'Set pin mode.'],
  ['digitalWrite(pin, HIGH|LOW)', 'Write digital value.'],
  ['analogWrite(pin, 0..255)', 'Write PWM intensity.'],
  ['toggle(pin)', 'Toggle pin quickly.'],
  ['setAll(value)', 'Set all LEDs to one value.'],
  ['shiftLeft()/shiftRight()', 'Move pattern over strip.'],
  ['delay(ms)', 'Non-blocking await delay.'],
  ['millis()', 'Milliseconds since run started.'],
  ['random(min,max)', 'Random integer helper.'],
  ['print(value)', 'Write logs to console.']
];

const presets = {
  scanner: `void setup() {
  for (let i = 0; i < 12; i++) pinMode(i, OUTPUT);
}

void loop() {
  for (let i = 0; i < 12; i++) {
    setAll(LOW);
    analogWrite(i, 255);
    await delay(60);
  }
  for (let i = 10; i > 0; i--) {
    setAll(LOW);
    analogWrite(i, 200);
    await delay(60);
  }
}`,
  pulse: `void setup() {
  for (let i = 0; i < 12; i++) pinMode(i, OUTPUT);
}

void loop() {
  const t = millis() / 600;
  for (let i = 0; i < 12; i++) {
    const value = Math.floor((Math.sin(t + i * 0.35) * 0.5 + 0.5) * 255);
    analogWrite(i, value);
  }
  await delay(40);
}`
};

const el = {
  runtimeStatus: document.getElementById('runtimeStatus'),
  loopRate: document.getElementById('loopRate'),
  cacheStatus: document.getElementById('cacheStatus'),
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  runBtn: document.getElementById('runBtn'),
  stopBtn: document.getElementById('stopBtn'),
  resetBtn: document.getElementById('resetBtn'),
  console: document.getElementById('console'),
  clearConsoleBtn: document.getElementById('clearConsoleBtn'),
  cursorStatus: document.getElementById('cursorStatus'),
  presetSelect: document.getElementById('presetSelect'),
  loadPresetBtn: document.getElementById('loadPresetBtn'),
  saveDraftBtn: document.getElementById('saveDraftBtn'),
  formatCodeBtn: document.getElementById('formatCodeBtn'),
  exportDraftBtn: document.getElementById('exportDraftBtn'),
  importDraftBtn: document.getElementById('importDraftBtn'),
  importDraftFile: document.getElementById('importDraftFile'),
  snippetToolbar: document.getElementById('snippetToolbar'),
  editorPanel: document.getElementById('editorPanel'),
  ledStrip: document.getElementById('ledStrip'),
  ledCount: document.getElementById('ledCount'),
  ledCountValue: document.getElementById('ledCountValue'),
  litCount: document.getElementById('litCount'),
  avgBrightness: document.getElementById('avgBrightness'),
  loopCounter: document.getElementById('loopCounter'),
  apiList: document.getElementById('apiList'),
  apiSearch: document.getElementById('apiSearch'),
  shellResize: document.getElementById('shellResize'),
  consoleResize: document.getElementById('consoleResize'),
  globalFallback: document.getElementById('globalFallback'),
  fallbackMessage: document.getElementById('fallbackMessage'),
  recoverBtn: document.getElementById('recoverBtn')
};

let editor;
let ledCount = Number(el.ledCount.value);
let leds = [];
let pinValues = new Map();
let runtimeHandle = null;
let running = false;
let loopCounter = 0;
let loopsPerSecond = 0;
let startTs = 0;
let loopRateTimer = null;

function safe(action, message = 'A recoverable issue occurred.') {
  try { return action(); } catch (error) { showFallback(`${message} ${error?.message || ''}`); log(error?.stack || String(error), 'error'); return null; }
}

function showFallback(message) {
  el.fallbackMessage.textContent = message;
  el.globalFallback.classList.remove('hidden');
}

function log(msg, level = 'info') {
  const ts = new Date().toLocaleTimeString();
  el.console.textContent += `[${ts}] [${level.toUpperCase()}] ${msg}\n`;
  el.console.scrollTop = el.console.scrollHeight;
}

function initEditor() {
  editor = CodeMirror(el.editorPanel, {
    value: presets.scanner,
    mode: 'javascript',
    theme: 'material-darker',
    lineNumbers: true,
    autoCloseBrackets: true,
    indentUnit: 2,
    tabSize: 2,
    extraKeys: {
      'Ctrl-Space': 'autocomplete',
      'Cmd-Space': 'autocomplete'
    }
  });
  editor.on('cursorActivity', () => {
    const c = editor.getCursor();
    el.cursorStatus.textContent = `Ln ${c.line + 1}, Col ${c.ch + 1}`;
  });
  editor.on('change', persistDraftDebounced);
}

function buildSnippets() {
  const snippets = [
    ['setup/loop', 'void setup() {\n  \n}\n\nvoid loop() {\n  \n}'],
    ['for loop', 'for (let i = 0; i < 12; i++) {\n  analogWrite(i, 255);\n}'],
    ['fade', 'analogWrite(pin, value);\nawait delay(30);']
  ];
  snippets.forEach(([name, body]) => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = name;
    b.onclick = () => editor.replaceSelection(`\n${body}\n`);
    el.snippetToolbar.appendChild(b);
  });
}

function renderAPIList(filter = '') {
  el.apiList.innerHTML = '';
  APIs.filter(([sig, desc]) => `${sig} ${desc}`.toLowerCase().includes(filter.toLowerCase()))
    .forEach(([sig, desc]) => {
      const card = document.createElement('article');
      card.className = 'api-card';
      card.innerHTML = `<h3>${sig}</h3><p>${desc}</p>`;
      el.apiList.appendChild(card);
    });
}

function initPresets() {
  Object.keys(presets).forEach((k) => {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = k;
    el.presetSelect.appendChild(o);
  });
}

function createLeds() {
  leds = [];
  pinValues = new Map();
  el.ledStrip.innerHTML = '';
  const cols = ledCount > 20 ? 8 : ledCount > 12 ? 7 : 6;
  el.ledStrip.style.gridTemplateColumns = `repeat(${cols}, minmax(34px, 1fr))`;
  for (let i = 0; i < ledCount; i += 1) {
    pinValues.set(i, 0);
    const led = document.createElement('div');
    led.className = 'led';
    led.title = `Pin ${i}`;
    led.onclick = () => {
      if (running) return;
      pinValues.set(i, pinValues.get(i) > 0 ? 0 : 255);
      renderPin(i);
      updateStats();
    };
    el.ledStrip.appendChild(led);
    leds.push(led);
  }
  renderAll();
}

function renderPin(pin) {
  const v = Math.max(0, Math.min(255, Number(pinValues.get(pin) || 0)));
  const alpha = Math.max(0.08, v / 255);
  leds[pin].style.background = `rgba(255,90,105,${alpha})`;
  leds[pin].style.boxShadow = `0 0 ${6 + alpha * 20}px rgba(255,95,115,${Math.max(.15, alpha)})`;
}

function renderAll() {
  for (let i = 0; i < ledCount; i += 1) renderPin(i);
  updateStats();
}

function updateStats() {
  let lit = 0, sum = 0;
  for (let i = 0; i < ledCount; i += 1) {
    const v = pinValues.get(i) || 0;
    if (v > 0) lit += 1;
    sum += v;
  }
  el.litCount.textContent = String(lit);
  el.avgBrightness.textContent = `${Math.round((sum / (ledCount * 255)) * 100)}%`;
  el.loopCounter.textContent = String(loopCounter);
  el.loopRate.textContent = `${loopsPerSecond} loops/s`;
}

function normalizeSource(src) {
  return src
    .replace(/\bvoid\s+setup\s*\(\s*\)/g, 'async function setup()')
    .replace(/\bvoid\s+loop\s*\(\s*\)/g, 'async function loop()')
    .replace(/\b(?:int|float|double|long|short|byte|bool|String)\s+/g, 'let ')
    .replace(/(^|[^.\w$])delay\s*\(/g, '$1await delay(');
}

function buildRuntime() {
  return {
    HIGH, LOW, OUTPUT,
    pinMode(pin, mode) {
      if (mode !== OUTPUT) throw new Error('Only OUTPUT mode supported in simulator.');
      if (pin < 0 || pin >= ledCount) throw new Error(`Pin out of range: ${pin}`);
    },
    digitalWrite(pin, value) {
      if (!Number.isInteger(pin) || pin < 0 || pin >= ledCount) throw new Error(`Pin out of range: ${pin}`);
      pinValues.set(pin, value === HIGH ? 255 : 0);
      renderPin(pin);
    },
    analogWrite(pin, value) {
      if (!Number.isInteger(pin) || pin < 0 || pin >= ledCount) throw new Error(`Pin out of range: ${pin}`);
      pinValues.set(pin, Math.max(0, Math.min(255, Number(value) || 0)));
      renderPin(pin);
    },
    toggle(pin) { this.digitalWrite(pin, (pinValues.get(pin) || 0) > 0 ? LOW : HIGH); },
    setAll(value) { for (let i = 0; i < ledCount; i += 1) this.analogWrite(i, value); },
    shiftLeft() { for (let i = 0; i < ledCount - 1; i += 1) pinValues.set(i, pinValues.get(i + 1) || 0); pinValues.set(ledCount - 1, 0); renderAll(); },
    shiftRight() { for (let i = ledCount - 1; i > 0; i -= 1) pinValues.set(i, pinValues.get(i - 1) || 0); pinValues.set(0, 0); renderAll(); },
    delay(ms) { return new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0))); },
    millis() { return Date.now() - startTs; },
    random(min, max) { return Math.floor(Math.random() * (max - min)) + min; },
    print(value) { log(String(value)); }
  };
}

async function runSketch() {
  if (running) return;
  running = true;
  el.runtimeStatus.textContent = 'Running';
  el.runBtn.disabled = true;
  el.stopBtn.disabled = false;
  loopCounter = 0;
  loopsPerSecond = 0;
  startTs = Date.now();
  const source = normalizeSource(editor.getValue());

  const runtime = buildRuntime();
  const fn = new Function(...Object.keys(runtime), `${source}\nreturn { setup: typeof setup==='function'?setup:null, loop: typeof loop==='function'?loop:null };`);
  const sketch = fn(...Object.values(runtime));
  if (!sketch.setup || !sketch.loop) throw new Error('Both setup() and loop() are required.');

  await sketch.setup();
  let windowCount = 0;
  let lastSample = Date.now();

  runtimeHandle = setInterval(async () => {
    try {
      await sketch.loop();
      loopCounter += 1;
      windowCount += 1;
      const now = Date.now();
      if (now - lastSample >= 1000) {
        loopsPerSecond = windowCount;
        windowCount = 0;
        lastSample = now;
      }
      updateStats();
    } catch (error) {
      log(error.message, 'error');
      stopSketch();
      showFallback(`Runtime protected from crash: ${error.message}`);
    }
  }, 16);
}

function stopSketch() {
  if (runtimeHandle) clearInterval(runtimeHandle);
  runtimeHandle = null;
  running = false;
  el.runtimeStatus.textContent = 'Idle';
  el.runBtn.disabled = false;
  el.stopBtn.disabled = true;
}

function persistDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, editor.getValue());
    localStorage.setItem(PREF_KEY, JSON.stringify({ ledCount, theme: document.body.classList.contains('theme-light') ? 'light' : 'dark' }));
  } catch (_e) {
    log('Storage unavailable; using memory-only mode.', 'warn');
  }
}
const persistDraftDebounced = (() => { let t; return () => { clearTimeout(t); t = setTimeout(persistDraft, 400); }; })();

function restoreState() {
  try {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) editor.setValue(draft);
    const prefRaw = localStorage.getItem(PREF_KEY);
    if (prefRaw) {
      const pref = JSON.parse(prefRaw);
      if (pref.theme === 'light') document.body.classList.add('theme-light');
      if (Number.isInteger(pref.ledCount)) {
        ledCount = Math.min(30, Math.max(6, pref.ledCount));
        el.ledCount.value = String(ledCount);
      }
    }
  } catch (_e) {
    log('Could not restore cached state.', 'warn');
  }
}

function downloadDraft() {
  const blob = new Blob([editor.getValue()], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'lumalabx-draft.ino';
  a.click();
  URL.revokeObjectURL(a.href);
}

function wireResizers() {
  const root = document.documentElement;
  const onDrag = (moveEvent, key, min, max, axis = 'x') => {
    const value = axis === 'x' ? moveEvent.clientX / window.innerWidth : moveEvent.clientY / window.innerHeight;
    const pct = Math.max(min, Math.min(max, value)) * 100;
    root.style.setProperty(key, `${pct}%`);
  };

  let dragging = null;
  el.shellResize.addEventListener('mousedown', () => { dragging = 'shell'; });
  el.consoleResize.addEventListener('mousedown', () => { dragging = 'console'; });
  window.addEventListener('mousemove', (e) => {
    if (dragging === 'shell') onDrag(e, '--left-width', 0.33, 0.75, 'x');
    if (dragging === 'console') onDrag(e, '--console-height', 0.2, 0.6, 'y');
  });
  window.addEventListener('mouseup', () => { dragging = null; });
}

function wireEvents() {
  el.runBtn.onclick = () => safe(() => runSketch(), 'Run failed.');
  el.stopBtn.onclick = () => safe(() => stopSketch(), 'Stop failed.');
  el.resetBtn.onclick = () => safe(() => { for (let i = 0; i < ledCount; i += 1) pinValues.set(i, 0); renderAll(); log('LEDs reset.'); });
  el.clearConsoleBtn.onclick = () => { el.console.textContent = ''; };
  el.themeToggleBtn.onclick = () => document.body.classList.toggle('theme-light');
  el.saveDraftBtn.onclick = () => safe(() => { persistDraft(); log('Draft saved.'); });
  el.formatCodeBtn.onclick = () => safe(() => {
    const formatted = js_beautify(editor.getValue(), { indent_size: 2, space_in_empty_paren: true });
    editor.setValue(formatted);
    log('Code formatted.');
  });
  el.loadPresetBtn.onclick = () => { editor.setValue(presets[el.presetSelect.value]); log(`Loaded preset: ${el.presetSelect.value}`); };
  el.exportDraftBtn.onclick = () => safe(() => downloadDraft());
  el.importDraftBtn.onclick = () => el.importDraftFile.click();
  el.importDraftFile.onchange = () => {
    const file = el.importDraftFile.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => editor.setValue(String(reader.result || ''));
    reader.onerror = () => log('Import failed.', 'error');
    reader.readAsText(file);
  };
  el.apiSearch.oninput = () => renderAPIList(el.apiSearch.value);
  el.ledCount.oninput = () => {
    ledCount = Number(el.ledCount.value);
    el.ledCountValue.textContent = String(ledCount);
    createLeds();
    persistDraft();
  };
  el.recoverBtn.onclick = () => {
    stopSketch();
    el.globalFallback.classList.add('hidden');
    createLeds();
    log('Workspace recovered.');
  };

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'enter') {
      e.preventDefault();
      safe(() => runSketch(), 'Run shortcut failed.');
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      persistDraft();
      log('Draft saved.');
    }
  });

  window.onerror = (_m, _s, _l, _c, err) => {
    showFallback(`Global error fallback: ${err?.message || 'Unknown error'}`);
  };
  window.onunhandledrejection = (ev) => {
    showFallback(`Promise fallback: ${ev.reason?.message || 'Unhandled rejection'}`);
  };
}

function boot() {
  safe(() => {
    initEditor();
    initPresets();
    buildSnippets();
    restoreState();
    createLeds();
    renderAPIList();
    wireResizers();
    wireEvents();
    stopSketch();
    el.cacheStatus.textContent = 'Cache online';
    log('LumaLab X initialized.');
  }, 'Boot failed.');
}

boot();
