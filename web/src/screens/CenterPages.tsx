import { useState } from "react";
import { api, postManifestForm, setToken } from "../api";
import { Btn, EyeMark } from "../ui";

/* First-run connect ceremony — the first moment of ownership. */
export function FirstRun() {
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
    <div className="centerpage">
      <div className="cp-card">
        <div className="eye-wrap"><EyeMark size={72} live eyes={1} stroke={4} /></div>
        <h1>Open the watch.</h1>
        <p className="lede">This instance is yours and it isn't connected yet. Point Argus at GitHub and it starts watching for labeled issues.</p>
        <div className="cp-steps">
          <div className="cp-step"><span className="cps-n">1</span><span className="cps-t"><b>Connect GitHub</b><span className="cps-s">One click — a GitHub App manifest sets up the whole integration.</span></span></div>
          <div className="cp-step"><span className="cps-n">2</span><span className="cps-t"><b>Pick repos &amp; a trigger label</b><span className="cps-s">Choose what Argus watches and which label wakes it.</span></span></div>
          <div className="cp-step"><span className="cps-n">3</span><span className="cps-t"><b>Label an issue</b><span className="cps-s">Argus takes the watch from there.</span></span></div>
        </div>
        <Btn kind="primary" icon="git" onClick={() => void connect()} disabled={busy}>{busy ? "Summoning GitHub…" : "Connect GitHub"}</Btn>
        {error && <div className="fault mt16">console fault — {error}</div>}
        <p className="cp-foot">Self-hosted · brings your own Codex · no telemetry</p>
      </div>
    </div>
  );
}

/* Sign-in — token entry; magic links (/#token=…) sign in silently upstream. */
export function SignIn({ onSignIn }: { onSignIn: () => void }) {
  const [token, setTokenDraft] = useState("");
  const submit = () => {
    setToken(token.trim());
    onSignIn();
  };
  return (
    <div className="centerpage">
      <div className="cp-card">
        <div className="eye-wrap"><EyeMark size={64} live stroke={5} /></div>
        <h1>Argus</h1>
        <p className="lede">Sign in to this instance. A magic link signs you in silently — or paste the dashboard token below.</p>
        <form
          style={{ textAlign: "left" }}
          onSubmit={(e) => { e.preventDefault(); if (token.trim()) submit(); }}
        >
          <label className="c-label" htmlFor="tok">Dashboard token</label>
          <input
            id="tok"
            className="c-input"
            type="password"
            placeholder="ARGUS_DASHBOARD_TOKEN"
            value={token}
            onChange={(e) => setTokenDraft(e.target.value)}
            autoFocus
          />
          <div className="mt16"><Btn kind="primary" icon="key" disabled={!token.trim()} onClick={submit}>Sign in</Btn></div>
        </form>
        <p className="cp-foot">Token-gated · arrive via <span className="mono">/#token=…</span> to sign in silently</p>
      </div>
    </div>
  );
}
