"use client";
import {HtmlDownloadButton} from "@/components/html-download-button";
import {renderPythonEdgewrap} from "@/lib/python-engine";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, RotateCcw, Check, AlertCircle, FileCheck2, Layers2, Loader2, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { createJob, type Agent, type Template, type Job } from "@/lib/edgewrap";

const sample: Agent[] = [{ name: "Jason Cozens", phone: "0414 447 035" }, { name: "Kit Gillings", phone: "0406 752 708" }];

export default function Home() {
  const [agents, setAgents] = useState<Agent[]>(sample.map(a => ({ ...a })));
  const [count, setCount] = useState("2");
  const [guides, setGuides] = useState(true);
  const [template, setTemplate] = useState<Template | null>(null);
  const [loadError, setLoadError] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const [renderError, setRenderError] = useState("");
  const [rendering, setRendering] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const revision = useRef(0);

  useEffect(() => {
    fetch("/template/edgewrap.json").then(r => {
      if (!r.ok) throw new Error("The template could not be loaded. Please reload the page.");
      return r.json() as Promise<Template>;
    }).then(setTemplate).catch(e => { setLoadError(e.message); setRendering(false); });
  }, []);
  const job: Job | null = useMemo(() => template ? createJob(template, agents.slice(0, Number(count))) : null, [template, agents, count]);
  const [pdf,setPdf]=useState<Uint8Array<ArrayBuffer>|null>(null);
  useEffect(()=>{let active=true;setPdf(null);if(template&&job?.valid){setRendering(true);renderPythonEdgewrap(template,job).then(data=>{if(active)setPdf(new Uint8Array(data));}).catch(e=>{if(active){setRenderError(e.message);setRendering(false);}});}return()=>{active=false;};},[template,job]);

  useEffect(() => {
    setDownloaded(false);
    const current = ++revision.current;
    if (!pdf) { setRendering(false); return; }
    setRendering(true); setRenderError("");
    let task: { destroy: () => Promise<void> } | undefined;
    const timer = setTimeout(async () => {
      try {
        // Render exactly the PDF bytes offered for download.
        const pdfjsUrl = "/pdfjs/pdf.mjs";
        const pdfjs = await import(/* @vite-ignore */ pdfjsUrl);
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.mjs";
        const loading = pdfjs.getDocument({ data: pdf.slice(), useWasm: true, useWorkerFetch: true, wasmUrl: "/pdfjs/wasm/", iccUrl: "/template/colour/", isEvalSupported: false });
        task = loading;
        const document = await loading.promise;
        const page = await document.getPage(1);
        const viewport = page.getViewport({ scale: 1050 / page.getViewport({ scale: 1 }).width });
        const offscreen = window.document.createElement("canvas");
        offscreen.width = Math.ceil(viewport.width); offscreen.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: offscreen.getContext("2d"), canvas: offscreen, viewport }).promise;
        if (current === revision.current && canvas.current) {
          canvas.current.width = offscreen.width; canvas.current.height = offscreen.height;
          canvas.current.getContext("2d")?.drawImage(offscreen, 0, 0);
          setRendering(false);
        }
        await document.destroy();
      } catch {
        if (current === revision.current) { setRenderError("Preview could not load. You can still download and inspect the PDF."); setRendering(false); }
      }
    }, 200);
    return () => { clearTimeout(timer); task?.destroy().catch(() => {}); };
  }, [pdf]);

  function update(index: number, field: keyof Agent, value: string) {
    setAgents(current => current.map((agent, i) => i === index ? { ...agent, [field]: value } : agent));
  }
  function download() {
    if (!pdf) return;
    const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
    const link = document.createElement("a"); link.href = url;
    link.download = `Stone_6x4_Edgewrap_${count}_Agent${count === "2" ? "s" : ""}_Print.pdf`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); setDownloaded(true);
  }

  return <div className="studio">
    <header className="masthead"><a className="brand" href="/" aria-label="Edgewrap Studio home"><Layers2 size={23} strokeWidth={1.7} /><span>Signboard <strong>Studio</strong></span></a><span className="prototype-label">TEMPLATE TEST</span></header>
    <main className="workspace">
      <aside className="controls">
        <div className="section-heading"><span className="eyebrow">STONE / 01</span><h1>6 × 4 Edgewrap</h1><p>Change the details. Check the result.</p></div>
        <div className="template-summary"><ScanLine size={20} /><div><strong>For Sale · Portrait</strong><span>Reference artwork · Version 1</span></div></div>
        <section className="agent-section" aria-labelledby="agent-heading">
          <div className="section-title"><h2 id="agent-heading">Agent details</h2><Button variant="ghost" size="sm" onClick={() => { setAgents(sample.map(a => ({ ...a }))); setCount("2"); }} className="reset-button"><RotateCcw size={14} /> Reset</Button></div>
          <RadioGroup value={count} onValueChange={setCount} className="agent-choice" aria-label="Number of agents">{["1", "2"].map(value => <label key={value} className={count === value ? "choice selected" : "choice"}><RadioGroupItem value={value} /><span>{value === "1" ? "One agent" : "Two agents"}</span></label>)}</RadioGroup>
          <p className="field-note">{count === "1" ? "The agent’s details are centred automatically." : "Each agent keeps their original column position."}</p>
          {agents.slice(0, Number(count)).map((agent, i) => <fieldset className="agent-fields" key={i}>
            <legend>AGENT {i + 1}</legend>
            <label htmlFor={`name-${i}`}>Name</label><Input id={`name-${i}`} autoComplete="off" value={agent.name} onChange={e => update(i, "name", e.target.value)} maxLength={120} className="field-input" />
            <label htmlFor={`phone-${i}`}>Phone number</label><Input id={`phone-${i}`} type="tel" autoComplete="off" value={agent.phone} onChange={e => update(i, "phone", e.target.value)} maxLength={40} className="field-input" />
          </fieldset>)}
        </section>
        <div className={`fit-status ${job && !job.valid ? "has-error" : ""}`} role="status" aria-live="polite">
          {loadError ? <><AlertCircle size={18} /><p>{loadError}</p></> : !job ? <><Loader2 size={18} className="spin" /><p>Loading template…</p></> : job.valid ? <><Check size={18} /><div><strong>Details fit the design</strong><p>Original font sizes retained.</p></div></> : <><AlertCircle size={18} /><div><strong>Needs a quick adjustment</strong>{job.errors.map((e, i) => <p key={i}>{e}</p>)}</div></>}
        </div>
        <Button className="download-button" size="lg" disabled={!pdf} onClick={download}><ArrowDownToLine size={18} />{downloaded ? "Download PDF again" : "Download print PDF"}</Button>
        <HtmlDownloadButton className="download-button" disabled={!pdf} name={`Stone_6x4_Edgewrap_${count}_Agent${count === "2" ? "s" : ""}_Print`} getPdf={async()=>{if(!pdf)throw Error("Wait for the PDF to finish updating.");return pdf;}}/>
        <p className="download-note" aria-live="polite">{downloaded ? "Your 25% scale PDF is ready in your downloads." : "25% scale · CMYK · Bleed + registration squares"}</p>
      </aside>
      <section className="preview-section" aria-label="Generated signboard preview">
        <div className="preview-toolbar"><div><span className="eyebrow">PRINT PREVIEW</span><p>{rendering ? "Updating your PDF…" : job?.valid ? "Generated from your current details" : "Adjust details to update the preview"}</p></div><label className="guide-switch" htmlFor="guides"><Switch id="guides" checked={guides} onCheckedChange={setGuides} /><span>Show guides</span></label></div>
        <div className="preview-stage"><div className="board-wrapper">
          {guides && <div className="top-dimension"><span>1,350 mm including bleed</span></div>}
          <div className={`board ${job && !job.valid ? "invalid-board" : ""}`}>
            <canvas ref={canvas} aria-label="Preview of the generated Stone Edgewrap PDF" />
            {guides && <><div className="face-guide"><span className="face-label">VISIBLE FACE</span></div><span className="bleed-label">65 mm bleed</span></>}
            {(loadError || renderError) && <div className="preview-message"><AlertCircle size={24} /><p>{loadError || renderError}</p></div>}
            {!job && !loadError && <div className="preview-message"><Loader2 size={24} className="spin" /><p>Preparing the artwork…</p></div>}
            {job && !job.valid && <div className="blocked-label"><AlertCircle size={16} /> Last valid preview · export paused</div>}
            {rendering && job?.valid && <div className="rendering-label"><Loader2 size={14} className="spin" /> Updating</div>}
          </div>
          <div className="board-caption"><span>1220 × 1832 mm visible face</span><span>Scale 1:1 in PDF</span></div>
        </div></div>
        <div className="print-strip"><FileCheck2 size={21} /><div><strong>Built for Sprint’s Edgewrap specification</strong><p>1 page · 1350 × 1962 mm sheet · 65 mm bleed · Two 5 mm registration squares</p></div></div>
      </section>
    </main>
    <footer className="footer-note"><span>Test template: Stone 6×4 Edgewrap</span><p>This version changes agent names and numbers. A new design or photo layout needs its own template setup.</p><span>Guides appear only on screen.</span></footer>
  </div>;
}
