import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
	LayoutDashboard,
	FolderGit2,
	Settings,
	Server,
	LogOut,
	Search,
	Users,
	FileText,
	Clock,
	DollarSign,
	Webhook,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import CommandPalette from "./CommandPalette";
import NotificationCenter from "./NotificationCenter";

interface LayoutProps {
	children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
	const location = useLocation();
	const [commandOpen, setCommandOpen] = useState(false);

	const isActive = (path: string) => {
		return location.pathname === path || location.pathname.startsWith(`${path}/`);
	};

	const navItems = [
		{
			icon: LayoutDashboard,
			label: "Dashboard",
			path: "/",
			section: "Platform",
		},
		{
			icon: FolderGit2,
			label: "Projects",
			path: "/projects",
			section: "Platform",
		},
		{
			icon: Clock,
			label: "Build Queue",
			path: "/build-queue",
			section: "Platform",
		},
		{
			icon: DollarSign,
			label: "Cost Analytics",
			path: "/cost-analytics",
			section: "Analytics",
		},
		{
			icon: Users,
			label: "Team Members",
			path: "/team/members",
			section: "Team",
		},
		{
			icon: FileText,
			label: "Audit Logs",
			path: "/team/audit-logs",
			section: "Team",
		},
		{
			icon: Webhook,
			label: "Webhooks",
			path: "/webhooks",
			section: "Configuration",
		},
		{
			icon: Settings,
			label: "Settings",
			path: "/settings",
			section: "Configuration",
		},
	];

	const sections = ["Platform", "Analytics", "Team", "Configuration"];

	return (
		<div className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
			{/* Sidebar */}
			<aside className="w-64 border-r border-zinc-800 bg-zinc-900/50 flex flex-col">
				<div className="p-6 flex items-center gap-3">
					<div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
						<Server className="w-5 h-5 text-white" />
					</div>
					<span className="font-bold text-lg tracking-tight">Stagely</span>
				</div>

				<nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
					{sections.map((section) => (
						<div key={section} className="mb-4">
							<div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-2">
								{section}
							</div>
							<div className="space-y-1">
								{navItems
									.filter((item) => item.section === section)
									.map((item) => (
										<Link
											key={item.path}
											to={item.path}
											className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
												isActive(item.path)
													? "bg-zinc-800 text-white"
													: "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
											}`}
										>
											<item.icon className="w-4 h-4" />
											{item.label}
										</Link>
									))}
							</div>
						</div>
					))}
				</nav>

				<div className="p-4 border-t border-zinc-800">
					<div className="flex items-center gap-3 px-2">
						<div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-medium">
							JD
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-sm font-medium text-white truncate">John Doe</p>
							<p className="text-xs text-zinc-500 truncate">john@acme.corp</p>
						</div>
						<Button variant="ghost" size="icon-sm">
							<LogOut className="w-4 h-4" />
						</Button>
					</div>
				</div>
			</aside>

			{/* Main Content */}
			<div className="flex-1 flex flex-col min-w-0 overflow-hidden">
				{/* Header */}
				<header className="h-16 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between px-6">
					<div className="flex items-center gap-4 flex-1">
						<button
							onClick={() => setCommandOpen(true)}
							className="relative w-96 flex items-center gap-3 px-3 py-2 text-sm bg-zinc-800/50 border border-zinc-700 rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
						>
							<Search className="w-4 h-4" />
							<span>Search or jump to...</span>
							<kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-1.5 font-mono text-[10px] font-medium text-zinc-400">
								<span className="text-xs">⌘</span>K
							</kbd>
						</button>
					</div>
					<div className="flex items-center gap-4">
						<NotificationCenter />
					</div>
				</header>

				{/* Page Content */}
				<main className="flex-1 overflow-y-auto p-6 scrollbar-hide">
					<div className="max-w-6xl mx-auto">{children}</div>
				</main>
			</div>

			{/* Command Palette */}
			<CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
		</div>
	);
};

export default Layout;
