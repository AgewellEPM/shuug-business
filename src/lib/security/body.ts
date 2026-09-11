export async function readLimitedBody(request: Request, maximum: number): Promise<Buffer> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Request body required.");
  let length = 0; const chunks: Uint8Array[] = [];
  try { while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > maximum) { await reader.cancel(); throw new Error("Request body too large."); } chunks.push(part.value); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
