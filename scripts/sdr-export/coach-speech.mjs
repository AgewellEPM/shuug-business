import { execFile } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpError } from '../../sales/model.mjs';

const sampleRate = 16000;
const maxBytes = 44 + 32 * sampleRate * 2;
const noSpeech = 'Tinky didn’t hear any words. Check your input in Sound settings, then try Speak again.';

function accessible(files, mode) {
  return files.find(file => {
    if (!file) return false;
    try { accessSync(file, mode); return true; } catch { return false; }
  });
}

async function recognize(cli, model, audio) {
  const directory = await mkdtemp(join(tmpdir(), 'tinky-voice-'));
  const output = join(directory, 'transcript');
  try {
    await new Promise((resolve, reject) => {
      const child = execFile(cli, ['-m', model, '-l', 'en', '-nt', '-np', '-ng', '-t', '4', '-otxt', '-of', output,
        '--prompt', 'TinkyTown, pipeline, prospects, contracts, meetings, sales team, territories, and follow-ups.', '-f', '-'],
        { timeout: 30000, maxBuffer: 65536 }, error => error ? reject(error) : resolve());
      child.stdin.on('error', () => { /* execFile reports when the reader exits. */ });
      child.stdin.end(audio);
    });
    const raw = await readFile(output + '.txt', 'utf8');
    const text = raw.replace(/\[(?:blank_audio|silence|music|inaudible)\]/gi, '').replace(/\s+/g, ' ').trim();
    if (!/[\p{L}\p{N}]/u.test(text)) throw new HttpError(422, noSpeech);
    return { text: text.slice(0, 2400) };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, 'Workspace voice transcription is unavailable. Try again or use keyboard dictation.');
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export function localCoachSpeech(env = process.env) {
  const cli = accessible(env.SDR_WHISPER_CLI ? [env.SDR_WHISPER_CLI] :
    ['/opt/homebrew/bin/whisper-cli', '/usr/local/bin/whisper-cli', '/usr/bin/whisper-cli'], constants.X_OK);
  const model = accessible([env.SDR_WHISPER_MODEL || join(homedir(), '.whisper-models', 'ggml-base.en.bin')], constants.R_OK);
  const available = Boolean(cli && model), working = new Set();
  async function transcribe(req, member) {
    if (!available) throw new HttpError(503, 'Local transcription is unavailable on this workspace.');
    if (req.headers['content-type']?.split(';')[0] !== 'audio/wav') throw new HttpError(415, 'Use the microphone in Ask Tinky.');
    if (working.has(member) || working.size >= 2) throw new HttpError(429, 'Voice transcription is busy. Try again in a moment.');
    working.add(member);
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > maxBytes) throw new HttpError(413, 'Speak for up to 30 seconds at a time.');
        chunks.push(chunk);
      }
      const wav = Buffer.concat(chunks);
      if (size < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.readUInt32LE(4) !== size - 8 ||
          wav.toString('ascii', 8, 16) !== 'WAVEfmt ' || wav.readUInt32LE(16) !== 16 || wav.readUInt16LE(20) !== 1 ||
          wav.readUInt16LE(22) !== 1 || wav.readUInt32LE(24) !== sampleRate || wav.readUInt32LE(28) !== sampleRate * 2 ||
          wav.readUInt16LE(32) !== 2 || wav.readUInt16LE(34) !== 16 || wav.toString('ascii', 36, 40) !== 'data' ||
          wav.readUInt32LE(40) !== size - 44 || size % 2) throw new HttpError(400, 'Tinky could not read this recording.');
      let energy = 0;
      for (let i = 44; i < size; i += 2) energy += (wav.readInt16LE(i) / 32768) ** 2;
      if (size < 44 + sampleRate / 2 || energy / ((size - 44) / 2) < 0.000001) throw new HttpError(422, noSpeech);
      return await recognize(cli, model, wav);
    } finally { working.delete(member); }
  }
  return { available, transcribe };
}
