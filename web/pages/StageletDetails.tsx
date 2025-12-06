import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { db } from "../services/db";
import { Stagelet, BuildJob, Project } from "../types";
import StatusBadge from "../components/StatusBadge";
import EnvVarManager from "../components/EnvVarManager";
import { ExternalLink, RefreshCw, Terminal, Box, Shield, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const StageletDetails: React.FC = () => {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const [stagelet, setStagelet] = useState<Stagelet | null>(null);
	const [project, setProject] = useState<Project | null>(null);
	const [buildJob, setBuildJob] = useState<BuildJob | null>(null);
	const [activeTab, setActiveTab] = useState<"overview" | "logs" | "config">("overview");

	useEffect(() => {
		if (id) {
			const data = db.getStagelet(id);
			if (data) {
				setStagelet(data);
				setBuildJob(db.getMockLogs(id));

				const projectData = db.getProject(data.project_id);
				if (projectData) {
					setProject(projectData);
				}
			}
		}
	}, [id]);

	if (!stagelet) return <div>Loading...</div>;

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
				<div>
					<div className="flex items-center gap-3 mb-2">
						<h1 className="text-2xl font-bold text-white font-mono">{stagelet.subdomain_hash}</h1>
						<StatusBadge status={stagelet.status} />
					</div>
					<div className="flex items-center gap-4 text-sm text-zinc-400">
						<Link
							to={`/projects/${stagelet.project_id}`}
							className="hover:text-white transition-colors"
						>
							{project ? project.name : "Project"}
						</Link>
						<span>•</span>
						<span>PR #{stagelet.pr_number}</span>
						<span>•</span>
						<span className="font-mono">{stagelet.commit_hash}</span>
						<span>•</span>
						<span>{stagelet.branch_name}</span>
					</div>
				</div>
				<div className="flex items-center gap-3">
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button variant="destructive">Terminate</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
								<AlertDialogDescription>
									This action cannot be undone. This will permanently delete the stagelet
									<span className="font-mono text-white"> {stagelet.subdomain_hash}</span> and
									remove all associated data.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction
									onClick={() => {
										db.deleteStagelet(stagelet.id);
										navigate("/");
									}}
								>
									Yes, terminate stagelet
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
					<Button variant="outline">
						<RefreshCw className="w-4 h-4" /> Rebuild
					</Button>
					{stagelet.status === "ready" && (
						<a
							href={`https://${stagelet.subdomain_hash}.stagely.dev`} // This link won't work in reality
							target="_blank"
							rel="noopener noreferrer"
							className="px-4 py-2 bg-white text-zinc-950 hover:bg-zinc-200 rounded-md text-sm font-medium flex items-center gap-2 transition-colors"
						>
							<ExternalLink className="w-4 h-4" /> Visit Preview
						</a>
					)}
				</div>
			</div>

			{/* Tabs */}
			<div className="border-b border-zinc-800">
				<nav className="flex gap-6">
					{[
						{ id: "overview", icon: Box, label: "Overview" },
						{ id: "logs", icon: Terminal, label: "Build Logs" },
						{ id: "config", icon: Shield, label: "Configuration" },
					].map((tab) => (
						<Button
							key={tab.id}
							onClick={() => setActiveTab(tab.id as any)}
							variant="ghost"
							className={`flex items-center gap-2 rounded-none pb-4 border-b-2 transition-colors ${
								activeTab === tab.id
									? "border-white text-white"
									: "border-transparent text-zinc-400 hover:text-zinc-300"
							}`}
						>
							<tab.icon className="w-4 h-4" />
							{tab.label}
						</Button>
					))}
				</nav>
			</div>

			{/* Content */}
			<div className="min-h-[400px]">
				{activeTab === "overview" && (
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-4">
							<h3 className="font-medium text-white">Infrastructure</h3>
							<dl className="space-y-3 text-sm">
								<div className="flex justify-between">
									<dt className="text-zinc-500">VM IP Address</dt>
									<dd className="text-zinc-300 font-mono">{stagelet.vm_ip || "Provisioning..."}</dd>
								</div>
								<div className="flex justify-between">
									<dt className="text-zinc-500">Region</dt>
									<dd className="text-zinc-300">us-east-1</dd>
								</div>
								<div className="flex justify-between">
									<dt className="text-zinc-500">Instance Type</dt>
									<dd className="text-zinc-300">t3.medium</dd>
								</div>
								<div className="flex justify-between">
									<dt className="text-zinc-500">Created</dt>
									<dd className="text-zinc-300">
										{new Date(stagelet.created_at).toLocaleString()}
									</dd>
								</div>
							</dl>
						</div>
						<div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-4">
							<h3 className="font-medium text-white">Cost Estimation</h3>
							<div className="flex items-center gap-2">
								<span className="text-3xl font-bold text-white">
									${stagelet.estimated_cost_usd}
								</span>
								<span className="text-sm text-zinc-500">accumulated</span>
							</div>
							<p className="text-xs text-zinc-500">Based on instance runtime and egress data.</p>
						</div>
					</div>
				)}

				{activeTab === "logs" && (
					<div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden font-mono text-xs md:text-sm">
						<div className="bg-zinc-900 px-4 py-2 border-b border-zinc-800 flex items-center justify-between">
							<span className="text-zinc-400">
								build-{stagelet.commit_hash.substring(0, 7)}.log
							</span>
							<div className="flex items-center gap-2 text-zinc-500">
								<Clock className="w-3 h-3" />
								<span>{buildJob?.duration_seconds}s</span>
							</div>
						</div>
						<div className="p-4 overflow-y-auto max-h-[500px] space-y-1">
							{buildJob?.logs.map((log, i) => (
								<div key={i} className="flex gap-4">
									<span className="text-zinc-600 select-none shrink-0 w-32">
										{new Date(log.timestamp).toLocaleTimeString()}
									</span>
									<span
										className={`${
											log.text.includes("[error]")
												? "text-rose-400"
												: log.text.includes("[success]")
													? "text-emerald-400"
													: "text-zinc-300"
										}`}
									>
										{log.text}
									</span>
								</div>
							))}
							<div className="animate-pulse text-zinc-500">_</div>
						</div>
					</div>
				)}

				{activeTab === "config" && (
					<div className="space-y-6">
						<EnvVarManager
							level="stagelet"
							referenceId={stagelet.id}
							type="variable"
							title="Stagelet Variables"
							description="Variables overridden for this specific stagelet."
						/>
						<EnvVarManager
							level="stagelet"
							referenceId={stagelet.id}
							type="secret"
							title="Stagelet Secrets"
							description="Encrypted secrets overridden for this specific stagelet."
						/>

						<div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 opacity-75">
							<h3 className="text-lg font-medium text-white mb-2">Inheritance Info</h3>
							<p className="text-sm text-zinc-500">
								This stagelet also inherits configuration from{" "}
								<Link
									to={`/projects/${stagelet.project_id}`}
									className="text-blue-400 hover:underline"
								>
									Project
								</Link>{" "}
								and{" "}
								<Link to="/settings" className="text-blue-400 hover:underline">
									Team
								</Link>{" "}
								settings. Variables or Secrets with the same key defined here take precedence.
							</p>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

export default StageletDetails;
