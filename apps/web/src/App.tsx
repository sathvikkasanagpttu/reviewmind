import { useEffect, useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { TopBar } from "./components/TopBar";
import { ReviewsPage } from "./pages/Reviews";
import { DecisionsPage } from "./pages/Decisions";
import { EvaluationPage } from "./pages/Evaluation";
import { LoginPage } from "./pages/Login";
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
        if (!b.demo_users.some((user: DemoUser) => user.id === getCurrentUser())) {
          setCurrentUser("");
          setCurrentUserId("");
        }
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
        {currentUserId && <TopBar repoName={repoName} users={users} currentUserId={currentUserId} onChangeUser={changeUser} onLogout={() => changeUser("")} />}
        <main className="content">
          {loadError && (
            <div className="card" style={{ borderColor: "var(--danger)" }}>
              Could not reach the ReviewMind API at /api. Is <code>npm run dev -w apps/api</code> running? ({loadError})
            </div>
          )}
          {!loadError && !repoId && <p className="empty-state">Loading demo repository…</p>}
          {repoId && (
            <Routes>
              <Route path="/" element={<Navigate to={currentUserId ? "/reviews" : "/login"} replace />} />
              <Route path="/login" element={currentUserId ? <Navigate to="/reviews" replace /> : <LoginPage users={users} onLogin={changeUser} />} />
              <Route path="/reviews" element={currentUserId ? <ReviewsPage repoId={repoId} /> : <Navigate to="/login" replace />} />
              <Route path="/decisions" element={currentUserId ? <DecisionsPage repoId={repoId} /> : <Navigate to="/login" replace />} />
              <Route path="/evaluation" element={currentUserId ? <EvaluationPage repoId={repoId} /> : <Navigate to="/login" replace />} />
            </Routes>
          )}
        </main>
      </div>
    </HashRouter>
  );
}
