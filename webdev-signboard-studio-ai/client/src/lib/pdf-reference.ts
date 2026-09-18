import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
export { referenceFileKind, type ReferenceFileKind } from "./reference-file";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

export type PreparedPdfPage = {
  preview: string;
  pageCount: number;
  pageIndex: number;
};

export async function preparePdfPage(bytes: Uint8Array, pageIndex: number): Promise<PreparedPdfPage> {
  const pdfDocument = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  try {
    if (pageIndex < 0 || pageIndex >= pdfDocument.numPages) {
      throw new Error("Choose a page in this PDF.");
    }

    const page = await pdfDocument.getPage(pageIndex + 1);
    const natural = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1600 / Math.max(natural.width, natural.height));
    const viewport = page.getViewport({ scale });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The PDF preview could not be prepared.");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const preview = canvas.toDataURL("image/jpeg", 0.86);
    if (preview.length > 5_700_000) {
      throw new Error("This page is too detailed for AI review. Export it at a smaller size and try again.");
    }

    return { preview, pageCount: pdfDocument.numPages, pageIndex };
  } finally {
    await pdfDocument.destroy();
  }
}
