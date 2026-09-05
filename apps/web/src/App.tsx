import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { PatientsPage } from './pages/PatientsPage';
import { PatientNewPage } from './pages/PatientNewPage';
import { AppointmentsPage } from './pages/AppointmentsPage';
import { AppointmentNewPage } from './pages/AppointmentNewPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/patients" replace />} />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="patients/new" element={<PatientNewPage />} />
        <Route path="appointments" element={<AppointmentsPage />} />
        <Route path="appointments/new" element={<AppointmentNewPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
