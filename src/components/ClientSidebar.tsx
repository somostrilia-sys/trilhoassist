import {
  LayoutDashboard, FileText, Car, LogOut, BarChart3, Users, AlertCircle,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Building2 } from "lucide-react";

const menuItems = [
  { title: "Dashboard", url: "/client/dashboard", icon: LayoutDashboard },
  { title: "Acionamentos", url: "/client/dispatches", icon: AlertCircle, showBadge: true },
  { title: "Atendimentos", url: "/client/requests", icon: FileText },
  { title: "Relatórios", url: "/client/reports", icon: BarChart3 },
  { title: "Beneficiários", url: "/client/beneficiaries", icon: Users },
  { title: "Placas", url: "/client/plates", icon: Car },
];

export function ClientSidebar() {
  const { signOut, clientId } = useAuth();
  const navigate = useNavigate();

  // Fetch active dispatch count for badge
  const { data: activeCount = 0 } = useQuery({
    queryKey: ["client-active-count", clientId],
    queryFn: async () => {
      if (!clientId) return 0;
      const { count, error } = await supabase
        .from("service_requests")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .in("status", ["open", "awaiting_dispatch", "dispatched", "in_progress"]);
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!clientId,
    refetchInterval: 30000,
  });

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <Building2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-sidebar-primary">Portal Associação</span>
            <span className="text-xs text-sidebar-foreground/60">Relatórios & Veículos</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="flex items-center gap-2 px-2 py-2 text-sm rounded-md text-sidebar-foreground hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      <span className="flex-1">{item.title}</span>
                      {item.showBadge && activeCount > 0 && (
                        <span className="ml-auto inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                          {activeCount}
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2 border-t border-sidebar-border">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          <span>Sair</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
