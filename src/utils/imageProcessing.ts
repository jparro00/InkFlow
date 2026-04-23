const THUMB_MAX = 300;
const THUMB_QUALITY = 0.7;

// Outgoing message attachment cap. Big enough that an expanded chat image
// still looks good, small enough that a 4032×3024 iPhone shot base64's to a
// few hundred KB — keeps messages.attachments JSON + Realtime payloads sane.
const ATTACH_MAX = 1600;
const ATTACH_QUALITY = 0.8;

async function resize(
  file: File,
  maxDim: number,
  quality: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  const scale = Math.min(maxDim / width, maxDim / height, 1);
  const tw = Math.round(width * scale);
  const th = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, tw, th);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode image'))),
      'image/jpeg',
      quality,
    );
  });

  return { blob, width, height };
}

export async function generateThumbnail(
  file: File,
): Promise<{ thumbnail: Blob; width: number; height: number }> {
  const { blob, width, height } = await resize(file, THUMB_MAX, THUMB_QUALITY);
  return { thumbnail: blob, width, height };
}

export async function compressImage(
  file: File,
): Promise<{ blob: Blob; width: number; height: number }> {
  return resize(file, ATTACH_MAX, ATTACH_QUALITY);
}
