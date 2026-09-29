/**
 * parakeet-worker.js — inference core for the on-device Parakeet 0.6B scribe.
 *
 * Classic Web Worker (importScripts). Owns 5 onnxruntime-web sessions:
 *   frontend  nemo128 mel frontend        waveforms[1,n] -> features[1,80,T]
 *   encoder   parakeet-tdt-0.6b int8      audio_signal[1,80,T] -> outputs[1,1024,T']
 *   joint     TDT decoder+joint int8      per-frame greedy decode: port of
 *                                         onnx-asr's NemoConformerTdt
 *                                         (MIT, github.com/istupakov/onnx-asr)
 *                                         via lab/transcribe.html. Tensor
 *                                         reuse + periodic yield adapted from
 *                                         xiuxiu's src/parakeet.worker.js
 *                                         (MIT, github.com/rberenguel/xiuxiu).
 *   vad       Silero VAD                  16kHz, 576-sample windows (this
 *                                         export: input[1,576], no sr input)
 *   wespeaker WeSpeaker ResNet34-LM fp32  input_features[1,T,80] -> [1,256]
 *                                         L2-normalized embedding
 *
 * Message API (postMessage; transfer ArrayBuffers where noted):
 *   {type:'init', files:{frontend,encoder,joint,vad,wespeaker:ArrayBuffer, vocab:string}, preferWebGPU}
 *     -> {type:'initProgress', stage:'sessions-start', total}   (session creation begins)
 *     -> {type:'initProgress', stage:'session', label, done, total}  (per network loaded)
 *     -> {type:'ready', info:{eps, ortVersion, threads}}
 *     -> {type:'error', fatal:true, message}
 *   {type:'vad', id, pcm:ArrayBuffer}
 *     -> {type:'vadResult', id, segments:[{start,end}]}   (seconds)
 *   {type:'transcribe', id, pcm:ArrayBuffer}   (Float32 16kHz mono, <=90s)
 *     -> {type:'transcribeProgress', id, framesDone, framesTotal}  (repeated)
 *     -> {type:'transcribeResult', id, text, tokens:[{id,start,end}],
 *          audioSec, frameShiftMs}
 *   {type:'embed', id, pcm:ArrayBuffer}
 *     -> {type:'embedResult', id, embedding:ArrayBuffer}  (Float32, L2-normed)
 *   {type:'ping', id?} -> {type:'pong', id, hasSessions}
 *
 * Any handler failure replies {type:'error', id?, fatal:false, message}.
 */

importScripts('/vendor/ort-1.22.0/ort.all.min.js');

const VAD_WINDOW = 576;          // samples @16kHz (36ms) — measured from the model
const VAD_THRESHOLD = 0.5;
const VAD_MIN_SPEECH_MS = 250;
const VAD_MERGE_GAP_MS = 300;    // merge speech runs separated by < this
const VAD_PAD_MS = 150;
const SAMPLE_RATE = 16000;

const BLANK = 1024;              // <blk> index in vocab.txt
const V = 1025;                  // vocab size incl. blank
const MAX_TOKENS_PER_STEP = 10;  // same-frame emission guard (lab parity)

let S = null;        // sessions: {frontend, encoder, joint, vad, wespeaker}
let EPS = null;      // EP actually used per session
let ID2TOK = null;   // token id -> string

function fail(id, message, fatal) {
  postMessage({ type: 'error', id, fatal: !!fatal, message: String(message) });
}

async function createSession(data, eps, label) {
  let lastErr = null;
  for (const ep of eps) {
    try {
      // A hung EP backend must not wedge init forever: time out and try next.
      const session = await withTimeout(
        ort.InferenceSession.create(data, { executionProviders: [ep] }),
        180000,
        `${label}: '${ep}' session creation timed out after 180s`
      );
      return { session, ep };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `${label}: session creation failed on [${eps.join(', ')}]: ${lastErr && lastErr.message}`
  );
}

/** Race a promise against a timeout so a stalled backend can't hang init. */
function withTimeout(promise, ms, message) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function parseVocab(text) {
  const map = {};
  for (const line of text.trim().split('\n')) {
    const i = line.lastIndexOf(' ');
    if (i < 0) continue;
    const id = parseInt(line.slice(i + 1), 10);
    map[id] = line.slice(0, i).replace(/▁/g, ' ');
  }
  return map;
}

async function handleInit(msg) {
  const { files, preferWebGPU, id } = msg;
  for (const k of ['frontend', 'encoder', 'joint', 'vad', 'wespeaker', 'vocab']) {
    if (!files || files[k] === undefined) {
      fail(undefined, `init: missing file "${k}"`, true);
      return;
    }
  }
  try {
    ort.env.wasm.wasmPaths = '/vendor/ort-1.22.0/';
    const threads = (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated)
      ? Math.min(4, (navigator.hardwareConcurrency || 4))
      : 1;
    ort.env.wasm.numThreads = threads;

    const encEps = preferWebGPU === false ? ['wasm'] : ['webgpu', 'wasm'];
    // Report per-session progress: the 652MB encoder session is the long pole
    // (minutes on first run), and the page must show that instead of stalling.
    // Every progress/ready message carries the init request id so the page's
    // client can route it (a reply without id can never resolve init()).
    postMessage({ type: 'initProgress', id, stage: 'sessions-start', total: 5 });
    let sessionsDone = 0;
    const track = (label, p) => p.then((r) => {
      sessionsDone += 1;
      try {
        postMessage({ type: 'initProgress', id, stage: 'session', label, done: sessionsDone, total: 5 });
      } catch { /* a closed port must not break init */ }
      return r;
    });
    const [frontend, encoder, joint, vad, wespeaker] = await Promise.all([
      track('frontend', createSession(files.frontend, ['wasm'], 'frontend (nemo128)')),
      track('encoder', createSession(files.encoder, encEps, 'encoder (parakeet int8)')),
      track('decoder+joint', createSession(files.joint, ['wasm'], 'decoder+joint (int8)')),
      track('vad', createSession(files.vad, ['wasm'], 'silero vad')),
      track('wespeaker', createSession(files.wespeaker, ['wasm'], 'wespeaker fp32')),
    ]);
    S = {
      frontend: frontend.session,
      encoder: encoder.session,
      joint: joint.session,
      vad: vad.session,
      wespeaker: wespeaker.session,
    };
    EPS = {
      frontend: frontend.ep, encoder: encoder.ep, joint: joint.ep,
      vad: vad.ep, wespeaker: wespeaker.ep,
    };
    ID2TOK = parseVocab(files.vocab);
    postMessage({
      type: 'ready',
      id,
      info: { eps: EPS, ortVersion: ort.env.versions.web, threads },
    });
  } catch (e) {
    fail(undefined, e && e.message, true);
  }
}

// ---------------------------------------------------------------- VAD ---

async function handleVad(msg) {
  const { id, pcm } = msg;
  try {
    if (!S) throw new Error('worker not initialized (send init first)');
    const audio = pcm instanceof Float32Array ? pcm : new Float32Array(pcm);
    const nWin = Math.ceil(audio.length / VAD_WINDOW);
    const scores = new Float32Array(nWin);
    // Silero VAD I/O (verified 2026-09-29 against silero_vad.onnx from
    // christopherthompson81/sortformer_parakeet_onnx): input[1,576] float32,
    // state[2,1,128] float32 -> output[1,1] float32 (speech prob), stateN[2,1,128].
    // NOTE: this export takes 576-sample windows and NO sr input, unlike the
    // stock Silero export (512 samples + sr). Verified by probing inputNames.
    let state = new ort.Tensor('float32', new Float32Array(2 * 1 * 128), [2, 1, 128]);
    const winBuf = new Float32Array(VAD_WINDOW);
    for (let w = 0; w < nWin; w++) {
      const off = w * VAD_WINDOW;
      const len = Math.min(VAD_WINDOW, audio.length - off);
      winBuf.fill(0);
      winBuf.set(audio.subarray(off, off + len));
      const out = await S.vad.run({
        input: new ort.Tensor('float32', winBuf.slice(), [1, VAD_WINDOW]),
        state,
      });
      state = out.stateN;
      const probs = out.output.data; // [1,1] speech probability
      let sum = 0;
      for (let i = 0; i < probs.length; i++) sum += probs[i];
      scores[w] = sum / probs.length;
    }

    // window runs -> sample segments
    const winMs = (VAD_WINDOW / SAMPLE_RATE) * 1000;
    const minWin = Math.ceil(VAD_MIN_SPEECH_MS / winMs);
    const maxGapWin = Math.floor((VAD_MERGE_GAP_MS - 1e-6) / winMs); // gaps <300ms
    const runs = [];
    let rs = -1;
    for (let w = 0; w <= nWin; w++) {
      const speech = w < nWin && scores[w] >= VAD_THRESHOLD;
      if (speech && rs < 0) rs = w;
      if (!speech && rs >= 0) {
        if (w - rs >= minWin) runs.push([rs, w]);
        rs = -1;
      }
    }
    // merge runs separated by gaps < 300ms
    const merged = [];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      if (last && r[0] - last[1] <= maxGapWin) last[1] = r[1];
      else merged.push([r[0], r[1]]);
    }
    // pad 150ms each side, clamp, merge overlaps
    const pad = Math.round((VAD_PAD_MS / 1000) * SAMPLE_RATE);
    const segments = [];
    for (const [ws, we] of merged) {
      const start = Math.max(0, ws * VAD_WINDOW - pad);
      const end = Math.min(audio.length, we * VAD_WINDOW + pad);
      const last = segments[segments.length - 1];
      if (last && start <= last.end) last.end = Math.max(last.end, end);
      else segments.push({ start: start / SAMPLE_RATE, end: end / SAMPLE_RATE });
    }
    postMessage({ type: 'vadResult', id, segments });
  } catch (e) {
    fail(id, e && e.message, false);
  }
}

// ---------------------------------------------------------- transcribe ---

function argmax(a, n) {
  let bi = 0, bv = a[0];
  for (let i = 1; i < n; i++) { if (a[i] > bv) { bv = a[i]; bi = i; } }
  return bi;
}

/** nemo128 frontend: Float32 16kHz mono -> {feats [1,80,T], featsLen}. */
async function runFrontend(audio) {
  const wv = new ort.Tensor('float32', audio, [1, audio.length]);
  const wvLen = new ort.Tensor('int64', BigInt64Array.from([BigInt(audio.length)]), [1]);
  const out = await S.frontend.run({ waveforms: wv, waveforms_lens: wvLen });
  return { feats: out.features, featsLen: out.features_lens };
}

async function handleTranscribe(msg) {
  const { id, pcm } = msg;
  try {
    if (!S) throw new Error('worker not initialized (send init first)');
    const audio = pcm instanceof Float32Array ? pcm : new Float32Array(pcm);
    if (audio.length === 0) throw new Error('transcribe: empty audio');
    if (audio.length > 90 * SAMPLE_RATE) {
      throw new Error('transcribe: chunk longer than 90s; split it first');
    }
    const audioSec = audio.length / SAMPLE_RATE;

    const { feats, featsLen } = await runFrontend(audio);
    const eOut = await S.encoder.run({ audio_signal: feats, length: featsLen });
    const enc = eOut.outputs; // [1,1024,T']
    const D = enc.dims[1], Tp = enc.dims[2];
    const encData = enc.data;
    // Measured frame shift: encoder subsamples the 10ms frontend frames 8x.
    const frameShiftMs = (audioSec * 1000) / Tp;

    // TDT greedy decode — exact port of lab/transcribe.html. NOTE: targets and
    // target_length MUST be int32; int64 silently breaks in ORT Web.
    let s1 = new ort.Tensor('float32', new Float32Array(2 * 1 * 640), [2, 1, 640]);
    let s2 = new ort.Tensor('float32', new Float32Array(2 * 1 * 640), [2, 1, 640]);
    const tokens = [];
    const frame = new Float32Array(D);
    let t = 0, steps = 0, emitted = 0;
    // targets/target_length reused across joint steps (pattern adapted from
    // xiuxiu's MIT-licensed parakeet.worker.js).
    const targetArr = new Int32Array([BLANK]);
    const targetTensor = new ort.Tensor('int32', targetArr, [1, 1]);
    const targetLenTensor = new ort.Tensor('int32', new Int32Array([1]), [1]);
    while (t < Tp) {
      // Yield periodically so the worker stays responsive to other messages
      // during long decodes (pattern adapted from xiuxiu, MIT).
      if (t % 50 === 0 && t > 0) await new Promise((r) => setTimeout(r, 0));
      for (let d = 0; d < D; d++) frame[d] = encData[d * Tp + t];
      const encFrame = new ort.Tensor('float32', frame, [1, D, 1]);
      targetArr[0] = tokens.length ? tokens[tokens.length - 1].id : BLANK;
      const jOut = await S.joint.run({
        encoder_outputs: encFrame,
        targets: targetTensor,
        target_length: targetLenTensor,
        input_states_1: s1,
        input_states_2: s2,
      });
      steps++;
      const out = jOut.outputs.data; // 1030 = 1025 token logits + 5 durations
      const tok = argmax(out, V);
      const dur = argmax(out.subarray(V), out.length - V);
      if (tok !== BLANK) {
        s1 = jOut.output_states_1;
        s2 = jOut.output_states_2;
        const span = dur > 0 ? dur : 1;
        tokens.push({
          id: tok,
          start: (t * frameShiftMs) / 1000,
          end: ((t + span) * frameShiftMs) / 1000,
        });
        emitted++;
        if (emitted >= MAX_TOKENS_PER_STEP) { t += 1; emitted = 0; }
        else if (dur > 0) { t += dur; emitted = 0; }
      } else {
        t += 1; emitted = 0;
      }
      if (steps % 25 === 0) {
        postMessage({ type: 'transcribeProgress', id, framesDone: t, framesTotal: Tp });
      }
      if (steps > 20000) throw new Error('transcribe: decode safety break (>20000 joint steps)');
    }
    postMessage({ type: 'transcribeProgress', id, framesDone: Tp, framesTotal: Tp });

    const text = tokens.map((tk) => ID2TOK[tk.id] ?? '').join('');
    postMessage({ type: 'transcribeResult', id, text, tokens, audioSec, frameShiftMs });
  } catch (e) {
    fail(id, e && e.message, false);
  }
}

// --------------------------------------------------------------- embed ---

async function handleEmbed(msg) {
  const { id, pcm } = msg;
  try {
    if (!S) throw new Error('worker not initialized (send init first)');
    const audio = pcm instanceof Float32Array ? pcm : new Float32Array(pcm);
    if (audio.length === 0) throw new Error('embed: empty audio');
    // WeSpeaker's input_features is time-major [1,T,80] (last dim must be 80 —
    // measured from the model: "index: 2 Got: 1201 Expected: 80"). The nemo128
    // frontend yields channel-first [1,80,T] (80-dim log-mel, 25ms/10ms —
    // matching WeSpeaker's expected fbank config), so transpose to [1,T,80].
    const { feats } = await runFrontend(audio);
    const nT = feats.dims[2];
    const tm = new Float32Array(nT * 80);
    const fsrc = feats.data;
    for (let t = 0; t < nT; t++) {
      for (let c = 0; c < 80; c++) tm[t * 80 + c] = fsrc[c * nT + t];
    }
    const wOut = await S.wespeaker.run({
      input_features: new ort.Tensor('float32', tm, [1, nT, 80]),
    });
    const h = wOut.last_hidden_state;
    const d = h.dims, data = h.data;
    // The onnx-community export already pools to a single utterance vector,
    // e.g. [1,256] (measured 2026-09-29). Keep frame-pooling branches for
    // exports that return frame-level features instead.
    let vec;
    if (d.length === 2 && d[0] === 1) {
      vec = Float32Array.from(data); // [1,D] pooled embedding
    } else if (d.length === 3 && d[1] === 192) {
      const T = d[2];
      vec = new Float32Array(192);
      for (let c = 0; c < 192; c++) {
        let s = 0;
        for (let i = 0; i < T; i++) s += data[c * T + i];
        vec[c] = s / T;
      }
    } else if (d.length === 3 && d[2] === 192) {
      const T = d[1];
      vec = new Float32Array(192);
      for (let i = 0; i < T; i++) {
        const base = i * 192;
        for (let c = 0; c < 192; c++) vec[c] += data[base + c];
      }
      for (let c = 0; c < 192; c++) vec[c] /= T;
    } else {
      throw new Error(`embed: unexpected last_hidden_state dims [${d.join(',')}]`);
    }
    const dim = vec.length;
    let norm = 0;
    for (let c = 0; c < dim; c++) norm += vec[c] * vec[c];
    norm = Math.sqrt(norm) || 1;
    for (let c = 0; c < dim; c++) vec[c] /= norm;
    postMessage({ type: 'embedResult', id, embedding: vec.buffer }, [vec.buffer]);
  } catch (e) {
    fail(id, e && e.message, false);
  }
}

// ------------------------------------------------------------- dispatch ---

self.onmessage = (ev) => {
  const msg = ev.data || {};
  switch (msg.type) {
    case 'init': handleInit(msg); break;
    case 'vad': handleVad(msg); break;
    case 'transcribe': handleTranscribe(msg); break;
    case 'embed': handleEmbed(msg); break;
    case 'ping':
      postMessage({ type: 'pong', id: msg.id, hasSessions: !!S });
      break;
    default:
      fail(msg.id, `unknown message type "${msg.type}"`, false);
  }
};
