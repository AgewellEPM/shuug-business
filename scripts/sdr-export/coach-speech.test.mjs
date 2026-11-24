import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { localCoachSpeech } from './coach-speech.mjs';

test('the speech endpoint rejects malformed, oversized and silent input before invoking recognition', async () => {
  const speech = localCoachSpeech({ SDR_WHISPER_CLI: process.execPath, SDR_WHISPER_MODEL: fileURLToPath(import.meta.url) });
  function send(buffer, contentType = 'audio/wav') {
    const request = Readable.from([buffer]); request.headers = { 'content-type': contentType };
    return speech.transcribe(request, 'test-rep');
  }
  await assert.rejects(send(Buffer.alloc(0), 'text/plain'), { status: 415 });
  await assert.rejects(send(Buffer.alloc(1024046)), { status: 413 });
  await assert.rejects(send(Buffer.alloc(200)), { status: 400 });
  const wav = Buffer.alloc(32044);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  await assert.rejects(send(wav), { status: 422 });
  assert.equal(localCoachSpeech({ SDR_WHISPER_CLI: '/missing-tinky-speech-engine' }).available, false);
});
