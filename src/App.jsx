import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import JoinPage from './components/student/JoinPage';
import TeamPage from './components/student/TeamPage';
import TeacherApp from './components/teacher/TeacherApp';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<JoinPage />} />
        <Route path="/team/:teamId" element={<TeamPage />} />
        <Route path="/teacher" element={<TeacherApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
