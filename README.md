# DualCab IR Mixer

Browser-based dual impulse response mixer and WAV exporter for guitar cabinet IRs.

Load one or two WAV IR files, adjust gain, HP, LP, resonance/presence, delay, pan, balance, room, solo, mute, and polarity, then render and download a mixed WAV IR.

Files stay local in the browser.

## Pages

- `index.html` - main DualCab IR mixer, simple amp tester, and WAV exporter.
- `nam.html` - experimental Neural Amp Modeler WebAssembly tester for loading a `.nam` model, a WAV cabinet IR, and a dry guitar file.

## NAM support

The NAM page uses the open-source WebAssembly player package from TONE3000. It is experimental because it loads React and the NAM WebAssembly package from a CDN. The main IR mixer does not need these external dependencies.

Recommended workflow:

1. Blend and export your custom IR on `index.html`.
2. Open `nam.html`.
3. Load a `.nam` model.
4. Load the mixed IR WAV you exported.
5. Load a dry guitar DI or use the demo input.
6. Compare IR blends through an actual NAM-style model.

## GitHub Pages

To publish with GitHub Pages, open repository Settings, go to Pages, choose Deploy from a branch, select main and root, then save.
