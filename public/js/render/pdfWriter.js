// Escritor de PDF mínimo, sin dependencias (también se usa en las pruebas de Node).

/** PDF 1.4 mínimo con una imagen JPEG por página (tamaño en puntos = píxeles × 0,75). */
export function buildPdf(images) {
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = (part) => {
    const bytes = typeof part === 'string' ? enc.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const obj = (n, body) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    for (const part of [].concat(body)) push(part);
    push('\nendobj\n');
  };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const pageIds = images.map((_, i) => 3 + i * 3);
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${images.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`);
  images.forEach((img, i) => {
    const pageId = pageIds[i];
    const imgId = pageId + 1;
    const contentId = pageId + 2;
    const w = (img.width * 0.75).toFixed(2);
    const hgt = (img.height * 0.75).toFixed(2);
    const content = `q ${w} 0 0 ${hgt} 0 0 cm /Im0 Do Q`;
    obj(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${hgt}] /Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    obj(imgId, [
      `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.data.length} >>\nstream\n`,
      img.data,
      '\nendstream',
    ]);
    obj(contentId, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  const total = 3 + images.length * 3;
  const xref = length;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let n = 1; n < total; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}
