"use client";

/**
 * Client-side text extraction. Nothing here touches the network except downloading the
 * Tesseract engine / language model and the pdf.js worker (static assets, no user data).
 */
export interface OcrResult {
  text: string;
  engine: "tesseract.js" | "pdf-text" | "none";
  confidence?: number;
}

export type OcrProgress = (stage: string, fraction: number) => void;

async function ocrImage(image: Blob | HTMLCanvasElement, onProgress?: OcrProgress): Promise<OcrResult> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => onProgress?.(m.status, m.progress ?? 0),
  });
  try {
    const { data } = await worker.recognize(image);
    return { text: data.text, engine: "tesseract.js", confidence: data.confidence };
  } finally {
    await worker.terminate();
  }
}

async function extractPdf(file: Blob, onProgress?: OcrProgress): Promise<OcrResult> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;

  // 1. Try the embedded text layer (digital PDFs from lab systems).
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Group items into lines by their y coordinate.
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items as { str: string; transform: number[] }[]) {
      if (!("str" in item)) continue;
      const y = Math.round(item.transform[5]);
      const row = rows.get(y) ?? [];
      row.push({ x: item.transform[4], s: item.str });
      rows.set(y, row);
    }
    const lines = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, r]) => r.sort((a, b) => a.x - b.x).map((c) => c.s).join("   "));
    pages.push(lines.join("\n"));
    onProgress?.("reading pdf text", p / doc.numPages);
  }
  const text = pages.join("\n\n");
  if (text.replace(/\s/g, "").length > 80) return { text, engine: "pdf-text", confidence: 99 };

  // 2. Scanned PDF: rasterise each page and OCR it.
  const texts: string[] = [];
  let conf = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
    const r = await ocrImage(canvas, (s, f) => onProgress?.(`page ${p}: ${s}`, f));
    texts.push(r.text);
    conf += r.confidence ?? 0;
  }
  return { text: texts.join("\n\n"), engine: "tesseract.js", confidence: conf / doc.numPages };
}

export async function extractText(file: Blob, fileName: string, onProgress?: OcrProgress): Promise<OcrResult> {
  const type = file.type || "";
  const name = fileName.toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return extractPdf(file, onProgress);
  if (type.startsWith("image/")) return ocrImage(file, onProgress);
  if (type.startsWith("text/") || name.endsWith(".txt")) return { text: await file.text(), engine: "none" };
  throw new Error("Unsupported file. Use a JPG, PNG, PDF or TXT lab report.");
}
