const storageKey = "codex-studio-v1";
const editor = document.getElementById("editor");
const lineNumbers = document.getElementById("lineNumbers");
const languageSelect = document.getElementById("languageSelect");
const wordWrapToggle = document.getElementById("wordWrapToggle");
const lineNumbersToggle = document.getElementById("lineNumbersToggle");
const fontSizeInput = document.getElementById("fontSizeInput");
const tabSizeInput = document.getElementById("tabSizeInput");
const delayInput = document.getElementById("delayInput");
const runBtn = document.getElementById("runBtn");
const formatBtn = document.getElementById("formatBtn");
const themeBtn = document.getElementById("themeBtn");
const resetBtn = document.getElementById("resetBtn");
const downloadBtn = document.getElementById("downloadBtn");
const statusText = document.getElementById("statusText");
const cursorText = document.getElementById("cursorText");
const preview = document.getElementById("preview");
const consoleOutput = document.getElementById("consoleOutput");
const clearConsoleBtn = document.getElementById("clearConsoleBtn");
const splitLayout = document.getElementById("splitLayout");
const resizer = document.getElementById("resizer");
const searchInput = document.getElementById("searchInput");
const replaceInput = document.getElementById("replaceInput");
const matchCaseToggle = document.getElementById("matchCaseToggle");
const wholeWordToggle = document.getElementById("wholeWordToggle");
const regexToggle = document.getElementById("regexToggle");
const findNextBtn = document.getElementById("findNextBtn");
const replaceOneBtn = document.getElementById("replaceOneBtn");
const replaceAllBtn = document.getElementById("replaceAllBtn");

const sampleCode = {
  javascript: `function fib(n) {\n  if (n <= 1) return n;\n  return fib(n - 1) + fib(n - 2);\n}\n\nconst number = 10;\nconsole.log(\`fib(${number}) =\`, fib(number));`,
  html: `<main>\n  <h2>Hello, Codex Studio!</h2>\n  <p>Build modern interfaces quickly.</p>\n</main>`,
  css: `body {\n  margin: 0;\n  font-family: Inter, sans-serif;\n  background: linear-gradient(45deg, #111827, #1d4ed8);\n  color: white;\n}\n\nmain {\n  display: grid;\n  place-items: center;\n  min-height: 100vh;\n}`,
  json: `{"project":"codex-studio","features":["split-pane","autosave","search-replace"]}`,
  markdown: `# Codex Studio\n\n- Split panels\n- Live output\n- Smart autosave`
};

let autoRunTimer;
let findCursor = 0;

function setStatus(message) {
  statusText.textContent = message;
}

function updateLineNumbers() {
  const lines = editor.value.split("\n").length;
  const numbers = Array.from({ length: lines }, (_, i) => i + 1).join("\n");
  lineNumbers.textContent = numbers;
}

function syncScroll() {
  lineNumbers.scrollTop = editor.scrollTop;
}

function updateCursorInfo() {
  const start = editor.selectionStart;
  const text = editor.value.slice(0, start);
  const line = text.split("\n").length;
  const col = start - text.lastIndexOf("\n");
  cursorText.textContent = `Ln ${line}, Col ${col}`;
}

function buildRegex() {
  const term = searchInput.value;
  if (!term) {
    return null;
  }

  const source = regexToggle.checked
    ? term
    : term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bounded = wholeWordToggle.checked ? `\\b${source}\\b` : source;
  const flags = matchCaseToggle.checked ? "g" : "gi";

  return new RegExp(bounded, flags);
}

function findNext() {
  const regex = buildRegex();
  if (!regex) {
    return;
  }

  regex.lastIndex = findCursor;
  const found = regex.exec(editor.value) || (regex.lastIndex = 0, regex.exec(editor.value));

  if (!found) {
    setStatus("No matches found");
    return;
  }

  editor.focus();
  editor.setSelectionRange(found.index, found.index + found[0].length);
  findCursor = found.index + found[0].length;
  updateCursorInfo();
  setStatus(`Found at ${found.index}`);
}

function replaceSelection() {
  const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
  if (!selected) {
    findNext();
    return;
  }

  const updated =
    editor.value.slice(0, editor.selectionStart) +
    replaceInput.value +
    editor.value.slice(editor.selectionEnd);

  const newPos = editor.selectionStart + replaceInput.value.length;
  editor.value = updated;
  editor.setSelectionRange(newPos, newPos);
  updateLineNumbers();
  scheduleAutoRun();
  saveState();
  setStatus("Selection replaced");
}

function replaceAll() {
  const regex = buildRegex();
  if (!regex) {
    return;
  }

  const original = editor.value;
  const updated = original.replace(regex, replaceInput.value);
  const count = (original.match(regex) || []).length;
  editor.value = updated;
  updateLineNumbers();
  scheduleAutoRun();
  saveState();
  setStatus(`Replaced ${count} match(es)`);
}

function prettyFormat(value, language) {
  try {
    if (language === "json") {
      return JSON.stringify(JSON.parse(value), null, 2);
    }

    if (language === "javascript") {
      return value
        .split("\n")
        .map((line) => line.trimEnd())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n");
    }

    if (language === "html") {
      return value.replace(/>\s+</g, ">\n<");
    }

    if (language === "css") {
      return value.replace(/}\s*/g, "}\n\n").replace(/;\s*/g, ";\n  ");
    }

    return value;
  } catch {
    return value;
  }
}

function buildPreviewDoc(code, language) {
  if (language === "html") {
    return code;
  }

  if (language === "css") {
    return `<style>${code}</style><main style="padding:16px;color:#111">CSS injected. Add selectors here.</main>`;
  }

  if (language === "markdown") {
    const html = code
      .replace(/^###\s+(.*)$/gm, "<h3>$1</h3>")
      .replace(/^##\s+(.*)$/gm, "<h2>$1</h2>")
      .replace(/^#\s+(.*)$/gm, "<h1>$1</h1>")
      .replace(/^\-\s+(.*)$/gm, "<li>$1</li>")
      .replace(/\n{2,}/g, "</p><p>")
      .replace(/^(?!<h\d|<li)(.+)$/gm, "<p>$1</p>")
      .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>");

    return `<article style="font-family:Inter,sans-serif;padding:18px">${html}</article>`;
  }

  if (language === "json") {
    try {
      const pretty = JSON.stringify(JSON.parse(code), null, 2);
      return `<pre style="font-family:monospace;padding:12px">${pretty}</pre>`;
    } catch {
      return `<p style="color:#b91c1c;padding:12px">Invalid JSON</p>`;
    }
  }

  return `
  <script>
    window.onerror = function (msg) {
      parent.postMessage({ type: "console", payload: "Error: " + msg }, "*");
    };
    const log = console.log;
    console.log = (...args) => {
      parent.postMessage({ type: "console", payload: args.join(" ") }, "*");
      log(...args);
    };
  </script>
  <script>${code}<\/script>
  `;
}

function runPreview() {
  const code = editor.value;
  const language = languageSelect.value;
  preview.srcdoc = buildPreviewDoc(code, language);
  setStatus(`Rendered ${language.toUpperCase()} preview`);
}

function scheduleAutoRun() {
  clearTimeout(autoRunTimer);
  const delay = Number(delayInput.value) || 700;
  autoRunTimer = setTimeout(() => {
    runPreview();
    setStatus("Auto-run complete");
  }, delay);
}

function saveState() {
  const state = {
    code: editor.value,
    language: languageSelect.value,
    wrap: wordWrapToggle.checked,
    lineNumbers: lineNumbersToggle.checked,
    fontSize: Number(fontSizeInput.value),
    tabSize: Number(tabSizeInput.value),
    delay: Number(delayInput.value),
    lightMode: document.body.classList.contains("light")
  };

  localStorage.setItem(storageKey, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    editor.value = sampleCode[languageSelect.value];
    return;
  }

  try {
    const state = JSON.parse(raw);
    languageSelect.value = state.language || "javascript";
    editor.value = state.code || sampleCode[languageSelect.value];
    wordWrapToggle.checked = state.wrap ?? true;
    lineNumbersToggle.checked = state.lineNumbers ?? true;
    fontSizeInput.value = state.fontSize ?? 14;
    tabSizeInput.value = state.tabSize ?? 2;
    delayInput.value = state.delay ?? 700;
    document.body.classList.toggle("light", Boolean(state.lightMode));
  } catch {
    editor.value = sampleCode[languageSelect.value];
  }
}

function applyEditorSettings() {
  editor.style.fontSize = `${fontSizeInput.value}px`;
  lineNumbers.style.fontSize = `${fontSizeInput.value}px`;
  editor.style.tabSize = tabSizeInput.value;
  editor.style.whiteSpace = wordWrapToggle.checked ? "pre-wrap" : "pre";
  lineNumbers.style.display = lineNumbersToggle.checked ? "block" : "none";
}

function downloadCurrent() {
  const language = languageSelect.value;
  const extensions = {
    javascript: "js",
    html: "html",
    css: "css",
    json: "json",
    markdown: "md"
  };

  const blob = new Blob([editor.value], { type: "text/plain" });
  const fileName = `snippet.${extensions[language] || "txt"}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function resetEditor() {
  editor.value = sampleCode[languageSelect.value];
  updateLineNumbers();
  runPreview();
  saveState();
  setStatus("Editor reset with sample template");
}

function handleTabIndent(e) {
  if (e.key !== "Tab") {
    return;
  }

  e.preventDefault();
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const spaces = " ".repeat(Number(tabSizeInput.value) || 2);
  editor.value = `${editor.value.slice(0, start)}${spaces}${editor.value.slice(end)}`;
  editor.setSelectionRange(start + spaces.length, start + spaces.length);
  updateLineNumbers();
}

function initResizer() {
  let active = false;

  const onMove = (e) => {
    if (!active) {
      return;
    }

    const rect = splitLayout.getBoundingClientRect();
    if (window.innerWidth <= 980) {
      const percent = ((e.clientY - rect.top) / rect.height) * 100;
      const clamped = Math.min(75, Math.max(25, percent));
      splitLayout.style.gridTemplateRows = `${clamped}fr 8px ${100 - clamped}fr`;
      return;
    }

    const percent = ((e.clientX - rect.left) / rect.width) * 100;
    const clamped = Math.min(75, Math.max(25, percent));
    splitLayout.style.gridTemplateColumns = `${clamped}fr 9px ${100 - clamped}fr`;
  };

  resizer.addEventListener("pointerdown", () => {
    active = true;
    resizer.classList.add("active");
  });

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", () => {
    active = false;
    resizer.classList.remove("active");
  });
}

window.addEventListener("message", (event) => {
  if (event.data?.type === "console") {
    consoleOutput.textContent += `\n${event.data.payload}`;
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }
});

languageSelect.addEventListener("change", () => {
  if (!editor.value.trim()) {
    editor.value = sampleCode[languageSelect.value];
  }
  runPreview();
  saveState();
  setStatus(`Language switched to ${languageSelect.value}`);
});

[fontSizeInput, tabSizeInput, wordWrapToggle, lineNumbersToggle].forEach((el) => {
  el.addEventListener("change", () => {
    applyEditorSettings();
    saveState();
  });
});

delayInput.addEventListener("change", saveState);

themeBtn.addEventListener("click", () => {
  document.body.classList.toggle("light");
  saveState();
  setStatus(document.body.classList.contains("light") ? "Light theme" : "Dark theme");
});

editor.addEventListener("input", () => {
  updateLineNumbers();
  saveState();
  scheduleAutoRun();
});

editor.addEventListener("scroll", syncScroll);
editor.addEventListener("keyup", updateCursorInfo);
editor.addEventListener("click", updateCursorInfo);
editor.addEventListener("keydown", handleTabIndent);

findNextBtn.addEventListener("click", findNext);
replaceOneBtn.addEventListener("click", replaceSelection);
replaceAllBtn.addEventListener("click", replaceAll);
runBtn.addEventListener("click", runPreview);
formatBtn.addEventListener("click", () => {
  editor.value = prettyFormat(editor.value, languageSelect.value);
  updateLineNumbers();
  runPreview();
  saveState();
  setStatus("Code formatted");
});

clearConsoleBtn.addEventListener("click", () => {
  consoleOutput.textContent = "Console cleared";
});

downloadBtn.addEventListener("click", downloadCurrent);
resetBtn.addEventListener("click", resetEditor);

loadState();
applyEditorSettings();
updateLineNumbers();
updateCursorInfo();
runPreview();
initResizer();
