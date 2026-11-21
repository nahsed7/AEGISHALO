/**
 * Draws a sample report onto a canvas as a "photographed lab sheet" so the demo exercises
 * the real OCR path instead of skipping it.
 */
export async function renderReportImage(text: string): Promise<Blob> {
  const lines = text.split("\n");
  const scale = 2;
  const lineH = 22;
  const width = 900;
  const height = 70 + lines.length * lineH;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#fbfbf7";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#1a1a1a";
  ctx.textBaseline = "top";
  lines.forEach((line, i) => {
    const isTitle = i < 3;
    ctx.font = `${isTitle ? "bold " : ""}16px "Courier New", monospace`;
    ctx.fillText(line, 36, 36 + i * lineH);
  });
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))), "image/png"),
  );
}
