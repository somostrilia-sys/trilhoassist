import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { ProviderLayout } from "@/components/ProviderLayout";
import { ClientLayout } from "@/components/ClientLayout";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import ServiceRequests from "./pages/operation/ServiceRequests";
import NewServiceRequest from "./pages/operation/NewServiceRequest";
import ServiceRequestDetail from "./pages/operation/ServiceRequestDetail";
import WhatsAppQueue from "./pages/operation/WhatsAppQueue";
import WhatsAppMetrics from "./pages/operation/WhatsAppMetrics";
import DispatchPanel from "./pages/operation/DispatchPanel";
import UsersManagement from "./pages/settings/UsersManagement";
import PermissionsManagement from "./pages/settings/PermissionsManagement";
import Placeholder from "./pages/Placeholder";
import FinancialClosing from "./pages/finance/FinancialClosing";
import Billing from "./pages/finance/Billing";
import FinancialReports from "./pages/finance/FinancialReports";
import NotFound from "./pages/NotFound";
import RegisterProvider from "./pages/RegisterProvider";
import ProviderNavigation from "./pages/provider/ProviderNavigation";
import CollisionPublicView from "./pages/collision/CollisionPublicView";
import ProviderTracking from "./pages/tracking/ProviderTracking";
import BeneficiaryTracking from "./pages/tracking/BeneficiaryTracking";
import NpsSurvey from "./pages/nps/NpsSurvey";
import PublicServiceRequest from "./pages/public/PublicServiceRequest";
import ProviderDashboard from "./pages/provider/ProviderDashboard";
import ProviderServices from "./pages/provider/ProviderServices";
import ProviderFinancial from "./pages/provider/ProviderFinancial";
import ProviderInvoices from "./pages/provider/ProviderInvoices";
import ClientDashboard from "./pages/client/ClientDashboard";
import ClientRequests from "./pages/client/ClientRequests";
import ClientPlates from "./pages/client/ClientPlates";
import ClientReports from "./pages/client/ClientReports";
import ClientDispatches from "./pages/client/ClientDispatches";
import ClientBeneficiaries from "./pages/client/ClientBeneficiaries";
import ProvidersList from "./pages/network/ProvidersList";
import ProviderForm from "./pages/network/ProviderForm";
import ProviderBlacklist from "./pages/network/ProviderBlacklist";
import ClientsList from "./pages/business/ClientsList";
import ClientForm from "./pages/business/ClientForm";
import PlansList from "./pages/business/PlansList";
import PlanForm from "./pages/business/PlanForm";
import BeneficiariesList from "./pages/business/BeneficiariesList";
import BeneficiaryForm from "./pages/business/BeneficiaryForm";
import QuickRepliesSettings from "./pages/settings/QuickRepliesSettings";
import TemplatesSettings from "./pages/settings/TemplatesSettings";
import AjustesSettings from "./pages/settings/AjustesSettings";
import IntegrationsPage from "./pages/settings/IntegrationsPage";

const queryClient = new QueryClient();

// Handle SPA 404 redirect from public/404.html
function SpaRedirectHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    const redirectPath = sessionStorage.getItem('spa-redirect');
    if (redirectPath) {
      sessionStorage.removeItem('spa-redirect');
      navigate(redirectPath, { replace: true });
    }
  }, [navigate]);
  return null;
}

// Prevents "/" from redirecting to /dashboard when a spa-redirect is pending
const HomeRedirect = () => {
  const redirectPath = sessionStorage.getItem('spa-redirect');
  if (redirectPath) return null; // SpaRedirectHandler will handle navigation
  return <Navigate to="/dashboard" replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SpaRedirectHandler />
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/cadastro/prestador/:tenantSlug" element={<RegisterProvider />} />
            <Route path="/nav/:dispatchId" element={<ProviderNavigation />} />
            <Route path="/collision/:token" element={<CollisionPublicView />} />
            <Route path="/tracking/provider/:token" element={<ProviderTracking />} />
            <Route path="/tracking/:token" element={<BeneficiaryTracking />} />
            <Route path="/nps/:token" element={<NpsSurvey />} />
            <Route path="/solicitar" element={<PublicServiceRequest />} />
            <Route path="/" element={<HomeRedirect />} />
            
            {/* Provider Portal */}
            <Route element={<ProviderLayout />}>
              <Route path="/provider/dashboard" element={<ProviderDashboard />} />
              <Route path="/provider/services" element={<ProviderServices />} />
              <Route path="/provider/financial" element={<ProviderFinancial />} />
              <Route path="/provider/invoices" element={<ProviderInvoices />} />
            </Route>

            {/* Client/Association Portal */}
            <Route element={<ClientLayout />}>
              <Route path="/client/dashboard" element={<ClientDashboard />} />
              <Route path="/client/requests" element={<ClientRequests />} />
              <Route path="/client/reports" element={<ClientReports />} />
              <Route path="/client/beneficiaries" element={<ClientBeneficiaries />} />
              <Route path="/client/plates" element={<ClientPlates />} />
            </Route>

            {/* Admin/Operator Portal */}
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/operation/new" element={<NewServiceRequest />} />
              <Route path="/operation/requests" element={<ServiceRequests />} />
              <Route path="/operation/dispatch-panel" element={<DispatchPanel />} />
              <Route path="/operation/whatsapp" element={<WhatsAppQueue />} />
              <Route path="/operation/whatsapp/metrics" element={<WhatsAppMetrics />} />
              <Route path="/operation/requests/:id" element={<ServiceRequestDetail />} />
              <Route path="/business/clients" element={<ClientsList />} />
              <Route path="/business/clients/new" element={<ClientForm />} />
              <Route path="/business/clients/:id" element={<ClientForm />} />
              <Route path="/business/clients/:clientId/plans" element={<PlansList />} />
              <Route path="/business/clients/:clientId/plans/new" element={<PlanForm />} />
              <Route path="/business/clients/:clientId/plans/:planId" element={<PlanForm />} />
              <Route path="/business/beneficiaries" element={<BeneficiariesList />} />
              <Route path="/business/beneficiaries/new" element={<BeneficiaryForm />} />
              <Route path="/business/beneficiaries/:id" element={<BeneficiaryForm />} />
              <Route path="/network/providers" element={<ProvidersList />} />
              <Route path="/network/providers/new" element={<ProviderForm />} />
              <Route path="/network/providers/:id" element={<ProviderForm />} />
              <Route path="/network/blacklist" element={<ProviderBlacklist />} />
              <Route path="/finance/closing" element={<FinancialClosing />} />
              <Route path="/finance/billing" element={<Billing />} />
              <Route path="/finance/reports" element={<FinancialReports />} />
              <Route path="/settings/users" element={<UsersManagement />} />
              <Route path="/settings/permissions" element={<PermissionsManagement />} />
              <Route path="/settings/ajustes" element={<AjustesSettings />} />
              <Route path="/settings" element={<Navigate to="/settings/ajustes" replace />} />
              <Route path="/settings/quick-replies" element={<QuickRepliesSettings />} />
              <Route path="/settings/templates" element={<TemplatesSettings />} />
              <Route path="/integrations" element={<IntegrationsPage />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
