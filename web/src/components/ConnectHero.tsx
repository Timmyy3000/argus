import { useState } from "react";
import { api, postManifestForm } from "../api";
import { Eye } from "./Eye";

export function ConnectHero() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const { postUrl, manifest } = await api.manifest();
      postManifestForm(postUrl, manifest);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <section className="hero">
      <div className="hero-eye">
        <Eye size={120} />
      </div>
      <h2 className="hero-title">Nothing under watch.</h2>
      <p className="hero-copy">
        Argus fixes GitHub issues while you sleep: label an issue, and it triages, patches, validates, and opens a
        pull request. Connect your GitHub account to begin — Argus will create its own GitHub App and take you
        straight to the repository picker.
      </p>
      <button className="hero-button" onClick={() => void connect()} disabled={busy}>
        {busy ? "Summoning GitHub…" : "Connect GitHub"}
      </button>
      {error && <p className="hero-error">{error}</p>}
      <ol className="hero-steps">
        <li>GitHub creates a private App owned by you</li>
        <li>You pick the repositories Argus may watch</li>
        <li>Label an issue <code>agent:fix</code> — Argus takes it from there</li>
      </ol>
    </section>
  );
}
