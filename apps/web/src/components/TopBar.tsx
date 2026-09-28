import { NavLink } from "react-router-dom";
import type { DemoUser } from "../api";

export function TopBar({
  repoName, users, currentUserId, onChangeUser, onLogout,
}: { repoName: string; users: DemoUser[]; currentUserId: string; onChangeUser: (id: string) => void; onLogout: () => void }) {
  return (
    <header className="topbar">
      <span className="brand">ReviewMind</span>
      <span>/ {repoName || "democart-integrations"}</span>
      <span className="badge">Synthetic demo</span>
      <nav>
        <NavLink to="/reviews" className={({ isActive }) => (isActive ? "active" : "")}>Reviews</NavLink>
        <NavLink to="/decisions" className={({ isActive }) => (isActive ? "active" : "")}>Decisions</NavLink>
        <NavLink to="/evaluation" className={({ isActive }) => (isActive ? "active" : "")}>Evaluation</NavLink>
      </nav>
      <div className="spacer" />
      <select value={currentUserId} onChange={(e) => onChangeUser(e.target.value)}>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name} — {u.role}</option>
        ))}
      </select>
      <button className="ghost topbar-logout" type="button" onClick={onLogout}>Sign out</button>
    </header>
  );
}
