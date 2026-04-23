import { useState, useMemo } from "react";
import { LayoutDashboard, Users, RefreshCw, Music, Calendar, MapPin, FileText, Settings } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import type { Customer, Piano } from "@shared/schema";
import { formatPhone } from "@/lib/utils";
import { getServiceArea } from "@/lib/scheduling";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Clients", url: "/customers", icon: Users },
  { title: "Calendar", url: "/calendar", icon: Calendar },
  { title: "SLC Schedule", url: "/slc-schedule", icon: MapPin },
  { title: "Invoices", url: "/invoices", icon: FileText },
  { title: "Settings", url: "/settings", icon: Settings },
];

function getMonthsSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length < 2) return null;
  const month = parseInt(parts[0]) - 1;
  const day = parseInt(parts[1]);
  let year = parseInt(parts[2] ?? String(new Date().getFullYear()));
  if (year < 100) year += 2000;
  const date = new Date(year, month, day);
  if (isNaN(date.getTime())) return null;
  const now = new Date();
  return (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
}

export function AppSidebar() {
  const [location] = useLocation();
  const [shuffleSeed, setShuffleSeed] = useState(0);

  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: allPianos } = useQuery<Piano[]>({ queryKey: ["/api/pianos"] });

  const pianosByCustomer = useMemo(() => {
    const map = new Map<number, Piano>();
    if (allPianos) {
      const customerPianoMap = new Map<number, Piano[]>();
      allPianos.forEach((p) => {
        if (!customerPianoMap.has(p.customerId)) customerPianoMap.set(p.customerId, []);
        customerPianoMap.get(p.customerId)!.push(p);
      });
      customerPianoMap.forEach((pianosArr, custId) => {
        const activePiano = pianosArr.find(p => p.isActive !== false);
        if (activePiano) {
          map.set(custId, activePiano);
        } else if (pianosArr.length > 0) {
          map.set(custId, pianosArr[0]);
        }
      });
    }
    return map;
  }, [allPianos]);

  const bostonClients = useMemo(() => {
    if (!customers) return [];
    const pool = customers
      .filter(c => getServiceArea(c.city ?? "", c.state ?? "") === "Boston")
      .map(c => {
        const score = Math.max(getMonthsSince(c.lastContacted) ?? 999, getMonthsSince(c.lastTuned) ?? 999);
        const piano = pianosByCustomer.get(c.id);
        const pianoLabel = piano && (piano.make || piano.pianoType)
          ? [piano.make, piano.pianoType].filter(Boolean).join(" · ")
          : c.pianoType;
        return { ...c, score, pianoLabel };
      })
      .sort((a, b) => b.score - a.score);
    if (pool.length <= 3) return pool;
    const offset = (shuffleSeed * 3) % pool.length;
    const result: typeof pool = [];
    for (let i = 0; i < 3; i++) {
      result.push(pool[(offset + i) % pool.length]);
    }
    return result;
  }, [customers, pianosByCustomer, shuffleSeed]);

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

        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel className="flex items-center justify-between pr-2">
            <span>Call Center</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 -mr-1"
              onClick={() => setShuffleSeed(s => s + 1)}
              data-testid="button-shuffle-call-center"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {bostonClients.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-1" data-testid="text-no-starred">
                No Boston clients found
              </p>
            ) : (
              <div className="space-y-0.5 px-1">
                {bostonClients.map(c => (
                  <Link key={c.id} href={`/customers/${c.id}`}>
                    <div
                      className="flex items-start gap-2 text-xs rounded-md px-2 py-1.5 hover:bg-accent cursor-pointer"
                      data-testid={`call-center-client-${c.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-medium truncate block">{c.firstName} {c.lastName}</span>
                        <span className="text-muted-foreground truncate block text-[10px]">
                          {c.phone ? formatPhone(c.phone) : "No phone"}
                          {c.pianoLabel ? ` · ${c.pianoLabel}` : ""}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
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
