import React, { useState, useEffect } from "react";
import { BuildQueueItem } from "../types";
import { Badge } from "../components/ui/badge";
import { Clock, Cpu, Play, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

const BuildQueue: React.FC = () => {
	const [queueItems, setQueueItems] = useState<BuildQueueItem[]>([]);

	useEffect(() => {
		// Mock data - in production this would come from the database
		const mockQueue: BuildQueueItem[] = [
			{
				id: "job_1",
				workflow_run_id: "wf_1",
				name: "backend_amd64",
				architecture: "amd64",
				status: "running",
				stagelet_id: "env_123",
				project_name: "API Backend",
				pr_number: 42,
				queued_at: "2025-12-06T14:25:00Z",
				started_at: "2025-12-06T14:26:00Z",
			},
			{
				id: "job_2",
				workflow_run_id: "wf_1",
				name: "frontend_amd64",
				architecture: "amd64",
				status: "running",
				stagelet_id: "env_123",
				project_name: "API Backend",
				pr_number: 42,
				queued_at: "2025-12-06T14:25:00Z",
				started_at: "2025-12-06T14:26:00Z",
			},
			{
				id: "job_3",
				workflow_run_id: "wf_2",
				name: "app_amd64",
				architecture: "amd64",
				status: "provisioning",
				stagelet_id: "env_456",
				project_name: "Frontend App",
				pr_number: 38,
				queued_at: "2025-12-06T14:28:00Z",
				position_in_queue: 1,
			},
			{
				id: "job_4",
				workflow_run_id: "wf_3",
				name: "backend_arm64",
				architecture: "arm64",
				status: "queued",
				stagelet_id: "env_789",
				project_name: "Worker Service",
				pr_number: 55,
				queued_at: "2025-12-06T14:30:00Z",
				position_in_queue: 2,
			},
			{
				id: "job_5",
				workflow_run_id: "wf_4",
				name: "api_multi",
				architecture: "multi",
				status: "queued",
				stagelet_id: "env_101",
				project_name: "Mobile API",
				pr_number: 12,
				queued_at: "2025-12-06T14:31:00Z",
				position_in_queue: 3,
			},
			{
				id: "job_6",
				workflow_run_id: "wf_5",
				name: "backend_amd64",
				architecture: "amd64",
				status: "completed",
				stagelet_id: "env_202",
				project_name: "API Backend",
				pr_number: 40,
				queued_at: "2025-12-06T14:15:00Z",
				started_at: "2025-12-06T14:16:00Z",
			},
			{
				id: "job_7",
				workflow_run_id: "wf_6",
				name: "frontend_amd64",
				architecture: "amd64",
				status: "failed",
				stagelet_id: "env_303",
				project_name: "Dashboard",
				pr_number: 22,
				queued_at: "2025-12-06T14:10:00Z",
				started_at: "2025-12-06T14:11:00Z",
			},
		];
		setQueueItems(mockQueue);

		// Simulate live updates
		const interval = setInterval(() => {
			setQueueItems((prev) =>
				prev.map((item) => {
					if (item.status === "queued" && Math.random() > 0.7) {
						return {
							...item,
							status: "provisioning" as const,
							position_in_queue: undefined,
						};
					}
					if (item.status === "provisioning" && Math.random() > 0.6) {
						return {
							...item,
							status: "running" as const,
							started_at: new Date().toISOString(),
						};
					}
					return item;
				}),
			);
		}, 5000);

		return () => clearInterval(interval);
	}, []);

	const getStatusIcon = (status: BuildQueueItem["status"]) => {
		switch (status) {
			case "queued":
				return <Clock className="w-4 h-4 text-zinc-400" />;
			case "provisioning":
				return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
			case "running":
				return <Play className="w-4 h-4 text-amber-400" />;
			case "completed":
				return <CheckCircle2 className="w-4 h-4 text-green-400" />;
			case "failed":
				return <AlertCircle className="w-4 h-4 text-red-400" />;
		}
	};

	const getStatusColor = (status: BuildQueueItem["status"]): string => {
		switch (status) {
			case "queued":
				return "text-zinc-400 bg-zinc-800/50 border-zinc-700";
			case "provisioning":
				return "text-blue-400 bg-blue-500/10 border-blue-500/20";
			case "running":
				return "text-amber-400 bg-amber-500/10 border-amber-500/20";
			case "completed":
				return "text-green-400 bg-green-500/10 border-green-500/20";
			case "failed":
				return "text-red-400 bg-red-500/10 border-red-500/20";
		}
	};

	const getArchBadge = (arch: string) => {
		const colors = {
			amd64: "text-blue-400 bg-blue-500/10 border-blue-500/20",
			arm64: "text-purple-400 bg-purple-500/10 border-purple-500/20",
			multi: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
		};
		return (
			<Badge variant="outline" className={colors[arch as keyof typeof colors] || colors.amd64}>
				<Cpu className="w-3 h-3 mr-1" />
				{arch}
			</Badge>
		);
	};

	const getWaitTime = (queuedAt: string, startedAt?: string): string => {
		const queued = new Date(queuedAt);
		const now = startedAt ? new Date(startedAt) : new Date();
		const diffMs = now.getTime() - queued.getTime();
		const diffSec = Math.floor(diffMs / 1000);

		if (diffSec < 60) return `${diffSec}s`;
		const diffMin = Math.floor(diffSec / 60);
		if (diffMin < 60) return `${diffMin}m`;
		const diffHr = Math.floor(diffMin / 60);
		return `${diffHr}h ${diffMin % 60}m`;
	};

	const activeBuilds = queueItems.filter((i) => ["running", "provisioning"].includes(i.status));
	const queuedBuilds = queueItems.filter((i) => i.status === "queued");
	const recentCompletedBuilds = queueItems.filter((i) =>
		["completed", "failed"].includes(i.status),
	);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-white">Build Queue</h1>
				<p className="text-zinc-400">Monitor build progress and queue status</p>
			</div>

			{/* Stats */}
			<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
				<div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg">
					<div className="flex items-center justify-between mb-2">
						<span className="text-zinc-400 text-sm font-medium">Active Builds</span>
						<Play className="w-4 h-4 text-amber-500" />
					</div>
					<div className="text-2xl font-bold text-white">{activeBuilds.length}</div>
				</div>
				<div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg">
					<div className="flex items-center justify-between mb-2">
						<span className="text-zinc-400 text-sm font-medium">Queued</span>
						<Clock className="w-4 h-4 text-zinc-500" />
					</div>
					<div className="text-2xl font-bold text-white">{queuedBuilds.length}</div>
				</div>
				<div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg">
					<div className="flex items-center justify-between mb-2">
						<span className="text-zinc-400 text-sm font-medium">Completed (1h)</span>
						<CheckCircle2 className="w-4 h-4 text-green-500" />
					</div>
					<div className="text-2xl font-bold text-white">
						{recentCompletedBuilds.filter((i) => i.status === "completed").length}
					</div>
				</div>
				<div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg">
					<div className="flex items-center justify-between mb-2">
						<span className="text-zinc-400 text-sm font-medium">Failed (1h)</span>
						<AlertCircle className="w-4 h-4 text-red-500" />
					</div>
					<div className="text-2xl font-bold text-white">
						{recentCompletedBuilds.filter((i) => i.status === "failed").length}
					</div>
				</div>
			</div>

			{/* Active Builds */}
			{activeBuilds.length > 0 && (
				<div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
					<div className="p-4 border-b border-zinc-800">
						<h2 className="font-semibold text-white flex items-center gap-2">
							<Play className="w-4 h-4 text-amber-400" />
							Active Builds
						</h2>
					</div>
					<div className="divide-y divide-zinc-800">
						{activeBuilds.map((item) => (
							<div key={item.id} className="p-4 hover:bg-zinc-800/50 transition-colors">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-4 flex-1">
										{getStatusIcon(item.status)}
										<div className="flex flex-col">
											<div className="flex items-center gap-2">
												<Link
													to={`/stagelets/${item.stagelet_id}`}
													className="text-sm font-medium text-white hover:underline"
												>
													{item.project_name} - PR #{item.pr_number}
												</Link>
												<span className="text-xs text-zinc-500">→</span>
												<span className="text-xs text-zinc-400 font-mono">{item.name}</span>
											</div>
											<div className="flex items-center gap-2 mt-1">
												{getArchBadge(item.architecture)}
												<Badge variant="outline" className={getStatusColor(item.status)}>
													{item.status}
												</Badge>
											</div>
										</div>
									</div>
									<div className="text-right">
										<div className="text-xs text-zinc-500">
											Running for {getWaitTime(item.queued_at, item.started_at)}
										</div>
										{item.started_at && (
											<div className="text-xs text-zinc-600 font-mono mt-1">
												Started {new Date(item.started_at).toLocaleTimeString()}
											</div>
										)}
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Queue */}
			{queuedBuilds.length > 0 && (
				<div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
					<div className="p-4 border-b border-zinc-800">
						<h2 className="font-semibold text-white flex items-center gap-2">
							<Clock className="w-4 h-4 text-zinc-400" />
							Queue ({queuedBuilds.length})
						</h2>
					</div>
					<div className="divide-y divide-zinc-800">
						{queuedBuilds.map((item) => (
							<div key={item.id} className="p-4 hover:bg-zinc-800/50 transition-colors">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-4 flex-1">
										<div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-400">
											#{item.position_in_queue}
										</div>
										<div className="flex flex-col">
											<div className="flex items-center gap-2">
												<Link
													to={`/stagelets/${item.stagelet_id}`}
													className="text-sm font-medium text-white hover:underline"
												>
													{item.project_name} - PR #{item.pr_number}
												</Link>
												<span className="text-xs text-zinc-500">→</span>
												<span className="text-xs text-zinc-400 font-mono">{item.name}</span>
											</div>
											<div className="flex items-center gap-2 mt-1">
												{getArchBadge(item.architecture)}
												<Badge variant="outline" className={getStatusColor(item.status)}>
													{item.status}
												</Badge>
											</div>
										</div>
									</div>
									<div className="text-right">
										<div className="text-xs text-zinc-500">
											Waiting {getWaitTime(item.queued_at)}
										</div>
										<div className="text-xs text-zinc-600 font-mono mt-1">
											Queued {new Date(item.queued_at).toLocaleTimeString()}
										</div>
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Recent Builds */}
			{recentCompletedBuilds.length > 0 && (
				<div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
					<div className="p-4 border-b border-zinc-800">
						<h2 className="font-semibold text-white">Recent Builds (Last Hour)</h2>
					</div>
					<div className="divide-y divide-zinc-800">
						{recentCompletedBuilds.slice(0, 5).map((item) => (
							<div key={item.id} className="p-4 hover:bg-zinc-800/50 transition-colors">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-4 flex-1">
										{getStatusIcon(item.status)}
										<div className="flex flex-col">
											<div className="flex items-center gap-2">
												<Link
													to={`/stagelets/${item.stagelet_id}`}
													className="text-sm font-medium text-white hover:underline"
												>
													{item.project_name} - PR #{item.pr_number}
												</Link>
												<span className="text-xs text-zinc-500">→</span>
												<span className="text-xs text-zinc-400 font-mono">{item.name}</span>
											</div>
											<div className="flex items-center gap-2 mt-1">
												{getArchBadge(item.architecture)}
												<Badge variant="outline" className={getStatusColor(item.status)}>
													{item.status}
												</Badge>
											</div>
										</div>
									</div>
									<div className="text-right">
										<div className="text-xs text-zinc-500">
											Took {getWaitTime(item.queued_at, item.started_at)}
										</div>
										<div className="text-xs text-zinc-600 font-mono mt-1">
											{new Date(item.queued_at).toLocaleTimeString()}
										</div>
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{queueItems.length === 0 && (
				<div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
					<Clock className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
					<p className="text-zinc-400">No builds in queue</p>
				</div>
			)}
		</div>
	);
};

export default BuildQueue;
