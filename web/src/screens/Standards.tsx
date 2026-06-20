import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { Btn, Icon } from "../ui";

type StageDoc = {
  key: "agents" | "review" | "publish";
  title: string;
  file: string;
  hint: string;
  placeholder: string;
  save: (content: string) => Promise<unknown>;
};

const DOCS: StageDoc[] = [
  {
    key: "agents",
    title: "AGENTS.md",
    file: "AGENTS.md",
    hint: "Injected into every fix sandbox — how your team writes code",
    placeholder: "# House style\n\nHow your team works — TDD, commit format, testing norms, boundaries…",
    save: api.saveAgentsMd,
  },
  {
    key: "review",
    title: "review.md",
    file: "review.md",
    hint: "Drives the review stage — what should block a PR (needs the Review gate on)",
    placeholder: "# Review standards\n\nReject when… require tests for… watch for…",
    save: api.saveReviewMd,
  },
  {
    key: "publish",
    title: "publish.md",
    file: "publish.md",
    hint: "Drives the publish stage — how Argus writes the PR title and body",
    placeholder: "# PR conventions\n\nTitle format… body sections… what to include…",
    save: api.savePublishMd,
  },
];

export function Standards() {
  const [content, setContent] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [mark, setMark] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await api.standards();
      const next = { agents: s.agentsMd, review: s.reviewMd, publish: s.publishMd };
      setSaved(next);
      setContent((current) =>
        Object.fromEntries(DOCS.map((d) => [d.key, current[d.key] ?? next[d.key]])) as Record<string, string>,
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = async (doc: StageDoc) => {
    try {
      await doc.save(content[doc.key] ?? "");
      setSaved((s) => ({ ...s, [doc.key]: content[doc.key] ?? "" }));
      setMark(doc.key);
      setTimeout(() => setMark((m) => (m === doc.key ? null : m)), 1800);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="std">
      {error && <div className="fault">standards fault — {error}</div>}
      {DOCS.map((doc) => {
        const value = content[doc.key] ?? "";
        const dirty = value !== (saved[doc.key] ?? "");
        return (
          <div className="panel editor-wrap" key={doc.key}>
            <div className="panel-head">
              <div className="col" style={{ gap: 2 }}>
                <h3>{doc.title}</h3>
                <span className="muted" style={{ fontSize: 11.5 }}>{doc.hint}</span>
              </div>
              <div className="row gap10">
                {mark === doc.key && <span className="badge g"><Icon name="check" size={13} /> Saved</span>}
                <Btn kind="primary" sm icon="check" disabled={!dirty} onClick={() => void save(doc)}>Save</Btn>
              </div>
            </div>
            <textarea
              className="editor"
              value={value}
              onChange={(e) => setContent((c) => ({ ...c, [doc.key]: e.target.value }))}
              spellCheck={false}
              aria-label={`${doc.file} editor`}
              placeholder={doc.placeholder}
            />
          </div>
        );
      })}
    </div>
  );
}
