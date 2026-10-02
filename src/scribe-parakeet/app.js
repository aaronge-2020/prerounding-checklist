/**
 * app.js — DOM wiring for scribe-parakeet.html. Wiring only: all capture,
 * inference, chunking, and enrollment logic lives in pipeline.js; the model
 * cache/downloader lives in model-manager.js.
 */
import {
  initPipeline,
  downloadModels,
  getModelStatus,
  startRecording,
  stopRecording,
  cancelRecording,
  isRecording,
  captureSample,
  enrollVoice,
  getEnrolled,
  clearEnrolled,
  checkBrowserSupport,
  formatTimestamp,
  ENROLL_SECONDS,
} from './pipeline.js';
import { MODEL_MANIFEST, TOTAL_BYTES } from './model-manager.js';

const $ = (id) => document.getElementById(id);

const els = {
  bannerUnsupported: $('bannerUnsupported'),
  fileList: $('fileList'),
  overallBar: $('overallBar'),
  overallText: $('overallText'),
  overallPct: $('overallPct'),
  offlinePill: $('offlinePill'),
  btnDownload: $('btnDownload'),
  bannerDownload: $('bannerDownload'),
  downloadErrText: $('downloadErrText'),
  btnRetryDownload: $('btnRetryDownload'),
  btnEnrollRec: $('btnEnrollRec'),
  btnEnrollSave: $('btnEnrollSave'),
  btnEnrollClear: $('btnEnrollClear'),
  enrollStatus: $('enrollStatus'),
  enrollProc: $('enrollProc'),
  btnRecord: $('btnRecord'),
  btnStop: $('btnStop'),
  timer: $('timer'),
  levelBar: $('levelBar'),
  recProc: $('recProc'),
  recProcText: $('recProcText'),
  engineProc: $('engineProc'),
  engineProcText: $('engineProcText'),
  bannerMic: $('bannerMic'),
  btnRetryMic: $('btnRetryMic'),
  bannerWorker: $('bannerWorker'),
  workerErrText: $('workerErrText'),
  workerEpInfo: $('workerEpInfo'),
  btnRetryWorker: $('btnRetryWorker'),
  transcriptList: $('transcriptList'),
  btnCopy: $('btnCopy'),
  btnShare: $('btnShare'),
};

let engine = null; // {client, info} once the worker is ready
let booting = null; // in-flight boot promise
let enrollSample = null; // Float32Array captured for enrollment
let timerId = null;
let recStart = 0;
let lastSegments = [];

const show = (el) => el.classList.add('show');
const hide = (el) => el.classList.remove('show');

function fmtBytes(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}

function fmtClock(ms) {
  return formatTimestamp(ms / 1000);
}

// ---------------------------------------------------------------- setup ---

function renderFileRows(status) {
  els.fileList.innerHTML = '';
  for (const entry of MODEL_MANIFEST) {
    const st = status.find((s) => s.name === entry.name);
    const row = document.createElement('div');
    row.className = 'file' + (st?.cached ? ' done' : '');
    row.id = `file-${entry.name}`;
    row.innerHTML =
      `<span class="name"></span><span class="meta"></span><span class="bar" aria-hidden="true"><i></i></span>`;
    row.querySelector('.name').textContent = entry.label;
    row.querySelector('.meta').textContent =
      `${fmtBytes(entry.bytes)} · ${st?.cached ? 'cached ✓' : 'not downloaded'}`;
    els.fileList.appendChild(row);
  }
}

function setFileProgress(name, loaded, total, cached) {
  const row = $(`file-${name}`);
  if (!row) return;
  const bar = row.querySelector('.bar i');
  const meta = row.querySelector('.meta');
  const entry = MODEL_MANIFEST.find((e) => e.name === name);
  const pct = total > 0 ? Math.min(100, (loaded / total) * 100) : 0;
  bar.style.width = `${pct.toFixed(1)}%`;
  meta.textContent = cached
    ? `${fmtBytes(entry.bytes)} · cached ✓`
    : `${fmtBytes(entry.bytes)} · ${pct.toFixed(0)}%`;
  row.classList.toggle('done', !!cached);
}

function setOverall(loaded, total) {
  const pct = total > 0 ? Math.min(100, (loaded / total) * 100) : 0;
  els.overallBar.style.width = `${pct.toFixed(1)}%`;
  els.overallPct.textContent = `${pct.toFixed(0)}%`;
  els.overallText.textContent = `${fmtBytes(loaded)} of ${fmtBytes(total)}`;
}

async function refreshSetup() {
  const status = await getModelStatus();
  renderFileRows(status);
  const loaded = status.reduce((a, s) => a + (s.cached ? s.expectedBytes : 0), 0);
  setOverall(loaded, TOTAL_BYTES);
  const allCached = status.length > 0 && status.every((s) => s.cached);
  els.offlinePill.hidden = !allCached;
  // State hook for the view layout: CSS shows the setup hero while models are
  // missing and collapses the setup card to a slim status once cached.
  const scribeView = document.getElementById('scribeProContent');
  if (scribeView) scribeView.dataset.modelsReady = String(allCached);
  els.btnDownload.disabled = allCached;
  els.btnDownload.textContent = allCached
    ? 'Models cached ✓'
    : `Download models (~${Math.round(TOTAL_BYTES / 1e6)} MB, once)`;
  return { status, allCached };
}

async function runDownload() {
  hide(els.bannerDownload);
  els.btnDownload.disabled = true;
  try {
    await downloadModels((p) => {
      setFileProgress(p.name, p.loaded, p.total, false);
      setOverall(p.overallLoaded, p.overallTotal);
      if (p.done) {
        for (const e of MODEL_MANIFEST) setFileProgress(e.name, e.bytes, e.bytes, true);
      }
    });
    await refreshSetup();
    await bootEngine();
  } catch (e) {
    els.downloadErrText.textContent =
      `The model download failed: ${e?.message || e}`;
    show(els.bannerDownload);
    els.btnDownload.disabled = false;
  }
}

// --------------------------------------------------------------- engine ---

/**
 * Human-readable boot status for each initPipeline stage. The 652MB encoder
 * session load is the long pole (minutes on first run), so the sessions stage
 * says so explicitly instead of stalling silently.
 */
function bootStageText(p) {
  switch (p.stage) {
    case 'support': return 'Checking browser capabilities…';
    case 'status': return 'Checking model cache…';
    case 'load': {
      if (p.name) {
        const entry = MODEL_MANIFEST.find((e) => e.name === p.name);
        const label = entry ? entry.label : p.name;
        const count = p.filesDone != null && p.fileCount != null ? ` (${p.filesDone}/${p.fileCount})` : '';
        return `Reading ${label} from local cache…${count}`;
      }
      return 'Reading models from local cache…';
    }
    case 'transfer': return 'Handing models to the transcription engine…';
    case 'sessions': {
      const count = p.total != null ? ` (${p.done ?? 0}/${p.total})` : '';
      return `Loading neural networks into memory…${count} — this can take several minutes the first time`;
    }
    case 'ready': return 'Engine ready ✓';
    default: return null;
  }
}

async function bootEngine() {
  if (engine) return engine;
  if (booting) return booting;
  booting = (async () => {
    hide(els.bannerWorker);
    // Honest state while booting: the Record button says what it is doing and
    // a dedicated status line narrates the stages below it.
    els.btnRecord.disabled = true;
    els.btnRecord.textContent = '● Starting engine…';
    show(els.engineProc);
    els.engineProcText.textContent = 'Starting engine…';
    try {
      engine = await initPipeline((p) => {
        if (p.stage === 'transcribe') return;
        const t = bootStageText(p);
        if (t) els.engineProcText.textContent = t;
      });
      const info = engine.info || {};
      els.workerEpInfo.textContent =
        `onnxruntime-web ${info.ortVersion || 'n/a'} · ` +
        `threads=${info.threads ?? 'n/a'} · ` +
        Object.entries(info.eps || {}).map(([k, v]) => `${k}:${v}`).join(' ');
      els.engineProcText.textContent = 'Engine ready ✓';
      setTimeout(() => hide(els.engineProc), 3000);
      return engine;
    } catch (e) {
      hide(els.engineProc);
      if (e?.code === 'models-not-cached') throw e; // setup card handles it
      els.workerErrText.textContent = `The transcription engine failed to start: ${e?.message || e}`;
      show(els.bannerWorker);
      throw e;
    } finally {
      booting = null;
      updateRecordButtons();
    }
  })();
  return booting;
}

async function ensureEngine() {
  if (engine) return engine;
  const { allCached } = await refreshSetup();
  if (!allCached) {
    els.btnDownload.focus();
    throw new Error('Download the models first (setup card above).');
  }
  return bootEngine();
}

// ------------------------------------------------------------ enrollment ---

function renderEnrolled() {
  const enrolled = getEnrolled();
  if (enrolled) {
    els.enrollStatus.textContent =
      `Voiceprint saved${enrolled.createdAt ? ` (${new Date(enrolled.createdAt).toLocaleDateString()})` : ''}. ` +
      `New transcripts will label matching speech as “You”.`;
    els.btnEnrollClear.hidden = false;
    els.btnEnrollRec.textContent = 'Re-record 12s sample';
  } else {
    els.enrollStatus.textContent = enrollSample
      ? 'Sample captured. Save it as your voiceprint, or re-record.'
      : 'Not enrolled.';
    els.btnEnrollClear.hidden = true;
    els.btnEnrollRec.textContent = 'Record 12s sample';
  }
  els.btnEnrollSave.disabled = !enrollSample || !!enrolled;
}

async function onEnrollRecord() {
  enrollSample = null;
  els.btnEnrollRec.disabled = true;
  els.btnEnrollSave.disabled = true;
  try {
    const totalMs = ENROLL_SECONDS * 1000;
    const t0 = Date.now();
    const tick = setInterval(() => {
      const left = Math.max(0, Math.ceil((totalMs - (Date.now() - t0)) / 1000));
      els.enrollStatus.textContent = `Recording sample… ${left}s left — speak normally.`;
    }, 250);
    try {
      enrollSample = await captureSample(ENROLL_SECONDS);
    } finally {
      clearInterval(tick);
    }
    els.enrollStatus.textContent = 'Sample captured. Save it as your voiceprint, or re-record.';
  } catch (e) {
    if (e?.code === 'mic-denied' || e?.code === 'mic-error') {
      show(els.bannerMic);
    } else {
      els.enrollStatus.textContent = `Could not record a sample: ${e?.message || e}`;
    }
  } finally {
    els.btnEnrollRec.disabled = false;
    renderEnrolled();
  }
}

async function onEnrollSave() {
  if (!enrollSample) return;
  els.enrollProc.classList.add('show');
  els.btnEnrollSave.disabled = true;
  try {
    const eng = await ensureEngine();
    const r = await enrollVoice(enrollSample, eng.client, (p) => {
      els.enrollStatus.textContent =
        p.stage === 'vad' ? 'Detecting speech in the sample…'
        : `Analyzing voice… (${p.done}/${p.total})`;
    });
    enrollSample = null;
    els.enrollStatus.textContent =
      `Voiceprint saved (${r.segments} speech segments, ${r.speechSec.toFixed(1)}s of speech).`;
  } catch (e) {
    els.enrollStatus.textContent =
      e?.code === 'insufficient-speech'
        ? e.message
        : `Could not save the voiceprint: ${e?.message || e}`;
  } finally {
    els.enrollProc.classList.remove('show');
    renderEnrolled();
  }
}

// ------------------------------------------------------------- recorder ---

function updateRecordButtons() {
  const rec = isRecording();
  els.btnRecord.disabled = rec || !engine;
  els.btnStop.disabled = !rec;
  if (!engine && !rec) els.btnRecord.title = 'Start the engine first (download models, or wait for auto-start)';
  else els.btnRecord.title = '';
  if (!rec && !booting) els.btnRecord.textContent = '● Record';
}

function startTimer() {
  recStart = Date.now();
  els.timer.textContent = '0:00';
  timerId = setInterval(() => { els.timer.textContent = fmtClock(Date.now() - recStart); }, 250);
}

function stopTimer() {
  if (timerId) clearInterval(timerId);
  timerId = null;
}

async function onRecord() {
  hide(els.bannerMic);
  try {
    await ensureEngine();
    await startRecording({
      onLevel: (rms) => {
        els.levelBar.style.width = `${Math.min(100, rms * 320).toFixed(0)}%`;
      },
      onCap: () => {
        els.recProcText.textContent = 'Processing… (10-minute cap reached)';
        onStop();
      },
    });
    startTimer();
    updateRecordButtons();
  } catch (e) {
    if (e?.code === 'mic-denied' || e?.code === 'mic-error') show(els.bannerMic);
    else if (e?.code !== 'models-not-cached') alert(e?.message || e);
  }
}

async function onStop() {
  if (!isRecording()) return;
  els.btnStop.disabled = true;
  stopTimer();
  els.levelBar.style.width = '0%';
  els.recProc.classList.add('show');
  els.recProcText.textContent = 'Processing… detecting speech';
  try {
    const { segments, audioSec } = await stopRecording(engine.client, (p) => {
      if (p.stage === 'vad') els.recProcText.textContent = 'Processing… detecting speech';
      else if (p.stage === 'transcribe') {
        const frac = p.framesTotal > 0 ? p.framesDone / p.framesTotal : 0;
        const overall = ((p.chunkIndex + frac) / p.chunkCount) * 100;
        els.recProcText.textContent =
          `Processing… transcribing (${p.chunkIndex + 1}/${p.chunkCount}, ${overall.toFixed(0)}%)`;
      }
    });
    lastSegments = segments;
    renderTranscript(segments, audioSec);
  } catch (e) {
    els.recProcText.textContent = `Processing failed: ${e?.message || e}`;
    await new Promise((r) => setTimeout(r, 2500));
  } finally {
    els.recProc.classList.remove('show');
    updateRecordButtons();
  }
}

// ------------------------------------------------------------ transcript ---

const WHO_LABEL = { you: 'You', patient: 'Patient', speaker: 'Speaker' };

function renderTranscript(segments, audioSec) {
  els.transcriptList.innerHTML = '';
  if (!segments.length) {
    els.transcriptList.innerHTML =
      `<p class="empty">No speech detected in ${audioSec.toFixed(0)}s of audio.</p>`;
  }
  for (const s of segments) {
    const div = document.createElement('div');
    div.className = 'seg';
    const who = document.createElement('div');
    const label = document.createElement('span');
    label.className = `who ${s.speaker}`;
    label.textContent = WHO_LABEL[s.speaker] || 'Speaker';
    const ts = document.createElement('span');
    ts.className = 'ts';
    ts.textContent = `${formatTimestamp(s.start)}–${formatTimestamp(s.end)}`;
    who.append(label, ts);
    const txt = document.createElement('p');
    txt.className = 'txt';
    txt.textContent = s.text || '(no speech recognized)';
    div.append(who, txt);
    els.transcriptList.appendChild(div);
  }
  els.btnCopy.disabled = !segments.length;
  els.btnShare.disabled = !segments.length;
}

function transcriptText() {
  return lastSegments
    .map((s) => `${WHO_LABEL[s.speaker] || 'Speaker'} [${formatTimestamp(s.start)}–${formatTimestamp(s.end)}]\n${s.text}`)
    .join('\n\n');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}

async function onCopy() {
  const ok = await copyText(transcriptText());
  els.btnCopy.textContent = ok ? 'Copied ✓' : 'Copy failed';
  setTimeout(() => { els.btnCopy.textContent = 'Copy transcript'; }, 1500);
}

async function onShare() {
  const text = transcriptText();
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Scribe Pro transcript', text });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return; // user dismissed the sheet
    }
  }
  const ok = await copyText(text);
  els.btnShare.textContent = ok ? 'Copied to clipboard ✓' : 'Share unavailable';
  setTimeout(() => { els.btnShare.textContent = 'Share…'; }, 1500);
}

// ----------------------------------------------------------------- boot ---

async function boot() {
  const missing = checkBrowserSupport();
  if (missing.length) {
    els.bannerUnsupported.textContent =
      `This browser can't run Scribe Pro — missing: ${missing.join(', ')}. ` +
      `Use a recent Chrome or Edge on a laptop.`;
    show(els.bannerUnsupported);
    els.btnDownload.disabled = true;
    els.btnRecord.disabled = true;
    return;
  }
  els.btnDownload.addEventListener('click', runDownload);
  els.btnRetryDownload.addEventListener('click', runDownload);
  els.btnRetryMic.addEventListener('click', () => { hide(els.bannerMic); onRecord(); });
  els.btnRetryWorker.addEventListener('click', () => { engine = null; bootEngine().catch(() => {}); });
  els.btnEnrollRec.addEventListener('click', onEnrollRecord);
  els.btnEnrollSave.addEventListener('click', onEnrollSave);
  els.btnEnrollClear.addEventListener('click', () => {
    clearEnrolled();
    enrollSample = null;
    renderEnrolled();
  });
  els.btnRecord.addEventListener('click', onRecord);
  els.btnStop.addEventListener('click', onStop);
  els.btnCopy.addEventListener('click', onCopy);
  els.btnShare.addEventListener('click', onShare);

  renderEnrolled();
  const { allCached } = await refreshSetup();
  updateRecordButtons();
  if (allCached) bootEngine().catch(() => {}); // banners surface failures
}

boot();
