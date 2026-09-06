import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { PatientsPage } from './pages/PatientsPage';
import { PatientNewPage } from './pages/PatientNewPage';
import { PatientEditPage } from './pages/PatientEditPage';
import { PatientProfilePage } from './pages/PatientProfilePage';
import { AppointmentsPage } from './pages/AppointmentsPage';
import { AppointmentNewPage } from './pages/AppointmentNewPage';
import { OpdListPage } from './pages/OpdListPage';
import { OpdNewPage } from './pages/OpdNewPage';
import { OpdVisitPage } from './pages/OpdVisitPage';
import { DoctorQueuePage } from './pages/DoctorQueuePage';
import { CaseBillingPage } from './pages/CaseBillingPage';
import { CashierPage } from './pages/CashierPage';
import { DepartmentWorklistPage } from './pages/DepartmentWorklistPage';
import { ServicesPage } from './pages/ServicesPage';

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
        <Route path="patients/:id" element={<PatientProfilePage />} />
        <Route path="patients/:id/edit" element={<PatientEditPage />} />
        <Route path="appointments" element={<AppointmentsPage />} />
        <Route path="appointments/new" element={<AppointmentNewPage />} />
        <Route path="opd" element={<OpdListPage />} />
        <Route path="opd/new" element={<OpdNewPage />} />
        <Route path="opd/:id" element={<OpdVisitPage />} />
        <Route path="queue" element={<DoctorQueuePage />} />
        <Route path="billing/pending" element={<CashierPage />} />
        <Route path="worklist" element={<DepartmentWorklistPage />} />
        <Route path="cases/:id/billing" element={<CaseBillingPage />} />
        <Route path="setup/services" element={<ServicesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
