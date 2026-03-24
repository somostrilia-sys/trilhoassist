import {
  LayoutDashboard, Headphones, Briefcase, Users, DollarSign,
  FileText, Settings, Link2, BarChart3, ChevronDown, Plus, List,
  Building2, UserCheck, Award, Network, Receipt, FileCheck, LogOut, Shield, MessageSquare, Zap, QrCode, Calculator
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
  onlyRoles?: string[]; // Show only for these roles
  hideRoles?: string[]; // Hide for these roles
}

interface MenuSection {
  label: string;
  icon: any;
  collapsible: boolean;
  items: MenuItem[];
  module: string;
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
      { title: "Painel de Acionamentos", url: "/operation/dispatch-panel", icon: BarChart3 },
      { title: "WhatsApp", url: "/operation/whatsapp", icon: MessageSquare },
      { title: "Métricas WhatsApp", url: "/operation/whatsapp/metrics", icon: BarChart3, onlyRoles: ["admin", "super_admin"] },
      { title: "Meu WhatsApp", url: "/integrations", icon: QrCode, hideRoles: ["admin", "super_admin"] },
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
      { title: "Dashboard Fin.", url: "/finance/dashboard", icon: BarChart3 },
      { title: "Fechamento Mensal", url: "/finance/fechamento", icon: FileCheck },
      { title: "Custos Operacionais", url: "/finance/custos", icon: DollarSign },
      { title: "Fechamento Prestadores", url: "/finance/fechamento-prestadores", icon: Calculator },
      { title: "Fechamento Legado", url: "/finance/closing", icon: FileCheck },
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
      { title: "Respostas Rápidas", url: "/settings/quick-replies", icon: Zap },
      { title: "Templates HSM", url: "/settings/templates", icon: FileText },
      { title: "Ajustes", url: "/settings/ajustes", icon: Settings },
      { title: "Integrações", url: "/integrations", icon: Link2 },
    ],
  },
];

export function AppSidebar() {
  const { signOut, roles } = useAuth();
  const { canAccessModule } = usePermissions();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const filterItems = (items: MenuItem[]) =>
    items.filter((item) => {
      if (item.onlyRoles && !item.onlyRoles.some((r) => roles.includes(r))) return false;
      if (item.hideRoles && item.hideRoles.some((r) => roles.includes(r))) return false;
      return true;
    });

  const visibleSections = menuSections
    .filter((section) => canAccessModule(section.module))
    .map((section) => ({ ...section, items: filterItems(section.items) }))
    .filter((section) => section.items.length > 0);

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/10 p-1.5 ring-1 ring-white/10 shadow-lg">
            <img src={logoTrilho} alt="Trilho Soluções" className="h-full w-full rounded-lg object-contain" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold text-sidebar-primary tracking-tight">Trilho Soluções</span>
            <span className="text-[11px] text-sidebar-foreground/50 font-medium">Gestão de Operações</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3 custom-scrollbar">
        {visibleSections.map((section) =>
          section.collapsible ? (
            <Collapsible key={section.label} defaultOpen className="group/collapsible">
              <SidebarGroup className="py-0.5">
                <CollapsibleTrigger asChild>
                  <SidebarGroupLabel className="flex items-center justify-between cursor-pointer hover:bg-sidebar-accent/60 rounded-lg px-2.5 py-2 text-sidebar-foreground/70 text-[11px] uppercase tracking-wider font-semibold transition-colors">
                    <div className="flex items-center gap-2">
                      <section.icon className="h-3.5 w-3.5" />
                      <span>{section.label}</span>
                    </div>
                    <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180 opacity-50" />
                  </SidebarGroupLabel>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarGroupContent className="mt-0.5">
                    <SidebarMenu>
                      {section.items.map((item) => (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton asChild>
                            <NavLink
                              to={item.url}
                              end
                              className="flex items-center gap-2.5 px-3 py-1.5 text-[13px] rounded-lg text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground transition-all duration-150"
                              activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                            >
                              <item.icon className="h-4 w-4 shrink-0" />
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
            <SidebarGroup key={section.label} className="py-0.5">
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          end
                          className="flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-lg text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground transition-all duration-150"
                          activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
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

      <SidebarFooter className="p-2.5 border-t border-sidebar-border">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2.5 text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground rounded-lg text-[13px] transition-all duration-150"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          <span>Sair</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
