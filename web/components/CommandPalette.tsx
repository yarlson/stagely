import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import {
	LayoutDashboard,
	FolderGit2,
	Settings,
	Users,
	FileText,
	Clock,
	DollarSign,
	Webhook,
	Box,
	Search,
} from "lucide-react";

interface CommandPaletteProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onOpenChange }) => {
	const navigate = useNavigate();

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				onOpenChange(!open);
			}
		};

		document.addEventListener("keydown", down);
		return () => document.removeEventListener("keydown", down);
	}, [open, onOpenChange]);

	const handleSelect = (callback: () => void) => {
		callback();
		onOpenChange(false);
	};

	// Mock data - in production, this would come from the database
	const recentStagelets = [
		{ id: "env_123", name: "PR #42: feature/new-api", project: "API Backend" },
		{
			id: "env_456",
			name: "PR #38: refactor/components",
			project: "Frontend App",
		},
		{
			id: "env_789",
			name: "PR #55: fix/memory-leak",
			project: "Worker Service",
		},
	];

	const projects = [
		{ id: "proj_1", name: "API Backend" },
		{ id: "proj_2", name: "Frontend App" },
		{ id: "proj_3", name: "Worker Service" },
		{ id: "proj_4", name: "Mobile API" },
	];

	return (
		<CommandDialog open={open} onOpenChange={onOpenChange}>
			<CommandInput placeholder="Type a command or search..." />
			<CommandList>
				<CommandEmpty>No results found.</CommandEmpty>

				<CommandGroup heading="Navigation">
					<CommandItem
						onSelect={() => handleSelect(() => navigate("/"))}
						className="cursor-pointer"
					>
						<LayoutDashboard className="mr-2 h-4 w-4" />
						<span>Dashboard</span>
					</CommandItem>
					<CommandItem
						onSelect={() => handleSelect(() => navigate("/projects"))}
						className="cursor-pointer"
					>
						<FolderGit2 className="mr-2 h-4 w-4" />
						<span>Projects</span>
					</CommandItem>
					<CommandItem
						onSelect={() => handleSelect(() => navigate("/build-queue"))}
						className="cursor-pointer"
					>
						<Clock className="mr-2 h-4 w-4" />
						<span>Build Queue</span>
					</CommandItem>
					<CommandItem
						onSelect={() => handleSelect(() => navigate("/cost-analytics"))}
						className="cursor-pointer"
					>
						<DollarSign className="mr-2 h-4 w-4" />
						<span>Cost Analytics</span>
					</CommandItem>
					<CommandItem
						onSelect={() => handleSelect(() => navigate("/team/members"))}
						className="cursor-pointer"
					>
						<Users className="mr-2 h-4 w-4" />
						<span>Team Members</span>
					</CommandItem>
					<CommandItem
						onSelect={() => handleSelect(() => navigate("/team/audit-logs"))}
						className="cursor-pointer"
					>
						<FileText className="mr-2 h-4 w-4" />
						<span>Audit Logs</span>
					</CommandItem>
					<CommandItem
						onSelect={() => handleSelect(() => navigate("/webhooks"))}
						className="cursor-pointer"
					>
						<Webhook className="mr-2 h-4 w-4" />
						<span>Webhooks</span>
					</CommandItem>
					<CommandItem
						onSelect={() => handleSelect(() => navigate("/settings"))}
						className="cursor-pointer"
					>
						<Settings className="mr-2 h-4 w-4" />
						<span>Settings</span>
					</CommandItem>
				</CommandGroup>

				<CommandSeparator />

				<CommandGroup heading="Recent Stagelets">
					{recentStagelets.map((stagelet) => (
						<CommandItem
							key={stagelet.id}
							onSelect={() => handleSelect(() => navigate(`/stagelets/${stagelet.id}`))}
							className="cursor-pointer"
						>
							<Box className="mr-2 h-4 w-4" />
							<div className="flex flex-col">
								<span className="text-sm">{stagelet.name}</span>
								<span className="text-xs text-zinc-500">{stagelet.project}</span>
							</div>
						</CommandItem>
					))}
				</CommandGroup>

				<CommandSeparator />

				<CommandGroup heading="Projects">
					{projects.map((project) => (
						<CommandItem
							key={project.id}
							onSelect={() => handleSelect(() => navigate(`/projects/${project.id}`))}
							className="cursor-pointer"
						>
							<FolderGit2 className="mr-2 h-4 w-4" />
							<span>{project.name}</span>
						</CommandItem>
					))}
				</CommandGroup>

				<CommandSeparator />

				<CommandGroup heading="Quick Actions">
					<CommandItem className="cursor-pointer">
						<Search className="mr-2 h-4 w-4" />
						<span>Search documentation...</span>
					</CommandItem>
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
};

export default CommandPalette;
