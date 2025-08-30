// Este archivo simplemente monta el componente principal que ya tienes en la raíz (`index.jsx`).
// Mantener el `index.jsx` original en la raíz te permite editar rápidamente el contenido que compartiste.

import React, { useState, Suspense } from "react";
import Landing from "./pages/Landing";
import StudentView from "./pages/StudentView";
const TeacherDashboard = React.lazy(() => import("./modules/TeacherDashboard"));

export default function App() {
  const [mode, setMode] = useState("landing"); // 'landing' | 'teacher' | 'student'
  const [classCode, setClassCode] = useState("");
  const [displayName, setDisplayName] = useState("");

  return (
    <div>
      {mode === "landing" && (
        <Landing
          onEnterTeacher={() => setMode("teacher")}
          onJoinStudent={(code, name) => {
            setClassCode(code);
            setDisplayName(name);
            setMode("student");
          }}
        />
      )}
      {mode === "student" && (
        <StudentView
          classCode={classCode}
          displayName={displayName}
          onBack={() => setMode("landing")}
        />
      )}
      {mode === "teacher" && (
        <Suspense fallback={<div>Loading...</div>}>
          <TeacherDashboard onClose={() => setMode("landing")} />
        </Suspense>
      )}
    </div>
  );
}
