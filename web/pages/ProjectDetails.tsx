import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { db } from "../services/db";
import { Project, Stagelet } from "../types";
import StatusBadge from "../components/StatusBadge";
import EnvVarManager from "../components/EnvVarManager";
import {
	Github,
	FolderGit2,
	ArrowLeft,
	Box,
	Plus,
	GitPullRequest,
	GitBranch,
	GitCommit,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ProjectDetails: React.FC = () => {
	const { projectId } = useParams<{ projectId: string }>();
	const [project, setProject] = useState<Project | null>(null);
	const [stagelets, setStagelets] = useState<Stagelet[]>([]);
	const [activeTab, setActiveTab] = useState<"stagelets" | "config">("stagelets");
	const [isModalOpen, setIsModalOpen] = useState(false);

	// Stagelet Form State
	const [prNumber, setPrNumber] = useState("");
	const [branchName, setBranchName] = useState("");
	const [commitHash, setCommitHash] = useState("");

	useEffect(() => {
		if (projectId) {
			loadData();
		}
	}, [projectId]);

	const loadData = () => {
		if (projectId) {
			const proj = db.getProject(projectId);
			if (proj) {
				setProject(proj);
				setStagelets(db.getStagelets(projectId));
			}
		}
	};

	const handleCreateStagelet = (e: React.FormEvent) => {
		e.preventDefault();
		if (!projectId || !prNumber || !branchName || !commitHash) return;

		db.createStagelet({
			project_id: projectId,
			pr_number: parseInt(prNumber, 10),
			branch_name: branchName,
			commit_hash: commitHash,
		});

		loadData();
		setIsModalOpen(false);

		// Reset Form
		setPrNumber("");
		setBranchName("");
		setCommitHash("");
	};

	if (!project) return <div>Loading...</div>;

	return (
		<div className="space-y-6">
			<div>
				<Link
					to="/projects"
					className="text-zinc-500 hover:text-zinc-300 text-sm flex items-center gap-1 mb-4"
				>
					<ArrowLeft className="w-4 h-4" /> Back to Projects
				</Link>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-4">
						<div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
							<FolderGit2 className="w-8 h-8 text-zinc-100" />
						</div>
						<div>
							<h1 className="text-2xl font-bold text-white">{project.name}</h1>
							<a
								href={`https://${project.repo_url}`}
								target="_blank"
								rel="noreferrer"
								className="text-zinc-400 hover:text-white flex items-center gap-1 text-sm"
							>
								<Github className="w-3 h-3" /> {project.repo_url}
							</a>
						</div>
					</div>
					<Button onClick={() => setIsModalOpen(true)}>
						<Plus className="w-4 h-4" /> New Stagelet
					</Button>
				</div>
			</div>

			<div className="border-b border-zinc-800">
				<nav className="flex gap-6">
					<Button
						onClick={() => setActiveTab("stagelets")}
						variant="ghost"
						className={`flex items-center gap-2 rounded-none pb-4 border-b-2 transition-colors ${
							activeTab === "stagelets"
								? "border-white text-white"
								: "border-transparent text-zinc-400 hover:text-zinc-300"
						}`}
					>
						<Box className="w-4 h-4" />
						Stagelets
					</Button>
					<Button
						onClick={() => setActiveTab("config")}
						variant="ghost"
						className={`flex items-center gap-2 rounded-none pb-4 border-b-2 transition-colors ${
							activeTab === "config"
								? "border-white text-white"
								: "border-transparent text-zinc-400 hover:text-zinc-300"
						}`}
					>
						Configuration
					</Button>
				</nav>
			</div>

			{activeTab === "stagelets" && (
				<div className="space-y-4">
					<div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
						<div className="divide-y divide-zinc-800">
							{stagelets.length > 0 ? (
								stagelets.map((stagelet) => (
									<div
										key={stagelet.id}
										className="p-4 flex items-center justify-between hover:bg-zinc-800/50 transition-colors"
									>
										<div className="flex flex-col">
											<Link
												to={`/stagelets/${stagelet.id}`}
												className="text-sm font-medium text-white hover:underline flex items-center gap-2"
											>
												{stagelet.subdomain_hash}
												<span className="text-zinc-500 font-normal">
													• PR #{stagelet.pr_number}
												</span>
											</Link>
											<span className="text-xs text-zinc-500">{stagelet.branch_name}</span>
										</div>
										<div className="flex items-center gap-4">
											<span className="text-xs text-zinc-500 font-mono hidden sm:block">
												{new Date(stagelet.updated_at).toLocaleTimeString()}
											</span>
											<StatusBadge status={stagelet.status} size="sm" />
										</div>
									</div>
								))
							) : (
								<div className="p-8 text-center text-zinc-500">
									No active stagelets found for this project.
								</div>
							)}
						</div>
					</div>
				</div>
			)}

			{activeTab === "config" && (
				<div className="space-y-8">
					<EnvVarManager
						level="project"
						referenceId={project.id}
						type="variable"
						title="Project Variables"
						description="Variables available to all stagelets in this project."
					/>
					<EnvVarManager
						level="project"
						referenceId={project.id}
						type="secret"
						title="Project Secrets"
						description="Encrypted secrets available to all stagelets in this project."
					/>
				</div>
			)}

			<Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Create New Stagelet</DialogTitle>
					</DialogHeader>
					<form onSubmit={handleCreateStagelet} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="pr-number" className="text-xs">
								PR Number
							</Label>
							<div className="relative">
								<GitPullRequest className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 z-10" />
								<Input
									id="pr-number"
									type="number"
									required
									value={prNumber}
									onChange={(e) => setPrNumber(e.target.value)}
									placeholder="e.g. 42"
									className="pl-9"
								/>
							</div>
						</div>
						<div className="space-y-2">
							<Label htmlFor="branch-name" className="text-xs">
								Branch Name
							</Label>
							<div className="relative">
								<GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 z-10" />
								<Input
									id="branch-name"
									type="text"
									required
									value={branchName}
									onChange={(e) => setBranchName(e.target.value)}
									placeholder="e.g. feature/new-api"
									className="pl-9"
								/>
							</div>
						</div>
						<div className="space-y-2">
							<Label htmlFor="commit-hash" className="text-xs">
								Commit Hash
							</Label>
							<div className="relative">
								<GitCommit className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 z-10" />
								<Input
									id="commit-hash"
									type="text"
									required
									value={commitHash}
									onChange={(e) => setCommitHash(e.target.value)}
									placeholder="e.g. a1b2c3d"
									className="pl-9 font-mono"
								/>
							</div>
						</div>
						<div className="bg-zinc-800/50 p-3 rounded-md border border-zinc-800">
							<p className="text-xs text-zinc-400">
								Note: Stagelets are manually provisioned to optimize costs. Triggering a build here
								will create a new ephemeral environment for the specified Pull Request.
							</p>
						</div>
						<div className="flex justify-end pt-2">
							<Button type="submit">Create Stagelet</Button>
						</div>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
};

export default ProjectDetails;
