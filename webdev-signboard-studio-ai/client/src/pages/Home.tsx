import { ArrowUpRight, FileUp, Layers3, Plus } from "lucide-react";

export default function Home() {
  return (
    <div className="library-shell">
      <header className="library-topbar">
        <a className="brand" href="/" aria-label="Signboard Studio home">
          <span className="brand-mark"><Layers3 size={20} /></span>
          <span>Signboard <strong>Studio</strong></span>
        </a>
        <span className="collection-label">Your design collection</span>
      </header>
      <main className="library-main">
        <section className="library-intro">
          <span className="eyebrow">Your design collection</span>
          <h1>Templates</h1>
          <p>Turn a PDF design into a template you can use again, or start a layout from scratch.</p>
        </section>
        <section className="choice-grid" aria-label="Choose how to start">
          <a className="choice-card upload-choice" href="/templates/new">
            <span className="choice-icon"><FileUp size={30} /></span>
            <div>
              <h2>Upload your template</h2>
              <p>Add your PDF, review the editable fields, then save your template.</p>
            </div>
            <span className="choice-action">Create template <ArrowUpRight size={17} /></span>
          </a>
          <a className="choice-card create-choice" href="/templates/create">
            <span className="choice-icon"><Plus size={30} /></span>
            <div>
              <h2>Create your own</h2>
              <p>Build a design with text, shapes, photos and AI-assisted drafting.</p>
            </div>
            <span className="choice-action">Open builder <ArrowUpRight size={17} /></span>
          </a>
        </section>
        <section className="library-process" aria-label="PDF template workflow">
          <span><b>01</b> Upload a PDF</span>
          <span><b>02</b> Review detected fields</span>
          <span><b>03</b> Save and reuse</span>
        </section>
      </main>
    </div>
  );
}
