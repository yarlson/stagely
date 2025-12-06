export interface Team {
	id: string;
	name: string;
	slug: string;
}

export interface Project {
	id: string;
	team_id: string;
	name: string;
	slug: string;
	repo_url: string;
	repo_provider: "github" | "gitlab";
	cloud_provider_id?: string;
}

export type StageletStatus =
	| "pending"
	| "building"
	| "deploying"
	| "ready"
	| "failed"
	| "terminated";

export interface Stagelet {
	id: string;
	project_id: string;
	pr_number: number;
	branch_name: string;
	commit_hash: string;
	subdomain_hash: string;
	status: StageletStatus;
	vm_ip?: string;
	estimated_cost_usd: number;
	created_at: string;
	updated_at: string;
	last_heartbeat_at?: string;
}

export interface BuildJob {
	id: string;
	stagelet_id: string;
	status: "queued" | "running" | "completed" | "failed";
	name: string; // e.g., 'backend_amd64'
	duration_seconds?: number;
	logs: LogLine[];
}

export interface LogLine {
	timestamp: string;
	stream: "stdout" | "stderr";
	text: string;
}

export interface EnvVar {
	id: string;
	key: string;
	value: string; // stored value (masked in UI if type is secret)
	scope: string; // 'global' or service name
	level: "team" | "project" | "stagelet";
	reference_id: string; // team_id, project_id, or stagelet_id
	last_updated: string;
	type: "secret" | "variable";
}

export interface CloudProvider {
	id: string;
	name: string;
	type: "aws" | "digitalocean" | "hetzner";
	region: string;
}

export type UserRole = "owner" | "admin" | "member" | "viewer";

export interface User {
	id: string;
	email: string;
	name: string;
	avatar_url?: string;
	created_at: string;
}

export interface TeamMember {
	id: string;
	team_id: string;
	user_id: string;
	user: User;
	role: UserRole;
	created_at: string;
}

export type AuditAction =
	| "secret.created"
	| "secret.updated"
	| "secret.deleted"
	| "secret.accessed"
	| "stagelet.deployed"
	| "stagelet.terminated"
	| "stagelet.rebuilt"
	| "user.added_to_team"
	| "user.removed_from_team"
	| "user.role_changed"
	| "project.created"
	| "project.deleted"
	| "project.updated";

export interface AuditLog {
	id: string;
	actor_id: string;
	actor_email: string;
	actor_ip?: string;
	action: AuditAction;
	resource_type: "team" | "project" | "stagelet" | "secret" | "user";
	resource_id: string;
	team_id: string;
	project_id?: string;
	metadata?: Record<string, any>;
	timestamp: string;
}

export interface BuildQueueItem {
	id: string;
	workflow_run_id: string;
	name: string;
	architecture: "amd64" | "arm64" | "multi";
	status: "queued" | "provisioning" | "running" | "completed" | "failed";
	stagelet_id: string;
	project_name: string;
	pr_number: number;
	queued_at: string;
	started_at?: string;
	position_in_queue?: number;
}

export interface CostBreakdown {
	date: string;
	total_cost: number;
	by_project: Array<{
		project_id: string;
		project_name: string;
		cost: number;
	}>;
	by_provider: Array<{
		provider_type: string;
		cost: number;
	}>;
}

export interface Webhook {
	id: string;
	project_id: string;
	url: string;
	events: Array<
		| "stagelet.deployed"
		| "stagelet.failed"
		| "stagelet.terminated"
		| "build.completed"
		| "build.failed"
	>;
	secret: string;
	is_active: boolean;
	last_triggered_at?: string;
	created_at: string;
}

export type NotificationType =
	| "stagelet.deployed"
	| "stagelet.failed"
	| "build.completed"
	| "build.failed"
	| "member.invited"
	| "cost.threshold";

export interface Notification {
	id: string;
	type: NotificationType;
	title: string;
	message: string;
	resource_id?: string;
	resource_type?: "stagelet" | "project" | "build";
	is_read: boolean;
	created_at: string;
}
