# LumaLab Studio (Arduino-style LED simulator)

A modern editor-style web app for building and stress-testing LED animations with Arduino-like code (`setup()` + `loop()`).

## Highlights

- Editor-inspired interface with line numbers, runtime status pills, and debug console.
- Preset library (`scanner`, `pulse`, `randomize`) + local draft caching.
- Virtual LED strip with live telemetry (`LEDs lit`, `avg brightness`, `loop cycles`).
- Safety guards for long/tight loops:
  - configurable loop safety delay
  - max runtime watchdog
- Built-in APIs:
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

## Run locally

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000>.

## Reliability notes

- Program-level error logging with a dedicated runtime error state.
- Compile cache keeps transformed sketches in memory to improve repeat run speed.
- Drafts and cache metadata are stored in `localStorage` when available.
