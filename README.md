# LumaLab X (Ultimate LED WebApp IDE)

LumaLab X is a single-window, no-scroll, high-density web IDE for Arduino-style LED sketching (`setup()` + `loop()`) with a polished UX and strong runtime resilience.

## What was upgraded

- Modern webapp shell with split-pane layout and drag-resize handles.
- Professional editor stack via CDNs:
  - Tailwind CSS
  - CodeMirror (syntax highlighting, line numbers, autocomplete, bracket support)
  - js-beautify formatter
- Rich UX controls:
  - presets, snippets, import/export, save, format, keyboard shortcuts
  - dynamic LED strip (6..30 LEDs) with interactive manual toggles
  - real-time stats (`lit LEDs`, `avg brightness`, `loop cycles`, `loops/s`)
- Advanced safety and fallback:
  - global error + unhandled rejection fallback banner
  - protected run/stop/reset actions through safe wrappers
  - recover button to restore workspace quickly
  - storage fallback handling when localStorage is unavailable
- In-app API/help explorer with instant search.

## Run locally

```bash
python3 -m http.server 8000
```

Then open: <http://localhost:8000>

## Core runtime APIs

- `pinMode(pin, OUTPUT)`
- `digitalWrite(pin, HIGH|LOW)`
- `analogWrite(pin, 0..255)`
- `toggle(pin)`
- `setAll(value)`
- `shiftLeft()` / `shiftRight()`
- `delay(ms)`
- `millis()`
- `random(min, max)`
- `print(value)`
