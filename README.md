# LumaLab Studio (Arduino-style LED simulator)

A single-window advanced editor workspace for building and stress-testing LED animations with Arduino-like code (`setup()` + `loop()`).

## Highlights

- Dense no-scroll workspace with draggable splitters for panel width and console height.
- Enhanced UX controls:
  - API search panel filtering
  - dynamic LED count (6..24) with instant simulator rebuild
  - autosave toggle with debounced draft persistence
  - import/export draft actions
  - contrast mode toggle for accessibility
- Editor productivity features:
  - line numbers, live cursor position, snippets, one-click formatter
  - bracket pairing + tab indentation
  - keyboard shortcuts (`Ctrl/Cmd + Enter`, `Ctrl/Cmd + S`, `Ctrl/Cmd + Space`)
  - contextual autocomplete popup
- Runtime observability:
  - live telemetry (`LEDs lit`, `avg brightness`, `loop cycles`, `loops/s`)
  - manual LED toggling when runtime is idle
- Runtime safety and resilience:
  - global fallback banner with one-click recovery
  - guarded event wiring and safe startup calls
  - input range validation + sketch structure validation
  - runtime watchdog + loop safety delay

## Run locally

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000>.

## Built-in APIs

- `pinMode(pin, mode)`
- `digitalWrite(pin, HIGH|LOW)`
- `analogWrite(pin, 0..255)`
- `toggle(pin)`
- `setAll(value)`
- `shiftLeft()` / `shiftRight()`
- `delay(ms)`
- `millis()`
- `random(min, max)`
- `print(value)`
