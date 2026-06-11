import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Skill } from "../types";

type Draft = { name: string; description: string; content: string };

const EMPTY_DRAFT: Draft = { name: "", description: "", content: "" };

export function StandardsPanel() {
  const [agentsMd, setAgentsMd] = useState("");
  const [agentsDirty, setAgentsDirty] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const standards = await api.standards();
      setSkills(standards.skills);
      setAgentsMd((current) => (agentsDirty ? current : standards.agentsMd));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [agentsDirty]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const flash = (message: string) => {
    setStatus(message);
    setTimeout(() => setStatus(null), 2500);
  };

  const saveAgents = async () => {
    try {
      await api.saveAgentsMd(agentsMd);
      setAgentsDirty(false);
      flash("AGENTS.md saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const saveDraft = async () => {
    if (!draft) return;
    try {
      if (editingId) {
        await api.updateSkill(editingId, {
          name: draft.name,
          description: draft.description || undefined,
          content: draft.content,
        });
        flash(`Skill "${draft.name}" updated`);
      } else {
        await api.createSkill({
          name: draft.name,
          description: draft.description || undefined,
          content: draft.content,
        });
        flash(`Skill "${draft.name}" created`);
      }
      setDraft(null);
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const removeSkill = async (skill: Skill) => {
    if (!window.confirm(`Delete skill "${skill.name}"?`)) return;
    try {
      await api.deleteSkill(skill.id);
      flash(`Skill "${skill.name}" deleted`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleSkill = async (skill: Skill) => {
    try {
      await api.updateSkill(skill.id, { enabled: !skill.enabled });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <aside className="panel standards">
      <h3 className="panel-title">Standards</h3>
      <p className="panel-hint">
        House rules for the agent. AGENTS.md and skills are written into every fix workspace — never committed, never
        in the PR.
      </p>

      {error && <div className="banner-error">standards fault — {error}</div>}
      {status && <div className="standards-flash">{status}</div>}

      <div className="panel-block">
        <span className="panel-label">AGENTS.md</span>
        <textarea
          className="standards-editor"
          rows={8}
          placeholder={"How your team works.\ne.g. Conventional commits. PRs need a test plan. Never bump deps in a fix."}
          value={agentsMd}
          onChange={(event) => {
            setAgentsMd(event.target.value);
            setAgentsDirty(true);
          }}
        />
        <button className="panel-button" disabled={!agentsDirty} onClick={() => void saveAgents()}>
          Save AGENTS.md
        </button>
      </div>

      <div className="panel-block">
        <span className="panel-label">
          skills <em>({skills.length})</em>
        </span>
        <ul className="skill-list">
          {skills.map((skill) => (
            <li key={skill.id} className={skill.enabled ? "" : "skill-disabled"}>
              <div className="skill-row">
                <span className="skill-name">{skill.name}</span>
                <span className="skill-actions">
                  <button onClick={() => void toggleSkill(skill)}>{skill.enabled ? "disable" : "enable"}</button>
                  <button
                    onClick={() => {
                      setEditingId(skill.id);
                      setDraft({ name: skill.name, description: skill.description ?? "", content: skill.content });
                    }}
                  >
                    edit
                  </button>
                  <button onClick={() => void removeSkill(skill)}>delete</button>
                </span>
              </div>
              {skill.description && <span className="skill-desc">{skill.description}</span>}
            </li>
          ))}
          {skills.length === 0 && <li className="repo-empty">no skills yet</li>}
        </ul>

        {draft ? (
          <div className="skill-form">
            <input
              placeholder="Skill name (e.g. Code Review)"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <input
              placeholder="One-line description shown to the agent"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
            <textarea
              rows={10}
              placeholder="Paste the SKILL.md markdown here"
              value={draft.content}
              onChange={(event) => setDraft({ ...draft, content: event.target.value })}
            />
            <div className="skill-form-actions">
              <button
                className="panel-button"
                disabled={!draft.name.trim() || !draft.content.trim()}
                onClick={() => void saveDraft()}
              >
                {editingId ? "Update skill" : "Add skill"}
              </button>
              <button
                onClick={() => {
                  setDraft(null);
                  setEditingId(null);
                }}
              >
                cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="panel-button" onClick={() => setDraft(EMPTY_DRAFT)}>
            + New skill
          </button>
        )}
      </div>
    </aside>
  );
}
