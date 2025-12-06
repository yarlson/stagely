import React, { useState, useEffect } from "react";
import { AuditLog, AuditAction } from "../types";
import { Input } from "../components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Shield, User, Box, Key, Filter, Download, ChevronRight } from "lucide-react";

const AuditLogs: React.FC = () => {
	const [logs, setLogs] = useState<AuditLog[]>([]);
	const [filteredLogs, setFilteredLogs] = useState<AuditLog[]>([]);
	const [searchQuery, setSearchQuery] = useState("");
	const [actionFilter, setActionFilter] = useState<string>("all");
	const [resourceFilter, setResourceFilter] = useState<string>("all");

	useEffect(() => {
		// Mock data - in production this would come from the database
		const mockLogs: AuditLog[] = [
			{
				id: "1",
				actor_id: "user_1",
				actor_email: "john@acme.com",
				actor_ip: "203.0.113.45",
				action: "stagelet.deployed",
				resource_type: "stagelet",
				resource_id: "env_123",
				team_id: "team_1",
				project_id: "proj_1",
				metadata: { pr_number: 42, branch: "feature/new-api" },
				timestamp: "2025-12-06T14:30:00Z",
			},
			{
				id: "2",
				actor_id: "user_2",
				actor_email: "sarah@acme.com",
				actor_ip: "198.51.100.42",
				action: "secret.created",
				resource_type: "secret",
				resource_id: "secret_456",
				team_id: "team_1",
				project_id: "proj_1",
				metadata: { key: "DATABASE_URL", scope: "backend" },
				timestamp: "2025-12-06T13:15:00Z",
			},
			{
				id: "3",
				actor_id: "user_1",
				actor_email: "john@acme.com",
				actor_ip: "203.0.113.45",
				action: "user.added_to_team",
				resource_type: "user",
				resource_id: "user_3",
				team_id: "team_1",
				metadata: { invited_email: "mike@acme.com", role: "member" },
				timestamp: "2025-12-06T12:00:00Z",
			},
			{
				id: "4",
				actor_id: "user_2",
				actor_email: "sarah@acme.com",
				actor_ip: "198.51.100.42",
				action: "project.created",
				resource_type: "project",
				resource_id: "proj_2",
				team_id: "team_1",
				metadata: {
					name: "Frontend App",
					repo_url: "https://github.com/acme/frontend",
				},
				timestamp: "2025-12-06T11:30:00Z",
			},
			{
				id: "5",
				actor_id: "user_1",
				actor_email: "john@acme.com",
				actor_ip: "203.0.113.45",
				action: "stagelet.terminated",
				resource_type: "stagelet",
				resource_id: "env_789",
				team_id: "team_1",
				project_id: "proj_1",
				metadata: { pr_number: 38, reason: "pr_closed" },
				timestamp: "2025-12-06T10:45:00Z",
			},
			{
				id: "6",
				actor_id: "user_1",
				actor_email: "john@acme.com",
				actor_ip: "203.0.113.45",
				action: "secret.updated",
				resource_type: "secret",
				resource_id: "secret_101",
				team_id: "team_1",
				project_id: "proj_1",
				metadata: { key: "STRIPE_KEY", scope: "backend" },
				timestamp: "2025-12-06T09:20:00Z",
			},
		];
		setLogs(mockLogs);
		setFilteredLogs(mockLogs);
	}, []);

	useEffect(() => {
		let filtered = logs;

		// Filter by search query
		if (searchQuery) {
			filtered = filtered.filter(
				(log) =>
					log.actor_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
					log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
					log.resource_id.toLowerCase().includes(searchQuery.toLowerCase()),
			);
		}

		// Filter by action
		if (actionFilter !== "all") {
			filtered = filtered.filter((log) => log.action.startsWith(actionFilter));
		}

		// Filter by resource type
		if (resourceFilter !== "all") {
			filtered = filtered.filter((log) => log.resource_type === resourceFilter);
		}

		setFilteredLogs(filtered);
	}, [searchQuery, actionFilter, resourceFilter, logs]);

	const getActionColor = (action: AuditAction): string => {
		if (action.includes("created") || action.includes("deployed"))
			return "text-green-500 bg-green-500/10 border-green-500/20";
		if (action.includes("deleted") || action.includes("terminated"))
			return "text-red-500 bg-red-500/10 border-red-500/20";
		if (action.includes("updated") || action.includes("rebuilt"))
			return "text-blue-500 bg-blue-500/10 border-blue-500/20";
		return "text-zinc-500 bg-zinc-500/10 border-zinc-500/20";
	};

	const getResourceIcon = (resourceType: string) => {
		const icons = {
			user: User,
			stagelet: Box,
			secret: Key,
			project: Box,
			team: Shield,
		};
		return icons[resourceType as keyof typeof icons] || Box;
	};

	const handleExport = () => {
		// In production, this would trigger a CSV download
		const csv = [
			"Timestamp,Actor,Action,Resource Type,Resource ID,IP Address",
			...filteredLogs.map(
				(log) =>
					`${log.timestamp},${log.actor_email},${log.action},${log.resource_type},${log.resource_id},${log.actor_ip || "N/A"}`,
			),
		].join("\n");

		const blob = new Blob([csv], { type: "text/csv" });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `audit-logs-${new Date().toISOString()}.csv`;
		a.click();
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-white">Audit Logs</h1>
					<p className="text-zinc-400">Track all sensitive operations for compliance</p>
				</div>
				<Button onClick={handleExport} variant="outline" className="border-zinc-700 text-zinc-300">
					<Download className="w-4 h-4 mr-2" />
					Export to CSV
				</Button>
			</div>

			{/* Filters */}
			<div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
				<div className="flex items-center gap-2 mb-4">
					<Filter className="w-4 h-4 text-zinc-400" />
					<span className="text-sm font-medium text-zinc-300">Filters</span>
				</div>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					<Input
						placeholder="Search by email, action, or resource..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="bg-zinc-800 border-zinc-700 text-white"
					/>
					<Select value={actionFilter} onValueChange={setActionFilter}>
						<SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
							<SelectValue placeholder="All actions" />
						</SelectTrigger>
						<SelectContent className="bg-zinc-800 border-zinc-700">
							<SelectItem value="all">All actions</SelectItem>
							<SelectItem value="stagelet">Stagelet actions</SelectItem>
							<SelectItem value="secret">Secret actions</SelectItem>
							<SelectItem value="user">User actions</SelectItem>
							<SelectItem value="project">Project actions</SelectItem>
						</SelectContent>
					</Select>
					<Select value={resourceFilter} onValueChange={setResourceFilter}>
						<SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
							<SelectValue placeholder="All resources" />
						</SelectTrigger>
						<SelectContent className="bg-zinc-800 border-zinc-700">
							<SelectItem value="all">All resources</SelectItem>
							<SelectItem value="stagelet">Stagelets</SelectItem>
							<SelectItem value="secret">Secrets</SelectItem>
							<SelectItem value="user">Users</SelectItem>
							<SelectItem value="project">Projects</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Logs List */}
			<div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
				<div className="divide-y divide-zinc-800">
					{filteredLogs.length === 0 ? (
						<div className="p-8 text-center text-zinc-500">
							No audit logs found matching your filters.
						</div>
					) : (
						filteredLogs.map((log) => {
							const ResourceIcon = getResourceIcon(log.resource_type);
							return (
								<div key={log.id} className="p-4 hover:bg-zinc-800/50 transition-colors">
									<div className="flex items-start gap-4">
										<div className="flex-shrink-0 mt-1">
											<div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
												<ResourceIcon className="w-4 h-4 text-zinc-400" />
											</div>
										</div>
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2 mb-1">
												<Badge variant="outline" className={getActionColor(log.action)}>
													{log.action}
												</Badge>
												<Badge
													variant="outline"
													className="text-zinc-400 bg-zinc-800/50 border-zinc-700"
												>
													{log.resource_type}
												</Badge>
											</div>
											<div className="flex items-center gap-2 text-sm text-zinc-300 mb-1">
												<span className="font-medium">{log.actor_email}</span>
												<ChevronRight className="w-3 h-3 text-zinc-600" />
												<span className="font-mono text-xs text-zinc-500">{log.resource_id}</span>
											</div>
											{log.metadata && Object.keys(log.metadata).length > 0 && (
												<div className="text-xs text-zinc-500 font-mono">
													{Object.entries(log.metadata).map(([key, value]) => (
														<span key={key} className="mr-3">
															{key}: {JSON.stringify(value)}
														</span>
													))}
												</div>
											)}
										</div>
										<div className="flex-shrink-0 text-right">
											<div className="text-xs text-zinc-400">
												{new Date(log.timestamp).toLocaleString("en-US", {
													month: "short",
													day: "numeric",
													hour: "2-digit",
													minute: "2-digit",
												})}
											</div>
											{log.actor_ip && (
												<div className="text-xs text-zinc-600 font-mono mt-1">{log.actor_ip}</div>
											)}
										</div>
									</div>
								</div>
							);
						})
					)}
				</div>
			</div>

			{/* Retention Notice */}
			<div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-4 flex items-start gap-3">
				<Shield className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
				<div>
					<p className="text-sm text-blue-300 font-medium">Retention Policy</p>
					<p className="text-xs text-blue-400/70 mt-1">
						Audit logs are retained for 90 days for compliance purposes. Logs older than 90 days are
						automatically archived.
					</p>
				</div>
			</div>
		</div>
	);
};

export default AuditLogs;
