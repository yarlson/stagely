import { Team, Project, Stagelet, BuildJob, EnvVar, CloudProvider } from "../types";

// Seed Data
const SEED_TEAM: Team = {
	id: "team_1",
	name: "Acme Corp",
	slug: "acme-corp",
};

const SEED_PROJECTS: Project[] = [
	{
		id: "proj_1",
		team_id: "team_1",
		name: "Core API",
		slug: "core-api",
		repo_url: "github.com/acme/core-api",
		repo_provider: "github",
		cloud_provider_id: "cp_1",
	},
	{
		id: "proj_2",
		team_id: "team_1",
		name: "Web Dashboard",
		slug: "web-dashboard",
		repo_url: "github.com/acme/web-dashboard",
		repo_provider: "github",
		cloud_provider_id: "cp_1",
	},
];

const SEED_PROVIDERS: CloudProvider[] = [
	{
		id: "cp_1",
		name: "Production AWS",
		type: "aws",
		region: "us-east-1",
	},
];

const SEED_STAGELETS: Stagelet[] = [
	{
		id: "stg_1",
		project_id: "proj_1",
		pr_number: 42,
		branch_name: "feature/user-auth",
		commit_hash: "a1b2c3d",
		subdomain_hash: "auth-feat",
		status: "ready",
		vm_ip: "54.211.33.12",
		estimated_cost_usd: 1.24,
		created_at: new Date(Date.now() - 3600000 * 2).toISOString(), // 2 hours ago
		updated_at: new Date(Date.now() - 3600000 * 1).toISOString(),
		last_heartbeat_at: new Date().toISOString(),
	},
	{
		id: "stg_2",
		project_id: "proj_1",
		pr_number: 45,
		branch_name: "fix/billing-calculation",
		commit_hash: "e5f6g7h",
		subdomain_hash: "bill-fix",
		status: "building",
		estimated_cost_usd: 0.05,
		created_at: new Date(Date.now() - 300000).toISOString(), // 5 mins ago
		updated_at: new Date().toISOString(),
	},
	{
		id: "stg_3",
		project_id: "proj_2",
		pr_number: 102,
		branch_name: "feat/new-ui",
		commit_hash: "z9y8x7w",
		subdomain_hash: "new-ui",
		status: "failed",
		estimated_cost_usd: 0.12,
		created_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
		updated_at: new Date(Date.now() - 86000000).toISOString(),
	},
];

const SEED_LOGS: string[] = [
	"[info] Building Docker image...",
	"[info] Step 1/12 : FROM node:18-alpine",
	"[info] Step 2/12 : WORKDIR /app",
	"[info] Step 3/12 : COPY package*.json ./",
	"[info] Step 4/12 : RUN npm install",
	"[info] Installing dependencies...",
	"[info] Added 124 packages in 5s",
	"[info] Step 5/12 : COPY . .",
	"[info] Step 6/12 : RUN npm run build",
	"[info] Building production bundle...",
	"[info] Done in 14.2s",
	"[success] Build completed successfully",
	"[info] Pushing to internal registry...",
	"[info] Deploying to ephemeral VM...",
	"[info] Waiting for health checks...",
	"[success] Stagelet is ready!",
];

const SEED_ENV_VARS: EnvVar[] = [
	{
		id: "ev_1",
		key: "DATABASE_URL",
		value: "postgres://user:pass@db.prod:5432/main",
		scope: "global",
		level: "team",
		reference_id: "team_1",
		last_updated: new Date().toISOString(),
		type: "secret",
	},
	{
		id: "ev_2",
		key: "STRIPE_KEY",
		value: "sk_test_123456789",
		scope: "backend",
		level: "team",
		reference_id: "team_1",
		last_updated: new Date().toISOString(),
		type: "secret",
	},
	{
		id: "ev_3",
		key: "API_URL",
		value: "https://api.stagely.dev",
		scope: "frontend",
		level: "project",
		reference_id: "proj_2",
		last_updated: new Date().toISOString(),
		type: "variable",
	},
	{
		id: "ev_4",
		key: "NODE_ENV",
		value: "production",
		scope: "global",
		level: "team",
		reference_id: "team_1",
		last_updated: new Date().toISOString(),
		type: "variable",
	},
	{
		id: "ev_5",
		key: "FEATURE_FLAG_NEW_UI",
		value: "true",
		scope: "frontend",
		level: "stagelet",
		reference_id: "stg_1",
		last_updated: new Date().toISOString(),
		type: "variable",
	},
];

class MockDB {
	constructor() {
		this.init();
	}

	private init() {
		if (!localStorage.getItem("stagely_init_v2")) {
			localStorage.setItem("stagely_projects", JSON.stringify(SEED_PROJECTS));
			localStorage.setItem("stagely_stagelets", JSON.stringify(SEED_STAGELETS));
			localStorage.setItem("stagely_providers", JSON.stringify(SEED_PROVIDERS));
			localStorage.setItem("stagely_team", JSON.stringify(SEED_TEAM));
			localStorage.setItem("stagely_env_vars", JSON.stringify(SEED_ENV_VARS));
			localStorage.setItem("stagely_init_v2", "true");
		}
	}

	getTeam(): Team {
		return JSON.parse(localStorage.getItem("stagely_team") || "{}");
	}

	getProjects(): Project[] {
		return JSON.parse(localStorage.getItem("stagely_projects") || "[]");
	}

	getProject(id: string): Project | undefined {
		return this.getProjects().find((p) => p.id === id);
	}

	createProject(project: Omit<Project, "id" | "team_id">): Project {
		const projects = this.getProjects();
		const newProject: Project = {
			...project,
			id: `proj_${Date.now()}`,
			team_id: this.getTeam().id,
		};
		projects.push(newProject);
		localStorage.setItem("stagely_projects", JSON.stringify(projects));
		return newProject;
	}

	getStagelets(projectId?: string): Stagelet[] {
		const stagelets: Stagelet[] = JSON.parse(localStorage.getItem("stagely_stagelets") || "[]");
		if (projectId) {
			return stagelets.filter((e) => e.project_id === projectId);
		}
		return stagelets;
	}

	getStagelet(id: string): Stagelet | undefined {
		return this.getStagelets().find((e) => e.id === id);
	}

	createStagelet(
		data: Omit<
			Stagelet,
			| "id"
			| "status"
			| "vm_ip"
			| "estimated_cost_usd"
			| "created_at"
			| "updated_at"
			| "subdomain_hash"
		>,
	): Stagelet {
		const stagelets = this.getStagelets();
		const newStagelet: Stagelet = {
			...data,
			id: `stg_${Date.now()}`,
			status: "pending",
			subdomain_hash: Math.random().toString(36).substring(2, 10),
			estimated_cost_usd: 0,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		};
		stagelets.unshift(newStagelet); // Add to beginning
		localStorage.setItem("stagely_stagelets", JSON.stringify(stagelets));
		return newStagelet;
	}

	getProviders(): CloudProvider[] {
		return JSON.parse(localStorage.getItem("stagely_providers") || "[]");
	}

	saveProvider(provider: CloudProvider) {
		const providers = this.getProviders();
		providers.push({ ...provider, id: `cp_${Date.now()}` });
		localStorage.setItem("stagely_providers", JSON.stringify(providers));
	}

	getMockLogs(stageletId: string): BuildJob {
		// Generate deterministic logs based on ID
		return {
			id: `job_${stageletId}`,
			stagelet_id: stageletId,
			status: "completed",
			name: "build_amd64",
			duration_seconds: 145,
			logs: SEED_LOGS.map((text, i) => ({
				timestamp: new Date(Date.now() - (10000 - i * 1000)).toISOString(),
				stream: "stdout",
				text,
			})),
		};
	}

	deleteStagelet(id: string) {
		const stagelets = this.getStagelets().filter((e) => e.id !== id);
		localStorage.setItem("stagely_stagelets", JSON.stringify(stagelets));
	}

	// Env Vars Management (Variables & Secrets)
	getAllEnvVars(): EnvVar[] {
		return JSON.parse(localStorage.getItem("stagely_env_vars") || "[]");
	}

	getEnvVars(
		level: "team" | "project" | "stagelet",
		referenceId: string,
		type?: "secret" | "variable",
	): EnvVar[] {
		let vars = this.getAllEnvVars().filter(
			(s) => s.level === level && s.reference_id === referenceId,
		);
		if (type) {
			vars = vars.filter((s) => s.type === type);
		}
		return vars;
	}

	saveEnvVar(envVar: Omit<EnvVar, "id" | "last_updated">) {
		const vars = this.getAllEnvVars();
		const newVar: EnvVar = {
			...envVar,
			id: `ev_${Date.now()}`,
			last_updated: new Date().toISOString(),
		};
		vars.push(newVar);
		localStorage.setItem("stagely_env_vars", JSON.stringify(vars));
		return newVar;
	}

	deleteEnvVar(id: string) {
		const vars = this.getAllEnvVars().filter((s) => s.id !== id);
		localStorage.setItem("stagely_env_vars", JSON.stringify(vars));
	}
}

export const db = new MockDB();
