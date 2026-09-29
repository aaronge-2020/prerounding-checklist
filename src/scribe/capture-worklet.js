/**
 * Prototype mic capture worklet: forwards raw mono PCM frames to the page.
 * Downsampling to 16 kHz and utterance segmentation happen on the main thread.
 */
class ScribeCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs && inputs[0] && inputs[0][0];
    if (channel && channel.length > 0) {
      // Copy: the underlying buffer is reused by the audio thread.
      this.port.postMessage(channel.slice(0));
    }
    return true;
  }
}

registerProcessor("scribe-capture", ScribeCaptureProcessor);
