import React, { useEffect, useState } from "react";
import { db } from "../services/db";
import { Project } from "../types";
import { Link } from "react-router-dom";
import { FolderGit2, Plus, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ProjectList: React.FC = () => {
	const [projects, setProjects] = useState<Project[]>([]);
	const [isModalOpen, setIsModalOpen] = useState(false);

	// Form State
	const [name, setName] = useState("");
	const [repoUrl, setRepoUrl] = useState("");

	useEffect(() => {
		setProjects(db.getProjects());
	}, []);

	const handleCreateProject = (e: React.FormEvent) => {
		e.preventDefault();
		if (!name || !repoUrl) return;

		// Auto-generate slug from name
		const slug = name
			.toLowerCase()
			.replace(/\s+/g, "-")
			.replace(/[^a-z0-9-]/g, "");

		db.createProject({
			name,
			slug,
			repo_url: repoUrl,
			repo_provider: "github",
		});

		setProjects(db.getProjects());
		setIsModalOpen(false);

		// Reset form
		setName("");
		setRepoUrl("");
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-white">Projects</h1>
					<p className="text-zinc-400">Manage your connected repositories.</p>
				</div>
				<Button onClick={() => setIsModalOpen(true)}>
					<Plus className="w-4 h-4" /> New Project
				</Button>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				{projects.map((project) => (
					<Link
						key={project.id}
						to={`/projects/${project.id}`}
						className="group bg-zinc-900 border border-zinc-800 rounded-lg p-5 hover:border-zinc-600 transition-all duration-200 relative"
					>
						<Github className="absolute top-5 right-5 w-5 h-5 text-zinc-600" />

						<h3 className="text-lg font-semibold text-white mb-1 pr-8">{project.name}</h3>
						<p className="text-sm text-zinc-500 mb-4 truncate">{project.repo_url}</p>

						<div className="flex items-center gap-4 text-xs text-zinc-500 border-t border-zinc-800 pt-4">
							<span>{db.getStagelets(project.id).length} Stagelets</span>
						</div>
					</Link>
				))}

				<Button
					onClick={() => setIsModalOpen(true)}
					variant="outline"
					className="border-2 border-dashed h-full min-h-[180px] flex-col"
				>
					<Plus className="w-8 h-8" />
					<span className="text-sm font-medium">Add another project</span>
				</Button>
			</div>

			<Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Create New Project</DialogTitle>
					</DialogHeader>
					<form onSubmit={handleCreateProject} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="project-name" className="text-xs">
								Project Name
							</Label>
							<Input
								id="project-name"
								type="text"
								required
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="e.g. My Awesome API"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="repo-url" className="text-xs">
								Repository URL
							</Label>
							<div className="relative">
								<Github className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 z-10" />
								<Input
									id="repo-url"
									type="text"
									required
									value={repoUrl}
									onChange={(e) => setRepoUrl(e.target.value)}
									placeholder="github.com/org/repo"
									className="pl-9"
								/>
							</div>
						</div>
						<div className="flex justify-end pt-2">
							<Button type="submit">Create Project</Button>
						</div>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
};

export default ProjectList;
