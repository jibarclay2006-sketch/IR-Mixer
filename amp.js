(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const AC = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AC();
  const irState = { A: null, B: null };
  const ampState = { di: null, source: null, stopTimer: null, convolver: null, ir: null };
  const ampControls = ['ampInput','ampDrive','ampBass','ampMid','ampTreble','ampPresence','ampMaster'];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const db = v => Math.pow(10, v / 20);

  function setAmpStatus(text, warn = false) {
    const el = $('ampStatus');
    if (!el) return;
    el.textContent = text;
    el.style.color = warn ? 'var(--warn)' : 'var(--muted)';
  }

  function getVal(id, fallback = 0) {
    const el = $(id);
    return el ? Number(el.value) : fallback;
  }

  function getBool(id) {
    const el = $(id);
    return !!(el && el.checked);
  }

  function renderAmpReadouts() {
    const pairs = [
      ['ampInputReadout', `${getVal('ampInput', 0).toFixed(1)} dB`],
      ['ampDriveReadout', `${getVal('ampDrive', 5).toFixed(1)}`],
      ['ampBassReadout', `${getVal('ampBass', 0).toFixed(1)} dB`],
      ['ampMidReadout', `${getVal('ampMid', 0).toFixed(1)} dB`],
      ['ampTrebleReadout', `${getVal('ampTreble', 0).toFixed(1)} dB`],
      ['ampPresenceReadout', `${getVal('ampPresence', 0).toFixed(1)} dB`],
      ['ampMasterReadout', `${getVal('ampMaster', -10).toFixed(1)} dB`]
    ];
    pairs.forEach(([id, text]) => { if ($(id)) $(id).textContent = text; });

    ampControls.forEach(id => {
      const input = $(id);
      if (!input) return;
      const p = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
      const knob = input.parentElement.querySelector('.knob');
      if (knob) knob.style.setProperty('--rotation', `${-135 + p * 270}deg`);
    });
  }

  async function decodeFileForChannel(file, ch) {
    if (!file) return;
    try {
      await audioCtx.resume();
      irState[ch] = await audioCtx.decodeAudioData(await file.arrayBuffer());
      setAmpStatus(`Amp tester cached ${file.name}. Click Update Cab or Play Amp Test.`);
    } catch (err) {
      console.error(err);
      setAmpStatus(`Amp tester could not read ${file.name}.`, true);
    }
  }

  async function loadDI(file) {
    if (!file) return;
    try {
      await audioCtx.resume();
      ampState.di = await audioCtx.decodeAudioData(await file.arrayBuffer());
      $('ampFileName').textContent = file.name;
      setAmpStatus(`Loaded DI test file: ${file.name}`);
    } catch (err) {
      console.error(err);
      setAmpStatus('Could not decode DI file. Use WAV, MP3, AAC, or another browser-supported audio file.', true);
    }
  }

  function chanControls(ch) {
    return {
      gain: getVal(`gain${ch}`, 0),
      hp: getVal(`hp${ch}`, ch === 'A' ? 50 : 80),
      lp: getVal(`lp${ch}`, ch === 'A' ? 16000 : 12000),
      res: getVal(`res${ch}`, 0),
      delay: getVal(`delay${ch}`, 0),
      pan: getVal(`pan${ch}`, ch === 'A' ? -100 : 100) / 100,
      mute: getBool(`mute${ch}`),
      solo: getBool(`solo${ch}`),
      inv: getBool(`invert${ch}`)
    };
  }

  function balance() {
    const b = getVal('balance', 0);
    if (b < 0) return { A: 1, B: (100 + b) / 100 };
    if (b > 0) return { A: (100 - b) / 100, B: 1 };
    return { A: 1, B: 1 };
  }

  function addTrack(off, ch, c, bal) {
    const buf = irState[ch];
    if (!buf) return;
    const src = off.createBufferSource();
    const delay = off.createDelay(1);
    const hp = off.createBiquadFilter();
    const lp = off.createBiquadFilter();
    const presence = off.createBiquadFilter();
    const gain = off.createGain();
    const pan = off.createStereoPanner();

    src.buffer = buf;
    delay.delayTime.value = c.delay / 1000;
    hp.type = 'highpass';
    hp.frequency.value = c.hp;
    hp.Q.value = 0.707;
    lp.type = 'lowpass';
    lp.frequency.value = c.lp;
    lp.Q.value = 0.707;
    presence.type = 'peaking';
    presence.frequency.value = 3600;
    presence.Q.value = 0.85;
    presence.gain.value = c.res;
    gain.gain.value = db(c.gain) * bal * (c.inv ? -1 : 1);
    pan.pan.value = c.pan;

    src.connect(delay);
    delay.connect(hp);
    hp.connect(lp);
    lp.connect(presence);
    presence.connect(gain);
    gain.connect(pan);
    pan.connect(off.destination);
    src.start(0);
  }

  function addRoom(buf, pct) {
    if (pct <= 0) return buf;
    const amount = pct / 100;
    const out = audioCtx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
    const originals = [];
    const taps = [[7, 0.12], [13, 0.08], [22, 0.052], [35, 0.032], [51, 0.018]];

    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      originals[ch] = new Float32Array(buf.getChannelData(ch));
      out.copyToChannel(originals[ch], ch);
    }

    taps.forEach(([ms, gain]) => {
      const offset = Math.round(buf.sampleRate * ms / 1000);
      for (let ch = 0; ch < out.numberOfChannels; ch++) {
        const dest = out.getChannelData(ch);
        const src = originals[ch];
        const opposite = out.numberOfChannels > 1 ? originals[ch ? 0 : 1] : src;
        for (let i = 0; i < buf.length - offset; i++) {
          dest[i + offset] += (src[i] + opposite[i] * 0.28) * gain * amount;
        }
      }
    });
    return out;
  }

  function normalize(buf) {
    let peak = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    }
    if (!peak || peak <= 1) return buf;
    const scale = 0.98 / peak;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < data.length; i++) data[i] *= scale;
    }
    return buf;
  }

  async function renderCabForAmp() {
    const loaded = ['A', 'B'].filter(ch => irState[ch]);
    if (!loaded.length) throw new Error('Load at least one cabinet IR first.');

    const sr = audioCtx.sampleRate;
    const maxDelay = Math.max(getVal('delayA', 0), getVal('delayB', 0)) / 1000;
    const dur = Math.max(...loaded.map(ch => irState[ch].duration));
    const roomTail = getVal('room', 0) > 0 ? 0.06 : 0;
    const length = Math.max(1, Math.ceil((dur + maxDelay + roomTail + 0.02) * sr));
    const off = new OfflineAudioContext(2, length, sr);
    const anySolo = ['A', 'B'].some(ch => chanControls(ch).solo);
    const bal = balance();

    loaded.forEach(ch => {
      const c = chanControls(ch);
      if (!c.mute && (!anySolo || c.solo)) addTrack(off, ch, c, bal[ch]);
    });

    let mixed = await off.startRendering();
    mixed = addRoom(mixed, getVal('room', 0));
    mixed = normalize(mixed);
    ampState.ir = mixed;
    setAmpStatus(`Amp cab updated from current mixer settings at ${sr.toLocaleString()} Hz.`);
    return mixed;
  }

  function makeCurve(drive, mode) {
    const n = 4096;
    const curve = new Float32Array(n);
    const gain = 1 + drive * 9;
    const asym = mode === 'brown' ? 0.08 : mode === 'lead' ? 0.04 : 0;
    const sag = mode === 'clean' ? 0.22 : mode === 'crunch' ? 0.42 : 0.62;

    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      let y = Math.tanh((x + asym) * gain);
      y = y * (1 - sag) + Math.atan((x + asym) * gain * 1.8) / Math.atan(gain * 1.8) * sag;
      curve[i] = clamp(y * 0.92, -1, 1);
    }
    return curve;
  }

  function makeTestGuitarBuffer() {
    const sr = audioCtx.sampleRate;
    const seconds = 4.5;
    const buffer = audioCtx.createBuffer(1, Math.floor(sr * seconds), sr);
    const out = buffer.getChannelData(0);
    const notes = [82.41, 110.0, 146.83, 164.81, 196.0, 146.83, 110.0, 82.41, 123.47, 164.81, 220.0, 196.0];
    const step = 0.34;

    for (let n = 0; n < notes.length; n++) {
      const start = Math.floor(n * step * sr);
      const len = Math.floor(0.31 * sr);
      const freq = notes[n];
      let last = 0;
      for (let i = 0; i < len && start + i < out.length; i++) {
        const t = i / sr;
        const pick = Math.exp(-t * 38) * (Math.random() * 2 - 1) * 0.5;
        const body = Math.sin(2 * Math.PI * freq * t) * 0.62 + Math.sin(2 * Math.PI * freq * 2.01 * t) * 0.21 + Math.sin(2 * Math.PI * freq * 3.02 * t) * 0.08;
        const env = Math.exp(-t * 5.1) * (1 - Math.exp(-t * 160));
        const palm = n % 4 === 0 ? Math.exp(-t * 13) : 1;
        const sample = (body * env * palm + pick) * 0.55;
        last = last * 0.68 + sample * 0.32;
        out[start + i] += last;
      }
    }
    return buffer;
  }

  function selectedDryBuffer() {
    const source = $('ampSource') ? $('ampSource').value : 'generated';
    if (source === 'file' && ampState.di) return ampState.di;
    return makeTestGuitarBuffer();
  }

  function makeAmpGraph(sourceNode, irBuffer) {
    const mode = $('ampMode') ? $('ampMode').value : 'brown';
    const styleDefaults = {
      clean: { preLow: 100, postLow: 7800, midFreq: 650, midQ: 0.9, baseDrive: 0.12 },
      crunch: { preLow: 95, postLow: 6900, midFreq: 760, midQ: 1.05, baseDrive: 0.34 },
      lead: { preLow: 90, postLow: 6100, midFreq: 900, midQ: 1.15, baseDrive: 0.55 },
      brown: { preLow: 82, postLow: 7400, midFreq: 780, midQ: 0.95, baseDrive: 0.48 }
    }[mode];

    const input = audioCtx.createGain();
    const preHP = audioCtx.createBiquadFilter();
    const bass = audioCtx.createBiquadFilter();
    const mid = audioCtx.createBiquadFilter();
    const treble = audioCtx.createBiquadFilter();
    const drive = audioCtx.createWaveShaper();
    const postLP = audioCtx.createBiquadFilter();
    const presence = audioCtx.createBiquadFilter();
    const convolver = audioCtx.createConvolver();
    const master = audioCtx.createGain();
    const limiter = audioCtx.createDynamicsCompressor();

    const driveKnob = getVal('ampDrive', 5) / 10;
    input.gain.value = db(getVal('ampInput', 0));
    preHP.type = 'highpass';
    preHP.frequency.value = styleDefaults.preLow;
    preHP.Q.value = 0.7;
    bass.type = 'lowshelf';
    bass.frequency.value = 150;
    bass.gain.value = getVal('ampBass', 0);
    mid.type = 'peaking';
    mid.frequency.value = styleDefaults.midFreq;
    mid.Q.value = styleDefaults.midQ;
    mid.gain.value = getVal('ampMid', 0);
    treble.type = 'highshelf';
    treble.frequency.value = 2300;
    treble.gain.value = getVal('ampTreble', 0);
    drive.curve = makeCurve(styleDefaults.baseDrive + driveKnob, mode);
    drive.oversample = '4x';
    postLP.type = 'lowpass';
    postLP.frequency.value = styleDefaults.postLow;
    postLP.Q.value = 0.8;
    presence.type = 'peaking';
    presence.frequency.value = 3900;
    presence.Q.value = 0.7;
    presence.gain.value = getVal('ampPresence', 0);
    convolver.buffer = irBuffer;
    convolver.normalize = true;
    master.gain.value = db(getVal('ampMaster', -10));
    limiter.threshold.value = -2;
    limiter.knee.value = 6;
    limiter.ratio.value = 10;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.09;

    sourceNode.connect(input);
    input.connect(preHP);
    preHP.connect(bass);
    bass.connect(mid);
    mid.connect(treble);
    treble.connect(drive);
    drive.connect(postLP);
    postLP.connect(presence);
    presence.connect(convolver);
    convolver.connect(master);
    master.connect(limiter);
    limiter.connect(audioCtx.destination);

    ampState.convolver = convolver;
    return { master, limiter };
  }

  async function playAmpTest() {
    try {
      await audioCtx.resume();
      stopAmpTest(false);
      setAmpStatus('Rendering the current IR mix for the amp tester...');
      const ir = await renderCabForAmp();
      const src = audioCtx.createBufferSource();
      const dry = selectedDryBuffer();
      src.buffer = dry;
      src.loop = getBool('ampLoop');
      makeAmpGraph(src, ir);
      src.start();
      ampState.source = src;
      $('ampStopBtn').disabled = false;
      $('ampPlayBtn').disabled = true;
      setAmpStatus(`Playing ${$('ampSource') && $('ampSource').value === 'file' && ampState.di ? 'your DI file' : 'built-in guitar test'} through the amp sim and current IR mix.`);
      src.onended = () => stopAmpTest(false);
      if (!src.loop) ampState.stopTimer = window.setTimeout(() => stopAmpTest(false), dry.duration * 1000 + 250);
    } catch (err) {
      console.error(err);
      setAmpStatus(err.message || 'Amp test failed.', true);
      $('ampPlayBtn').disabled = false;
      $('ampStopBtn').disabled = true;
    }
  }

  function stopAmpTest(show = true) {
    if (ampState.stopTimer) window.clearTimeout(ampState.stopTimer);
    ampState.stopTimer = null;
    if (ampState.source) {
      try { ampState.source.onended = null; ampState.source.stop(); } catch (_) {}
    }
    ampState.source = null;
    if ($('ampPlayBtn')) $('ampPlayBtn').disabled = false;
    if ($('ampStopBtn')) $('ampStopBtn').disabled = true;
    if (show) setAmpStatus('Amp tester stopped.');
  }

  function hookKnobs() {
    document.querySelectorAll('#amp-section .knob-control').forEach(label => {
      const input = label.querySelector('input[type=range]');
      const knob = label.querySelector('.knob');
      if (!input || !knob) return;
      const fromPointer = e => {
        const r = knob.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        let a = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI + 90;
        if (a < -180) a += 360;
        a = clamp(a, -135, 135);
        const min = +input.min, max = +input.max, step = +input.step || 1;
        input.value = clamp(Math.round((min + (a + 135) / 270 * (max - min)) / step) * step, min, max);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      knob.addEventListener('pointerdown', e => { e.preventDefault(); knob.setPointerCapture(e.pointerId); fromPointer(e); });
      knob.addEventListener('pointermove', e => { if (e.buttons) fromPointer(e); });
      knob.addEventListener('wheel', e => {
        e.preventDefault();
        const step = +input.step || 1;
        input.value = clamp(+input.value + (e.deltaY < 0 ? step : -step), +input.min, +input.max);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, { passive: false });
    });
  }

  function init() {
    if (!$('amp-section')) return;
    if ($('fileA')) $('fileA').addEventListener('change', e => decodeFileForChannel(e.target.files[0], 'A'));
    if ($('fileB')) $('fileB').addEventListener('change', e => decodeFileForChannel(e.target.files[0], 'B'));
    if ($('ampDI')) $('ampDI').addEventListener('change', e => loadDI(e.target.files[0]));
    if ($('ampRenderBtn')) $('ampRenderBtn').addEventListener('click', () => renderCabForAmp().catch(err => setAmpStatus(err.message, true)));
    if ($('ampPlayBtn')) $('ampPlayBtn').addEventListener('click', playAmpTest);
    if ($('ampStopBtn')) $('ampStopBtn').addEventListener('click', () => stopAmpTest(true));
    document.querySelectorAll('#amp-section input, #amp-section select').forEach(el => {
      el.addEventListener('input', renderAmpReadouts);
      el.addEventListener('change', renderAmpReadouts);
    });
    hookKnobs();
    renderAmpReadouts();
  }

  init();
})();
