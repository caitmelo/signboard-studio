import { useState } from "react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { AlertCircle, ArrowLeft, CheckCircle2, FileText, Layers3, LoaderCircle, Sparkles, Upload } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Draft = {
  background: string;
  notes: string[];
  elements: Array<{ kind: "text" | "image" | "rectangle" | "ellipse" | "line"; label: string; x: number; y: number; w: number; h: number; text: string; font: "sans" | "serif"; bold: boolean; italic: boolean; fontHeight: number; color: string; align: "left" | "center" | "right"; shape: "rectangle" | "square" | "circle" | "oval" | "rounded" }>;
};

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

function bounded(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export default function TemplateUpload() {
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [source, setSource] = useState<Uint8Array | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const status = trpc.designDraft.status.useQuery();
  const createDraft = trpc.designDraft.create.useMutation({
    onSuccess: (result) => { setDraft(result); setError(""); },
    onError: (reason) => setError(reason.message),
  });

  async function renderPage(bytes: Uint8Array, index: number) {
    setWorking(true);
    setError("");
    try {
      const pdfDocument = await pdfjs.getDocument({ data: bytes.slice() }).promise;
      if (index < 0 || index >= pdfDocument.numPages) throw new Error("Choose a page in this PDF.");
      const page = await pdfDocument.getPage(index + 1);
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
      const image = canvas.toDataURL("image/jpeg", 0.86);
      if (image.length > 5_700_000) throw new Error("This page is too detailed for AI review. Export it at a smaller size and try again.");
      setPreview(image);
      setPageCount(pdfDocument.numPages);
      setPageIndex(index);
    } catch (reason) {
      setPreview("");
      setError(reason instanceof Error ? reason.message : "The PDF could not be opened.");
    } finally {
      setWorking(false);
    }
  }

  async function chooseFile(file?: File) {
    if (!file) return;
    setDraft(null);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Choose a PDF design file.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError("Choose a PDF below 50 MB.");
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    setFileName(file.name);
    setSource(bytes);
    await renderPage(bytes, 0);
  }

  function analyse() {
    if (!preview) return;
    setError("");
    createDraft.mutate({ image: preview });
  }

  function openInBuilder() {
    if (!draft) return;
    try {
      const payload = JSON.stringify({
        draft,
        fileName,
        reference: preview.length < 3_500_000 ? preview : "",
      });
      sessionStorage.setItem("signboard-studio-import", payload);
    } catch {
      setError("The editable draft is ready, but could not be moved into the builder. Please start a new draft there.");
    }
  }

  return (
    <div className="intake-shell">
      <header className="library-topbar">
        <a className="brand" href="/" aria-label="Back to templates"><span className="brand-mark"><Layers3 size={20} /></span><span>Signboard <strong>Studio</strong></span></a>
        <a className="back-link" href="/"><ArrowLeft size={15} /> Templates</a>
      </header>
      <main className="intake-main">
        <section className="intake-copy">
          <span className="eyebrow">Template intake</span>
          <h1>Upload your template</h1>
          <p>Add a PDF design, choose its page, then review the editable draft before you save or reuse it.</p>
        </section>
        <div className="intake-layout">
          <section className="intake-card upload-panel">
            <div className="intake-heading"><span>01</span><div><h2>Choose a PDF</h2><p>PDF files up to 50 MB</p></div></div>
            <div className="pdf-dropzone pdf-upload-label">
              <Upload size={25} /><strong>{fileName || "Choose PDF template"}</strong><small>{fileName ? "Replace file" : "Select a design from your device"}</small>
              <input className="pdf-file-input" aria-label="Choose PDF template" type="file" accept="application/pdf,.pdf" onChange={(event) => void chooseFile(event.target.files?.[0])} />
            </div>
            {pageCount > 1 && <label className="page-picker">PDF page<select value={pageIndex} disabled={working} onChange={(event) => source && void renderPage(source, Number(event.target.value))}>{Array.from({ length: pageCount }, (_, index) => <option key={index} value={index}>Page {index + 1} of {pageCount}</option>)}</select></label>}
            <button className="analyse-pdf" type="button" onClick={analyse} disabled={!preview || working || createDraft.isPending || status.data?.available !== true}>{working || createDraft.isPending ? <><LoaderCircle className="spin" size={17} /> {working ? "Preparing page…" : "Detecting fields…"}</> : <><Sparkles size={17} /> Review editable fields</>}</button>
            <p className="intake-privacy"><CheckCircle2 size={15} /> PDF rendering happens in your browser; the server receives only the chosen page image for recognition.</p>
          </section>
          <section className="intake-card review-panel">
            <div className="intake-heading"><span>02</span><div><h2>Review detected fields</h2><p>{draft ? `${draft.elements.length} editable draft layers` : "Select a PDF to begin"}</p></div></div>
            {preview ? <div className="pdf-preview"><img src={preview} alt="Selected PDF page preview" /></div> : <div className="pdf-empty"><FileText size={28} /><p>Your selected PDF page will appear here.</p></div>}
            {draft && <div className="detected-fields"><h3>Detected editable fields</h3>{draft.elements.filter((element) => element.kind === "text").slice(0, 8).map((element, index) => <div className="field-result" key={`${element.label}-${index}`}><span>Text</span><strong>{element.text || element.label}</strong></div>)}{draft.elements.filter((element) => element.kind === "text").length === 0 && <p>No text fields were confidently detected. You can still create a manual design.</p>}</div>}
          </section>
        </div>
        {error && <div className="intake-error"><AlertCircle size={17} /> {error}</div>}
        {draft && <section className="save-template-card"><div><span className="eyebrow">03 Save and reuse</span><h2>Your template draft is ready to review</h2><p>Recognition preserves a first-pass map of text, images and shapes. Continue to the builder with this draft, then confirm every field before production use.</p></div><a href="/templates/create" className="continue-builder" onClick={openInBuilder}>Open in builder</a></section>}
      </main>
    </div>
  );
}
