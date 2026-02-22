import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { ProviderLayout } from "@/components/ProviderLayout";
import { ClientLayout } from "@/components/ClientLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ServiceRequests from "./pages/operation/ServiceRequests";
import NewServiceRequest from "./pages/operation/NewServiceRequest";
import ServiceRequestDetail from "./pages/operation/ServiceRequestDetail";
import WhatsAppQueue from "./pages/operation/WhatsAppQueue";
import UsersManagement from "./pages/settings/UsersManagement";
import PermissionsManagement from "./pages/settings/PermissionsManagement";
import Placeholder from "./pages/Placeholder";
import FinancialClosing from "./pages/finance/FinancialClosing";
import Billing from "./pages/finance/Billing";
import FinancialReports from "./pages/finance/FinancialReports";
import NotFound from "./pages/NotFound";
import RegisterProvider from "./pages/RegisterProvider";
import ProviderNavigation from "./pages/provider/ProviderNavigation";
import ProviderDashboard from "./pages/provider/ProviderDashboard";
import ProviderServices from "./pages/provider/ProviderServices";
import ProviderFinancial from "./pages/provider/ProviderFinancial";
import ClientDashboard from "./pages/client/ClientDashboard";
import ClientRequests from "./pages/client/ClientRequests";
import ClientPlates from "./pages/client/ClientPlates";
import ProvidersList from "./pages/network/ProvidersList";
import ProviderForm from "./pages/network/ProviderForm";
import ProviderBlacklist from "./pages/network/ProviderBlacklist";
import ClientsList from "./pages/business/ClientsList";
import ClientForm from "./pages/business/ClientForm";
import PlansList from "./pages/business/PlansList";
import PlanForm from "./pages/business/PlanForm";
import BeneficiariesList from "./pages/business/BeneficiariesList";
import BeneficiaryForm from "./pages/business/BeneficiaryForm";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/cadastro/prestador/:tenantSlug" element={<RegisterProvider />} />
            <Route path="/nav/:dispatchId" element={<ProviderNavigation />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            
            {/* Provider Portal */}
            <Route element={<ProviderLayout />}>
              <Route path="/provider/dashboard" element={<ProviderDashboard />} />
              <Route path="/provider/services" element={<ProviderServices />} />
              <Route path="/provider/financial" element={<ProviderFinancial />} />
            </Route>

            {/* Client/Association Portal */}
            <Route element={<ClientLayout />}>
              <Route path="/client/dashboard" element={<ClientDashboard />} />
              <Route path="/client/requests" element={<ClientRequests />} />
              <Route path="/client/plates" element={<ClientPlates />} />
            </Route>

            {/* Admin/Operator Portal */}
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/operation/new" element={<NewServiceRequest />} />
              <Route path="/operation/requests" element={<ServiceRequests />} />
              <Route path="/operation/whatsapp" element={<WhatsAppQueue />} />
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
              <Route path="/settings" element={<Placeholder />} />
              <Route path="/integrations" element={<Placeholder />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
