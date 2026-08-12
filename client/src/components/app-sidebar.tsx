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
} from "@/components/ui/sidebar";

/**
 * JWP circle-emblem logo (the official John Willis Piano logo, line-art version).
 * Drawn entirely in currentColor so it works on any background / theme.
 * "JWP" is Libre Baskerville Bold converted to outlines — no font dependency.
 */
function JwpEmblem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 600" fill="currentColor" className={className} aria-label="John Willis Piano logo">
      <clipPath id="jwp-emblem-clip">
        <circle cx="300" cy="300" r="265" />
      </clipPath>
      <circle cx="300" cy="300" r="272" fill="none" stroke="currentColor" strokeWidth="14" />
      <g clipPath="url(#jwp-emblem-clip)">
        {/* keybed rail */}
        <rect x="28" y="382" width="544" height="10" />
        {/* white-key dividers */}
        <rect x="79.9" y="392" width="5" height="200" />
        <rect x="134.3" y="392" width="5" height="200" />
        <rect x="188.7" y="392" width="5" height="200" />
        <rect x="243.1" y="392" width="5" height="200" />
        <rect x="297.5" y="392" width="5" height="200" />
        <rect x="351.9" y="392" width="5" height="200" />
        <rect x="406.3" y="392" width="5" height="200" />
        <rect x="460.7" y="392" width="5" height="200" />
        <rect x="515.1" y="392" width="5" height="200" />
        {/* black keys — real piano 2+3 grouping (band starts on B) */}
        <rect x="117.87" y="392" width="31.55" height="98.4" />
        <rect x="178.58" y="392" width="31.55" height="98.4" />
        <rect x="280.12" y="392" width="31.55" height="98.4" />
        <rect x="338.62" y="392" width="31.55" height="98.4" />
        <rect x="397.13" y="392" width="31.55" height="98.4" />
        <rect x="498.67" y="392" width="31.55" height="98.4" />
      </g>
      {/* JWP — Libre Baskerville Bold outlines */}
      <path
        transform="translate(125.98,262)"
        d="M3.124 36.92Q-9.514 36.92 -16.685 32.518Q-23.856 28.116 -23.856 21.442Q-23.856 17.324 -21.3 15.052Q-18.744 12.78 -14.768 12.78Q-11.076 12.78 -9.23 14.768Q-7.384 16.756 -4.828 20.874Q-2.414 24.424 -0.426 26.554Q1.562 28.684 5.254 28.684Q11.786 28.684 15.123 22.152Q18.46 15.62 18.46 3.266V-87.472Q18.46 -94.146 17.537 -97.483Q16.614 -100.82 13.703 -102.098Q10.792 -103.376 4.97 -103.66V-109.34H52.824V-103.66Q47.002 -103.518 44.091 -102.169Q41.18 -100.82 40.257 -97.27Q39.334 -93.72 39.334 -86.478V0.284Q39.334 18.034 30.175 27.477Q21.016 36.92 3.124 36.92Z M172.956 -84.774 190.848 -27.548 210.018 -82.36Q211.722 -87.188 212.574 -90.667Q213.426 -94.146 213.426 -96.56Q213.426 -100.962 210.373 -102.311Q207.32 -103.66 200.93 -103.66V-109.34H241.258V-103.66Q236.004 -103.66 231.602 -101.033Q227.2 -98.406 224.928 -92.158L190.706 1.42H178.068L153.36 -73.556L125.244 1.42H113.458L83.354 -81.508Q79.804 -91.306 76.751 -95.992Q73.698 -100.678 70.077 -102.098Q66.456 -103.518 60.918 -103.518V-109.34H114.594V-103.518Q107.494 -103.518 104.725 -102.169Q101.956 -100.82 101.956 -97.696Q101.956 -95.424 102.666 -93.081Q103.376 -90.738 105.506 -84.774L125.386 -27.548L148.39 -90.312Q146.544 -95.566 144.485 -98.193Q142.426 -100.82 139.515 -101.956Q136.604 -103.092 132.06 -103.518V-109.34H182.186V-103.518Q176.364 -103.518 173.453 -102.027Q170.542 -100.536 170.542 -96.276Q170.542 -94.146 171.181 -91.306Q171.82 -88.466 172.956 -84.774Z M345.628 -78.952Q345.628 -68.87 340.232 -61.841Q334.836 -54.812 324.47 -51.191Q314.104 -47.57 299.052 -47.57H286.982V-22.578Q286.982 -15.336 288.473 -11.715Q289.964 -8.094 294.366 -6.887Q298.768 -5.68 307.572 -5.68V0H251.198V-5.68Q257.588 -5.964 260.783 -7.171Q263.978 -8.378 265.043 -11.786Q266.108 -15.194 266.108 -21.868V-87.472Q266.108 -94.146 265.185 -97.483Q264.262 -100.82 261.422 -102.098Q258.582 -103.376 252.76 -103.66V-109.34H301.892Q323.476 -109.34 334.552 -101.601Q345.628 -93.862 345.628 -78.952ZM286.982 -98.974V-56.09H296.212Q309.844 -56.09 316.305 -61.699Q322.766 -67.308 322.766 -79.094Q322.766 -89.744 317.299 -95.566Q311.832 -101.388 300.472 -101.388H289.538Q286.982 -101.388 286.982 -98.974Z"
      />
    </svg>
  );
}
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
      <SidebarHeader className="px-4 pt-6 pb-4">
        <Link href="/" className="flex flex-col items-center gap-3 text-center">
          <img
            src="/jwp-logo-fallboard.png?v=4"
            alt="John Willis Piano logo"
            className="h-36 w-36 select-none"
            draggable={false}
          />
          <div className="flex flex-col gap-0.5">
            <span className="font-serif font-bold tracking-tight text-[20px] leading-tight">John Willis Piano</span>
            <span className="text-muted-foreground text-[13px] uppercase tracking-[0.18em]">Piano Booking System</span>
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
    </Sidebar>
  );
}
