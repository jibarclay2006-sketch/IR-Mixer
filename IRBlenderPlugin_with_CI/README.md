# IR Blender (VST3 + Standalone)
Real‑time dual IR mixer with per‑IR HP/LP, **Resonance (100 Hz)**, polarity, offset, blend, and output gain. Built with **JUCE** and **VST3**.

## Features
- Load **IR A** and **IR B** (WAV/AIFF/MP3; WAV recommended)
- Per‑IR controls: Gain (±24 dB), HP (10–400 Hz), LP (2–20 kHz), **Resonance** (peaking @ 100 Hz, Q≈1.1, ±12 dB), Offset (±50 ms), Polarity
- Global controls: Blend (A→B), Output gain
- Supports Mono or Stereo I/O (auto)
- Formats: **VST3** and **Standalone** (audio device input)

## Quick Build (Windows, Visual Studio)
1. Install **Visual Studio 2022** (Desktop C++ workload) and **CMake 3.22+**.
2. Get **JUCE**: `git clone https://github.com/juce-framework/JUCE.git` (place beside this folder or anywhere).
3. Get **VST3 SDK**: `git clone https://github.com/steinbergmedia/vst3sdk.git` (or use Steinberg installer).
4. Configure:
   ```bash
   cmake -S . -B build -D JUCE_DIR="C:/path/to/JUCE" -D VST3_SDK_DIR="C:/path/to/vst3sdk"
   ```
5. Build:
   ```bash
   cmake --build build --config Release
   ```
6. Your plugin will be at `build/IRBlender_artefacts/Release/VST3/IRBlender.vst3`  
   Standalone app at `build/IRBlender_artefacts/Release/Standalone/IRBlender.exe`.

### macOS (VST3 + Standalone)
```bash
brew install cmake ninja
git clone https://github.com/juce-framework/JUCE.git
git clone https://github.com/steinbergmedia/vst3sdk.git
cmake -S . -B build -G Ninja -D JUCE_DIR="/path/JUCE" -D VST3_SDK_DIR="/path/vst3sdk"
cmake --build build --config Release
```
Result: `.vst3` bundle under `IRBlender_artefacts/Release/VST3` and a `.app` Standalone.

## Load IRs
- Click **Load IR A** / **Load IR B** in the GUI, or drag‑drop WAV files into the window.
- IRs are loaded with JUCE's partitioned convolution (`juce::dsp::Convolution`) for low latency.

## Notes
- Offsets are relative: we internally shift both paths so that the earlier one has 0 ms delay.
- For stereo IRs, the left channel is used by default; future upgrade can add true‑stereo.
- This is a clean starting point—feel free to tweak the DSP (e.g., presence shelf, room early reflections).

Enjoy!
