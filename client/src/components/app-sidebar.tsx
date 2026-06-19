import { useLocation } from "wouter";
import { Link } from "wouter";
import { LayoutDashboard, Users, Music, Calendar, MapPin, FileText, Settings, BarChart2, ClipboardList, PhoneCall, Package } from "lucide-react";
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
import type { Customer, Piano } from "@shared/schema";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Clients", url: "/customers", icon: Users },
  { title: "Pianos", url: "/pianos", icon: Music },
  { title: "Calendar", url: "/calendar", icon: Calendar },
  { title: "Trip Planner", url: "/slc-schedule", icon: MapPin },
  { title: "Inspections", url: "/inspections", icon: ClipboardList },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Finances", url: "/finances", icon: BarChart2 },
  { title: "Inventory", url: "/inventory", icon: Package },
  { title: "Outreach", url: "/outreach", icon: PhoneCall },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const [location] = useLocation();

  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: pianos } = useQuery<Piano[]>({ queryKey: ["/api/pianos"] });

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
            <Music className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold tracking-tight text-[22px]">John Willis Piano</span>
            <span className="text-muted-foreground text-[16px]">Piano Client Software</span>
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
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                        {item.title === "Clients" && customers && (
                          <Badge variant="secondary" className="ml-auto no-default-active-elevate">
                            {customers.length}
                          </Badge>
                        )}
                        {item.title === "Pianos" && pianos && (
                          <Badge variant="secondary" className="ml-auto no-default-active-elevate">
                            {pianos.length}
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
