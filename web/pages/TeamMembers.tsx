import React, { useState, useEffect } from "react";
import { TeamMember, UserRole } from "../types";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../components/ui/dialog";
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
} from "../components/ui/alert-dialog";
import { Badge } from "../components/ui/badge";
import { UserPlus, Mail, Shield, Trash2, Crown } from "lucide-react";

const TeamMembers: React.FC = () => {
	const [members, setMembers] = useState<TeamMember[]>([]);
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteRole, setInviteRole] = useState<UserRole>("member");
	const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

	useEffect(() => {
		// Mock data - in production this would come from the database
		const mockMembers: TeamMember[] = [
			{
				id: "1",
				team_id: "team_1",
				user_id: "user_1",
				user: {
					id: "user_1",
					email: "john@acme.com",
					name: "John Doe",
					created_at: "2025-01-15T10:00:00Z",
				},
				role: "owner",
				created_at: "2025-01-15T10:00:00Z",
			},
			{
				id: "2",
				team_id: "team_1",
				user_id: "user_2",
				user: {
					id: "user_2",
					email: "sarah@acme.com",
					name: "Sarah Smith",
					created_at: "2025-02-10T14:30:00Z",
				},
				role: "admin",
				created_at: "2025-02-10T14:30:00Z",
			},
			{
				id: "3",
				team_id: "team_1",
				user_id: "user_3",
				user: {
					id: "user_3",
					email: "mike@acme.com",
					name: "Mike Johnson",
					created_at: "2025-03-01T09:15:00Z",
				},
				role: "member",
				created_at: "2025-03-01T09:15:00Z",
			},
		];
		setMembers(mockMembers);
	}, []);

	const handleInvite = () => {
		if (!inviteEmail) return;

		const newMember: TeamMember = {
			id: `member_${Date.now()}`,
			team_id: "team_1",
			user_id: `user_${Date.now()}`,
			user: {
				id: `user_${Date.now()}`,
				email: inviteEmail,
				name: inviteEmail.split("@")[0],
				created_at: new Date().toISOString(),
			},
			role: inviteRole,
			created_at: new Date().toISOString(),
		};

		setMembers([...members, newMember]);
		setInviteEmail("");
		setInviteRole("member");
		setIsInviteDialogOpen(false);
	};

	const handleRoleChange = (memberId: string, newRole: UserRole) => {
		setMembers(members.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)));
	};

	const handleRemoveMember = (memberId: string) => {
		setMembers(members.filter((m) => m.id !== memberId));
	};

	const getRoleBadge = (role: UserRole) => {
		const roleConfig = {
			owner: {
				icon: Crown,
				color: "text-yellow-500 bg-yellow-500/10 border-yellow-500/20",
			},
			admin: {
				icon: Shield,
				color: "text-purple-500 bg-purple-500/10 border-purple-500/20",
			},
			member: {
				icon: null,
				color: "text-blue-500 bg-blue-500/10 border-blue-500/20",
			},
			viewer: {
				icon: null,
				color: "text-zinc-500 bg-zinc-500/10 border-zinc-500/20",
			},
		};

		const config = roleConfig[role];
		const Icon = config.icon;

		return (
			<Badge variant="outline" className={config.color}>
				{Icon && <Icon className="w-3 h-3 mr-1" />}
				{role}
			</Badge>
		);
	};

	const getRoleDescription = (role: UserRole): string => {
		const descriptions = {
			owner: "Full control, can delete team",
			admin: "Manage projects, billing, members",
			member: "Create stagelets, view secrets",
			viewer: "Read-only access",
		};
		return descriptions[role];
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-white">Team Members</h1>
					<p className="text-zinc-400">Manage team access and permissions</p>
				</div>
				<Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
					<DialogTrigger asChild>
						<Button className="bg-blue-600 hover:bg-blue-700">
							<UserPlus className="w-4 h-4 mr-2" />
							Invite Member
						</Button>
					</DialogTrigger>
					<DialogContent className="bg-zinc-900 border-zinc-800">
						<DialogHeader>
							<DialogTitle className="text-white">Invite Team Member</DialogTitle>
							<DialogDescription className="text-zinc-400">
								Send an invitation to join your team
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-4 py-4">
							<div className="space-y-2">
								<Label htmlFor="email" className="text-zinc-300">
									Email Address
								</Label>
								<Input
									id="email"
									type="email"
									placeholder="colleague@company.com"
									value={inviteEmail}
									onChange={(e) => setInviteEmail(e.target.value)}
									className="bg-zinc-800 border-zinc-700 text-white"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="role" className="text-zinc-300">
									Role
								</Label>
								<Select
									value={inviteRole}
									onValueChange={(value) => setInviteRole(value as UserRole)}
								>
									<SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
										<SelectValue />
									</SelectTrigger>
									<SelectContent className="bg-zinc-800 border-zinc-700">
										<SelectItem value="admin">Admin - {getRoleDescription("admin")}</SelectItem>
										<SelectItem value="member">Member - {getRoleDescription("member")}</SelectItem>
										<SelectItem value="viewer">Viewer - {getRoleDescription("viewer")}</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => setIsInviteDialogOpen(false)}
								className="border-zinc-700 text-zinc-300"
							>
								Cancel
							</Button>
							<Button onClick={handleInvite} className="bg-blue-600 hover:bg-blue-700">
								<Mail className="w-4 h-4 mr-2" />
								Send Invitation
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>

			<div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
				<table className="w-full">
					<thead className="bg-zinc-800/50">
						<tr>
							<th className="text-left px-6 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
								Member
							</th>
							<th className="text-left px-6 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
								Role
							</th>
							<th className="text-left px-6 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
								Joined
							</th>
							<th className="text-right px-6 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
								Actions
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-zinc-800">
						{members.map((member) => (
							<tr key={member.id} className="hover:bg-zinc-800/30 transition-colors">
								<td className="px-6 py-4">
									<div className="flex items-center">
										<div className="h-10 w-10 rounded-full bg-zinc-800 flex items-center justify-center text-white font-medium">
											{member.user.name.charAt(0).toUpperCase()}
										</div>
										<div className="ml-4">
											<div className="text-sm font-medium text-white">{member.user.name}</div>
											<div className="text-xs text-zinc-400">{member.user.email}</div>
										</div>
									</div>
								</td>
								<td className="px-6 py-4">
									{member.role === "owner" ? (
										getRoleBadge(member.role)
									) : (
										<Select
											value={member.role}
											onValueChange={(value) => handleRoleChange(member.id, value as UserRole)}
										>
											<SelectTrigger className="w-32 bg-zinc-800 border-zinc-700 text-white h-8 text-xs">
												<SelectValue />
											</SelectTrigger>
											<SelectContent className="bg-zinc-800 border-zinc-700">
												<SelectItem value="admin">Admin</SelectItem>
												<SelectItem value="member">Member</SelectItem>
												<SelectItem value="viewer">Viewer</SelectItem>
											</SelectContent>
										</Select>
									)}
								</td>
								<td className="px-6 py-4 text-sm text-zinc-400">
									{new Date(member.created_at).toLocaleDateString("en-US", {
										year: "numeric",
										month: "short",
										day: "numeric",
									})}
								</td>
								<td className="px-6 py-4 text-right">
									{member.role !== "owner" && (
										<AlertDialog>
											<AlertDialogTrigger asChild>
												<Button
													variant="ghost"
													size="sm"
													className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
												>
													<Trash2 className="w-4 h-4" />
												</Button>
											</AlertDialogTrigger>
											<AlertDialogContent className="bg-zinc-900 border-zinc-800">
												<AlertDialogHeader>
													<AlertDialogTitle className="text-white">
														Remove Team Member
													</AlertDialogTitle>
													<AlertDialogDescription className="text-zinc-400">
														Are you sure you want to remove {member.user.name} from the team? They
														will immediately lose access to all projects and resources.
													</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter>
													<AlertDialogCancel className="border-zinc-700 text-zinc-300">
														Cancel
													</AlertDialogCancel>
													<AlertDialogAction onClick={() => handleRemoveMember(member.id)}>
														Remove Member
													</AlertDialogAction>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
				<h2 className="text-lg font-semibold text-white mb-4">Role Permissions</h2>
				<div className="space-y-3">
					{(["owner", "admin", "member", "viewer"] as UserRole[]).map((role) => (
						<div key={role} className="flex items-start gap-3">
							{getRoleBadge(role)}
							<p className="text-sm text-zinc-400">{getRoleDescription(role)}</p>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};

export default TeamMembers;
