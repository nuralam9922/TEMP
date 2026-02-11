# Web LED Loop Simulator (Arduino Style)

This app is a browser-based LED simulator where users can write Arduino-like C++ style code using `setup()` and `loop()` to control a virtual LED strip.

## Features

- Web UI with a code editor and virtual LED strip.
- Arduino-style structure:
  - `void setup() { ... }`
  - `void loop() { ... }`
- Built-in control APIs:
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

Then open: `http://localhost:8000`

## Notes

- The simulator accepts Arduino-like syntax and normalizes common declarations (`int`, `float`, `bool`, etc.) to run in-browser.
- You can stop execution any time using the **Stop** button.
- `Loop delay safety` adds a delay after each `loop()` iteration to prevent accidental tight infinite loops.
