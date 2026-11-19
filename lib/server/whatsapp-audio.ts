import { spawn } from 'node:child_process';

export class AudioConversionError extends Error {
  constructor(message: string, public readonly code: 'ffmpeg_unavailable' | 'audio_conversion_failed' | 'audio_too_large') {
    super(message);
  }
}

/**
 * Convert browser recordings to a widely supported MP3 bitstream for Meta Cloud API.
 * WhatsApp Cloud API validates the codec inside the file, not just MIME/extension.
 * Do not fake an audio MIME or send the original MP4 when conversion fails.
 */
export async function prepareMetaWhatsAppAudio(file: File): Promise<File> {
  if (!file.type.startsWith('audio/')) return file;
  if (file.size > 16 * 1024 * 1024) {
    throw new AudioConversionError('Áudio acima do limite de 16 MB do WhatsApp.', 'audio_too_large');
  }

  const input = Buffer.from(await file.arrayBuffer());
  const executable = process.env.FFMPEG_PATH?.trim() || 'ffmpeg';
  const args = [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-i', 'pipe:0', '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '44100',
    '-c:a', 'libmp3lame', '-b:a', '64k', '-f', 'mp3', 'pipe:1'
  ];

  return await new Promise<File>((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let total = 0;
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      fail(new AudioConversionError('Tempo esgotado na conversão de áudio.', 'audio_conversion_failed'));
    }, 30_000);
    function fail(error: AudioConversionError) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    }
    child.on('error', () => fail(new AudioConversionError('FFmpeg indisponível no servidor. Configure FFMPEG_PATH.', 'ffmpeg_unavailable')));
    child.stdout.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > 16 * 1024 * 1024) {
        child.kill('SIGKILL');
        fail(new AudioConversionError('Áudio convertido acima de 16 MB.', 'audio_too_large'));
      } else chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-2000); });
    child.on('close', (code) => {
      if (settled) return;
      if (code !== 0 || total < 128) {
        fail(new AudioConversionError('O arquivo de áudio não pôde ser convertido para MP3.', 'audio_conversion_failed'));
        return;
      }
      const bytes = Buffer.concat(chunks);
      const isId3 = bytes.subarray(0, 3).toString() === 'ID3';
      const isMpegFrame = bytes.length > 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
      if (!isId3 && !isMpegFrame) {
        fail(new AudioConversionError('O resultado da conversão não é MP3 válido.', 'audio_conversion_failed'));
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(new File([new Uint8Array(bytes)], file.name.replace(/\.[^.]+$/, '') + '.mp3', { type: 'audio/mpeg' }));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
