import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Notification, NotificationType } from "../types";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
	Bell,
	CheckCircle2,
	XCircle,
	DollarSign,
	UserPlus,
	CheckCheck,
	Filter,
} from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../components/ui/select";

const Notifications: React.FC = () => {
	const [notifications, setNotifications] = useState<Notification[]>([]);
	const [filter, setFilter] = useState<"all" | "unread">("all");
	const navigate = useNavigate();

	useEffect(() => {
		// Mock notifications - in production, this would come from the database
		const mockNotifications: Notification[] = [
			{
				id: "notif_1",
				type: "stagelet.deployed",
				title: "Stagelet Deployed",
				message: "PR #42 is now live at abc123.stagely.dev",
				resource_id: "env_123",
				resource_type: "stagelet",
				is_read: false,
				created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
			},
			{
				id: "notif_2",
				type: "build.completed",
				title: "Build Completed",
				message: "API Backend build finished successfully (2m 34s)",
				resource_id: "job_456",
				resource_type: "build",
				is_read: false,
				created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
			},
			{
				id: "notif_3",
				type: "stagelet.failed",
				title: "Deployment Failed",
				message: "PR #38 deployment failed - container health check timeout",
				resource_id: "env_789",
				resource_type: "stagelet",
				is_read: true,
				created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
			},
			{
				id: "notif_4",
				type: "member.invited",
				title: "New Team Member",
				message: "Sarah Smith joined your team as Admin",
				is_read: true,
				created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
			},
			{
				id: "notif_5",
				type: "cost.threshold",
				title: "Cost Alert",
				message: "Monthly spend exceeded $50 threshold",
				is_read: true,
				created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
			},
			{
				id: "notif_6",
				type: "build.failed",
				title: "Build Failed",
				message: "Frontend App build failed - npm install error",
				resource_id: "job_789",
				resource_type: "build",
				is_read: true,
				created_at: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
			},
			{
				id: "notif_7",
				type: "stagelet.deployed",
				title: "Stagelet Deployed",
				message: "PR #55 is now live at def456.stagely.dev",
				resource_id: "env_456",
				resource_type: "stagelet",
				is_read: true,
				created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
			},
		];
		setNotifications(mockNotifications);
	}, []);

	const handleMarkAsRead = (notificationId: string) => {
		setNotifications(
			notifications.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n)),
		);
	};

	const handleMarkAllAsRead = () => {
		setNotifications(notifications.map((n) => ({ ...n, is_read: true })));
	};

	const handleNotificationClick = (notification: Notification) => {
		handleMarkAsRead(notification.id);
		if (notification.resource_type === "stagelet" && notification.resource_id) {
			navigate(`/stagelets/${notification.resource_id}`);
		}
	};

	const getNotificationIcon = (type: NotificationType) => {
		switch (type) {
			case "stagelet.deployed":
			case "build.completed":
				return <CheckCircle2 className="w-5 h-5 text-green-400" />;
			case "stagelet.failed":
			case "build.failed":
				return <XCircle className="w-5 h-5 text-red-400" />;
			case "member.invited":
				return <UserPlus className="w-5 h-5 text-blue-400" />;
			case "cost.threshold":
				return <DollarSign className="w-5 h-5 text-amber-400" />;
			default:
				return <Bell className="w-5 h-5 text-zinc-400" />;
		}
	};

	const getRelativeTime = (timestamp: string): string => {
		const now = new Date();
		const then = new Date(timestamp);
		const diffMs = now.getTime() - then.getTime();
		const diffSec = Math.floor(diffMs / 1000);

		if (diffSec < 60) return "just now";
		const diffMin = Math.floor(diffSec / 60);
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffHr = Math.floor(diffMin / 60);
		if (diffHr < 24) return `${diffHr}h ago`;
		const diffDay = Math.floor(diffHr / 24);
		return `${diffDay}d ago`;
	};

	const filteredNotifications =
		filter === "unread" ? notifications.filter((n) => !n.is_read) : notifications;

	const unreadCount = notifications.filter((n) => !n.is_read).length;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-white">Notifications</h1>
					<p className="text-zinc-400">Stay updated on your stagelets and team activity</p>
				</div>
				<div className="flex items-center gap-3">
					<Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
						<SelectTrigger className="w-32 bg-zinc-800 border-zinc-700 text-white">
							<SelectValue />
						</SelectTrigger>
						<SelectContent className="bg-zinc-800 border-zinc-700">
							<SelectItem value="all">All</SelectItem>
							<SelectItem value="unread">Unread ({unreadCount})</SelectItem>
						</SelectContent>
					</Select>
					{unreadCount > 0 && (
						<Button
							onClick={handleMarkAllAsRead}
							variant="outline"
							className="border-zinc-700 text-zinc-300"
						>
							<CheckCheck className="w-4 h-4 mr-2" />
							Mark all read
						</Button>
					)}
				</div>
			</div>

			{/* Notifications List */}
			<div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
				<div className="divide-y divide-zinc-800">
					{filteredNotifications.length === 0 ? (
						<div className="p-8 text-center text-zinc-500">
							<Bell className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
							<p className="text-sm">
								{filter === "unread" ? "No unread notifications" : "No notifications yet"}
							</p>
						</div>
					) : (
						filteredNotifications.map((notification) => (
							<div
								key={notification.id}
								onClick={() => handleNotificationClick(notification)}
								className={`p-5 hover:bg-zinc-800/30 transition-colors cursor-pointer ${
									!notification.is_read ? "bg-zinc-800/50" : ""
								}`}
							>
								<div className="flex items-start gap-4">
									<div className="flex-shrink-0 mt-1 w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
										{getNotificationIcon(notification.type)}
									</div>
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2 mb-1">
											<h3
												className={`text-base font-semibold ${
													!notification.is_read ? "text-white" : "text-zinc-400"
												}`}
											>
												{notification.title}
											</h3>
											{!notification.is_read && (
												<div className="w-2 h-2 bg-blue-500 rounded-full" />
											)}
										</div>
										<p
											className={`text-sm mb-2 ${
												!notification.is_read ? "text-zinc-300" : "text-zinc-500"
											}`}
										>
											{notification.message}
										</p>
										<div className="flex items-center gap-3">
											<span className="text-xs text-zinc-500">
												{getRelativeTime(notification.created_at)}
											</span>
											{notification.resource_type && (
												<Badge
													variant="outline"
													className="text-zinc-400 bg-zinc-800/50 border-zinc-700 text-xs"
												>
													{notification.resource_type}
												</Badge>
											)}
										</div>
									</div>
									{!notification.is_read && (
										<Button
											variant="ghost"
											size="sm"
											onClick={(e) => {
												e.stopPropagation();
												handleMarkAsRead(notification.id);
											}}
											className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
										>
											Mark read
										</Button>
									)}
								</div>
							</div>
						))
					)}
				</div>
			</div>

			{/* Info Box */}
			<div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-4 flex items-start gap-3">
				<Bell className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
				<div>
					<p className="text-sm text-blue-300 font-medium">Notification Settings</p>
					<p className="text-xs text-blue-400/70 mt-1">
						Configure which events trigger notifications in Settings. Email notifications can be
						enabled for critical events.
					</p>
				</div>
			</div>
		</div>
	);
};

export default Notifications;
