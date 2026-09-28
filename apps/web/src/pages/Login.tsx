import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { DemoUser } from "../api";

const roleDescriptions: Record<DemoUser["role"], string> = {
  viewer: "Explore reviews and saved decisions",
  contributor: "Share feedback and draft decisions",
  maintainer: "Review, approve, and manage decisions",
};

export function LoginPage({ users, onLogin }: { users: DemoUser[]; onLogin: (id: string) => void }) {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(users.find((user) => user.role === "maintainer")?.id ?? users[0]?.id ?? "");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    onLogin(selectedId);
    navigate("/reviews", { replace: true });
  }

  return (
    <section className="login-page">
      <div className="login-story">
        <div className="login-brand"><span className="login-brand-mark">R</span> ReviewMind</div>
        <p className="login-kicker">Code review, with context</p>
        <h1>Good decisions deserve to be remembered.</h1>
        <p className="login-description">Review changes with the reasoning behind past decisions, scoped to where they still apply.</p>
        <div className="login-sample" aria-label="Example review context">
          <div className="login-sample-head"><span>REVIEW CONTEXT</span><span className="login-sample-status">● Remembered</span></div>
          <div className="login-sample-rule"><span className="login-rule-icon">↳</span><div><strong>transport-wrapper</strong><small>legacy adapter · temporary exception</small></div></div>
          <div className="login-sample-foot"><span>Decision 014</span><span>Scope checked</span></div>
        </div>
        <p className="login-synthetic-note">Synthetic demo workspace · democart-integrations</p>
      </div>

      <form className="login-panel" onSubmit={submit}>
        <div className="login-panel-heading">
          <p className="login-kicker">Welcome back</p>
          <h2>Choose your demo account</h2>
          <p>Continue with a seeded role to explore the workspace.</p>
        </div>
        <fieldset className="login-account-list">
          <legend>Demo accounts</legend>
          {users.map((user, index) => (
            <label className={`login-account${selectedId === user.id ? " is-selected" : ""}`} key={user.id}>
              <input
                type="radio"
                name="demo-account"
                value={user.id}
                checked={selectedId === user.id}
                onChange={() => setSelectedId(user.id)}
              />
              <span className={`login-avatar login-avatar-${user.role}`}>{user.name.charAt(0)}</span>
              <span className="login-account-copy"><strong>{user.name.replace(/ \([^)]*\)$/, "")}</strong><small>{roleDescriptions[user.role]}</small></span>
              <span className="login-account-role">{user.role}</span>
              <span className="login-account-number">0{index + 1}</span>
            </label>
          ))}
        </fieldset>
        <button className="login-submit" type="submit" disabled={!selectedId}>Continue to ReviewMind <span aria-hidden="true">→</span></button>
        <p className="login-disclaimer">Demo sign-in uses seeded identities. No password is required.</p>
      </form>
    </section>
  );
}