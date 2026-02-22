import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ServiceRequests from "./pages/operation/ServiceRequests";
import NewServiceRequest from "./pages/operation/NewServiceRequest";
import Placeholder from "./pages/Placeholder";
import NotFound from "./pages/NotFound";

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
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/operation/new" element={<NewServiceRequest />} />
              <Route path="/operation/requests" element={<ServiceRequests />} />
              <Route path="/operation/requests/:id" element={<Placeholder />} />
              <Route path="/business/clients" element={<Placeholder />} />
              <Route path="/business/plans" element={<Placeholder />} />
              <Route path="/business/beneficiaries" element={<Placeholder />} />
              <Route path="/network/providers" element={<Placeholder />} />
              <Route path="/finance/closing" element={<Placeholder />} />
              <Route path="/finance/billing" element={<Placeholder />} />
              <Route path="/reports" element={<Placeholder />} />
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
