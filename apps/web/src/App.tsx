import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { PortalApp } from './portal/PortalApp';
import { PortalAdminPage } from './pages/PortalAdminPage';
import { CustomFieldsPage } from './pages/CustomFieldsPage';
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
import { ReportsPage } from './pages/ReportsPage';
import { ReportEntryPage } from './pages/ReportEntryPage';
import { ReportViewPage } from './pages/ReportViewPage';
import { LabTestsPage } from './pages/LabTestsPage';
import { ServicesPage } from './pages/ServicesPage';
import { BedBoardPage } from './pages/BedBoardPage';
import { AdmissionsPage } from './pages/AdmissionsPage';
import { AdmitPage } from './pages/AdmitPage';
import { AdmissionPage } from './pages/AdmissionPage';
import { WardSetupPage } from './pages/WardSetupPage';
import { MedicinesPage } from './pages/MedicinesPage';
import { StockPage } from './pages/StockPage';
import { DispensePage } from './pages/DispensePage';
import { FinancePage } from './pages/FinancePage';
import { ReferralsPage } from './pages/ReferralsPage';
import { AmbulancePage } from './pages/AmbulancePage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { BloodBankPage } from './pages/BloodBankPage';
import { FrontOfficePage } from './pages/FrontOfficePage';
import { IntegrationPage } from './pages/IntegrationPage';
import { RegistersPage } from './pages/RegistersPage';
import { HrPage } from './pages/HrPage';
import { InventoryPage } from './pages/InventoryPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/*
        The patient portal is deliberately outside ProtectedRoute. It has its
        own session, its own HTTP client and its own shell — a patient never
        passes through the staff guard, and a staff session grants nothing here.
      */}
      <Route path="/portal/*" element={<PortalApp />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="home" element={<HomePage />} />
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
        <Route path="beds" element={<BedBoardPage />} />
        <Route path="admissions" element={<AdmissionsPage />} />
        <Route path="admissions/new" element={<AdmitPage />} />
        <Route path="admissions/:id" element={<AdmissionPage />} />
        <Route path="billing/pending" element={<CashierPage />} />
        <Route path="worklist" element={<DepartmentWorklistPage />} />
        <Route path="pharmacy/medicines" element={<MedicinesPage />} />
        <Route path="pharmacy/stock" element={<StockPage />} />
        <Route path="pharmacy/dispense" element={<DispensePage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="finance/referrals" element={<ReferralsPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="hr" element={<HrPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="blood" element={<BloodBankPage />} />
        <Route path="ambulance" element={<AmbulancePage />} />
        <Route path="registers" element={<RegistersPage />} />
        <Route path="front-office" element={<FrontOfficePage />} />
        <Route path="integration" element={<IntegrationPage />} />
        <Route path="patient-portal" element={<PortalAdminPage />} />
        <Route path="setup/custom-fields" element={<CustomFieldsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="reports/order/:orderId" element={<ReportEntryPage />} />
        <Route path="reports/:id" element={<ReportViewPage />} />
        <Route path="cases/:id/billing" element={<CaseBillingPage />} />
        <Route path="setup/services" element={<ServicesPage />} />
        <Route path="setup/lab-tests" element={<LabTestsPage />} />
        <Route path="setup/wards" element={<WardSetupPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
