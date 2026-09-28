import { useEffect, useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { TopBar } from "./components/TopBar";
import { ReviewsPage } from "./pages/Reviews";
import { DecisionsPage } from "./pages/Decisions";
import { EvaluationPage } from "./pages/Evaluation";
import { api, setCurrentUser, getCurrentUser, type DemoUser } from "./api";

export default function App() {
  const [repoId, setRepoId] = useState<string>("");
  const [repoName, setRepoName] = useState("");
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState(getCurrentUser());
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api.bootstrap()
      .then((b) => {
        setRepoId(b.repo_id);
        setRepoName(b.repo_name);
        setUsers(b.demo_users);
      })
      .catch((e) => setLoadError(e.message));
  }, []);

  function changeUser(id: string) {
    setCurrentUser(id);
    setCurrentUserId(id);
  }

  return (
    <HashRouter>
      <div className="app-shell">
        <TopBar repoName={repoName} users={users} currentUserId={currentUserId} onChangeUser={changeUser} />
        <main className="content">
          {loadError && (
            <div className="card" style={{ borderColor: "var(--danger)" }}>
              Could not reach the ReviewMind API at /api. Is <code>npm run dev -w apps/api</code> running? ({loadError})
            </div>
          )}
          {!loadError && !repoId && <p className="empty-state">Loading demo repository…</p>}
          {repoId && (
            <Routes>
              <Route path="/" element={<Navigate to="/reviews" replace />} />
              <Route path="/reviews" element={<ReviewsPage repoId={repoId} />} />
              <Route path="/decisions" element={<DecisionsPage repoId={repoId} />} />
              <Route path="/evaluation" element={<EvaluationPage repoId={repoId} />} />
            </Routes>
          )}
        </main>
      </div>
    </HashRouter>
  );
}
