import { LayoutDashboard, Users, RefreshCw, UserPlus, Music, PhoneCall } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import type { Customer } from "@shared/schema";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Clients", url: "/customers", icon: Users },
  { title: "Call Center", url: "/call-center", icon: PhoneCall },
  { title: "Add Client", url: "/customers/new", icon: UserPlus },
  { title: "Sync Data", url: "/sync", icon: RefreshCw },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
            <Music className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight">PianoTech</span>
            <span className="text-xs text-muted-foreground">Customer Manager</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = item.url === "/"
                  ? location === "/"
                  : location.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild data-active={isActive}>
                      <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                        {item.title === "Clients" && customers && (
                          <Badge variant="secondary" className="ml-auto no-default-active-elevate">
                            {customers.length}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <p className="text-xs text-muted-foreground">
          Piano Technician Client Manager
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
