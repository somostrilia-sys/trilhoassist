import {
  LayoutDashboard, Headphones, Briefcase, Users, DollarSign,
  FileText, Settings, Link2, BarChart3, ChevronDown, Plus, List,
  Building2, UserCheck, Award, Network, Receipt, FileCheck, LogOut, Shield
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigate } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import logoTrilho from "@/assets/logo-trilho.png";

interface MenuItem {
  title: string;
  url: string;
  icon: any;
}

interface MenuSection {
  label: string;
  icon: any;
  collapsible: boolean;
  items: MenuItem[];
  module: string; // maps to role_permissions.module
}

const menuSections: MenuSection[] = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    collapsible: false,
    module: "dashboard",
    items: [{ title: "Visão Geral", url: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Operação",
    icon: Headphones,
    collapsible: true,
    module: "operation",
    items: [
      { title: "Novo Atendimento", url: "/operation/new", icon: Plus },
      { title: "Atendimentos", url: "/operation/requests", icon: List },
    ],
  },
  {
    label: "Negócio",
    icon: Briefcase,
    collapsible: true,
    module: "business",
    items: [
      { title: "Clientes", url: "/business/clients", icon: Building2 },
      { title: "Beneficiários", url: "/business/beneficiaries", icon: UserCheck },
    ],
  },
  {
    label: "Rede",
    icon: Network,
    collapsible: true,
    module: "network",
    items: [
      { title: "Prestadores", url: "/network/providers", icon: Users },
      { title: "Blacklist", url: "/network/blacklist", icon: Shield },
    ],
  },
  {
    label: "Financeiro",
    icon: DollarSign,
    collapsible: true,
    module: "finance",
    items: [
      { title: "Fechamento", url: "/finance/closing", icon: FileCheck },
      { title: "Faturamento", url: "/finance/billing", icon: Receipt },
      { title: "Relatórios", url: "/finance/reports", icon: BarChart3 },
    ],
  },
  {
    label: "Configurações",
    icon: Settings,
    collapsible: true,
    module: "settings",
    items: [
      { title: "Usuários", url: "/settings/users", icon: Users },
      { title: "Permissões", url: "/settings/permissions", icon: Shield },
      { title: "Configurações", url: "/settings", icon: Settings },
      { title: "Integrações", url: "/integrations", icon: Link2 },
    ],
  },
];

export function AppSidebar() {
  const { signOut } = useAuth();
  const { canAccessModule } = usePermissions();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const visibleSections = menuSections.filter((section) =>
    canAccessModule(section.module)
  );

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <img src={logoTrilho} alt="Trilho Soluções" className="h-10 w-10 rounded-lg object-contain bg-white/10 p-1" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-sidebar-primary">Trilho Soluções</span>
            <span className="text-xs text-sidebar-foreground/60">Gestão de Operações</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        {visibleSections.map((section) =>
          section.collapsible ? (
            <Collapsible key={section.label} className="group/collapsible">
              <SidebarGroup>
                <CollapsibleTrigger asChild>
                  <SidebarGroupLabel className="flex items-center justify-between cursor-pointer hover:bg-sidebar-accent rounded-md px-2 py-2 text-sidebar-foreground">
                    <div className="flex items-center gap-2">
                      <section.icon className="h-4 w-4" />
                      <span>{section.label}</span>
                    </div>
                    <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                  </SidebarGroupLabel>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {section.items.map((item) => (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton asChild>
                            <NavLink
                              to={item.url}
                              end
                              className="flex items-center gap-2 px-4 py-2 text-sm rounded-md text-sidebar-foreground hover:bg-sidebar-accent"
                              activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            >
                              <item.icon className="h-4 w-4" />
                              <span>{item.title}</span>
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          ) : (
            <SidebarGroup key={section.label}>
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          end
                          className="flex items-center gap-2 px-2 py-2 text-sm rounded-md text-sidebar-foreground hover:bg-sidebar-accent"
                          activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )
        )}
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
