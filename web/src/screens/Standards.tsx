import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Skill } from "../types";
import { Btn, Confirm, Icon, Modal, Toggle } from "../ui";

type Draft = { id?: string; name: string; description: string; content: string; isNew?: boolean };

export function Standards() {
  const [agentsMd, setAgentsMd] = useState("");
  const [savedBase, setSavedBase] = useState("");
  const [savedMark, setSavedMark] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [confirmDel, setConfirmDel] = useState<Skill | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = agentsMd !== savedBase;

  const refresh = useCallback(async () => {
    try {
      const standards = await api.standards();
      setSkills(standards.skills);
      setSavedBase((base) => {
        setAgentsMd((current) => (current === base ? standards.agentsMd : current));
        return standards.agentsMd;
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
      setError(null);
      await refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const saveAgents = async () => {
    if (await run(() => api.saveAgentsMd(agentsMd))) {
      setSavedBase(agentsMd);
      setSavedMark(true);
      setTimeout(() => setSavedMark(false), 1800);
    }
  };

  const saveSkill = async (draft: Draft) => {
    const payload = { name: draft.name.trim(), description: draft.description.trim() || undefined, content: draft.content };
    const ok = draft.isNew || !draft.id
      ? await run(() => api.createSkill(payload))
      : await run(() => api.updateSkill(draft.id!, payload));
    if (ok) setEditing(null);
  };

  return (
    <div className="std">
      {error && <div className="fault">standards fault — {error}</div>}

      <div className="panel editor-wrap">
        <div className="panel-head">
          <div className="col" style={{ gap: 2 }}>
            <h3>Operator AGENTS.md</h3>
            <span className="muted" style={{ fontSize: 11.5 }}>Injected into every fix sandbox</span>
          </div>
          <div className="row gap10">
            {savedMark && <span className="badge g"><Icon name="check" size={13} /> Saved</span>}
            <Btn kind="primary" sm icon="check" disabled={!dirty} onClick={() => void saveAgents()}>Save</Btn>
          </div>
        </div>
        <textarea
          className="editor"
          value={agentsMd}
          onChange={(e) => setAgentsMd(e.target.value)}
          spellCheck={false}
          aria-label="AGENTS.md editor"
          placeholder={"# House style\n\nHow your team works — commit format, testing norms, boundaries…"}
        />
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="col" style={{ gap: 2 }}>
            <h3>Skills</h3>
            <span className="muted" style={{ fontSize: 11.5 }}>{skills.filter((s) => s.enabled).length} of {skills.length} enabled</span>
          </div>
          <Btn sm icon="plus" onClick={() => setEditing({ name: "", description: "", content: "", isNew: true })}>New skill</Btn>
        </div>
        <div className="panel-pad">
          {skills.map((s) => (
            <div className={"skill-row" + (s.enabled ? "" : " disabled")} key={s.id}>
              <Icon name="spark" size={18} />
              <div className="sk-main">
                <div className="sk-name">
                  {s.name}
                  {!s.enabled && <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}>· disabled</span>}
                </div>
                <div className="sk-desc">{s.description || "No description."}</div>
              </div>
              <div className="sk-actions">
                <Toggle on={s.enabled} label={s.name} onClick={() => void run(() => api.updateSkill(s.id, { enabled: !s.enabled }))} />
                <Btn sm icon="edit" title="Edit" onClick={() => setEditing({ id: s.id, name: s.name, description: s.description ?? "", content: s.content })} />
                <Btn sm kind="danger" icon="trash" title="Delete" onClick={() => setConfirmDel(s)} />
              </div>
            </div>
          ))}
          {skills.length === 0 && (
            <p className="muted" style={{ fontSize: 13 }}>No skills yet. Add one to teach Argus a piece of your house style.</p>
          )}
        </div>
      </div>

      {editing && <SkillEditor draft={editing} onSave={(d) => void saveSkill(d)} onClose={() => setEditing(null)} />}
      <Confirm
        open={!!confirmDel}
        title={`Delete ${confirmDel?.name ?? ""}?`}
        body={<>This removes the skill from every future fix sandbox. This can't be undone.</>}
        confirmLabel="Delete skill"
        danger
        onConfirm={() => { if (confirmDel) void run(() => api.deleteSkill(confirmDel.id)).then(() => setConfirmDel(null)); }}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}

function SkillEditor({ draft, onSave, onClose }: { draft: Draft; onSave: (d: Draft) => void; onClose: () => void }) {
  const [d, setD] = useState(draft);
  const valid = d.name.trim().length > 0 && d.content.trim().length > 0;
  return (
    <Modal
      open
      lg
      title={draft.isNew ? "New skill" : "Edit skill"}
      onClose={onClose}
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn kind="primary" disabled={!valid} onClick={() => onSave(d)}>{draft.isNew ? "Create skill" : "Save changes"}</Btn>
      </>}
    >
      <label className="c-label">Name</label>
      <input className="c-input" placeholder="e.g. drizzle-migrations" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      <label className="c-label" style={{ marginTop: 16 }}>Description</label>
      <input className="c-input" placeholder="One line — when should Argus reach for this?" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
      <label className="c-label" style={{ marginTop: 16 }}>Markdown body</label>
      <textarea
        className="c-textarea"
        style={{ minHeight: 160 }}
        placeholder={"# Heading\nGuidance Argus should follow…"}
        value={d.content}
        onChange={(e) => setD({ ...d, content: e.target.value })}
        spellCheck={false}
      />
    </Modal>
  );
}
