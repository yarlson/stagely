import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Notification, NotificationType } from "../types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCircle2, XCircle, DollarSign, UserPlus, CheckCheck } from "lucide-react";

const NotificationCenter: React.FC = () => {
	const [notifications, setNotifications] = useState<Notification[]>([]);
	const [isOpen, setIsOpen] = useState(false);
	const navigate = useNavigate();

	useEffect(() => {
		// Mock notifications - in production, this would come from the database/WebSocket
		const mockNotifications: Notification[] = [
			{
				id: "notif_1",
				type: "stagelet.deployed",
				title: "Stagelet Deployed",
				message: "PR #42 is now live",
				resource_id: "env_123",
				resource_type: "stagelet",
				is_read: false,
				created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
			},
			{
				id: "notif_2",
				type: "build.completed",
				title: "Build Completed",
				message: "API Backend build finished successfully",
				resource_id: "job_456",
				resource_type: "build",
				is_read: false,
				created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
			},
			{
				id: "notif_3",
				type: "stagelet.failed",
				title: "Deployment Failed",
				message: "PR #38 deployment failed",
				resource_id: "env_789",
				resource_type: "stagelet",
				is_read: true,
				created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
			},
			{
				id: "notif_4",
				type: "member.invited",
				title: "New Team Member",
				message: "Sarah Smith joined your team",
				is_read: true,
				created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
			},
			{
				id: "notif_5",
				type: "cost.threshold",
				title: "Cost Alert",
				message: "Monthly spend exceeded $50",
				is_read: true,
				created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
			},
		];
		setNotifications(mockNotifications);
	}, []);

	const unreadCount = notifications.filter((n) => !n.is_read).length;

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
			setIsOpen(false);
		}
	};

	const getNotificationIcon = (type: NotificationType) => {
		switch (type) {
			case "stagelet.deployed":
			case "build.completed":
				return <CheckCircle2 className="w-4 h-4 text-green-400" />;
			case "stagelet.failed":
			case "build.failed":
				return <XCircle className="w-4 h-4 text-red-400" />;
			case "member.invited":
				return <UserPlus className="w-4 h-4 text-blue-400" />;
			case "cost.threshold":
				return <DollarSign className="w-4 h-4 text-amber-400" />;
			default:
				return <Bell className="w-4 h-4 text-zinc-400" />;
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

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger asChild>
				<Button variant="ghost" size="icon" className="relative">
					<Bell className="w-5 h-5" />
					{unreadCount > 0 && (
						<>
							<span className="absolute top-0 right-0 w-2 h-2 bg-rose-500 rounded-full" />
							<span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white">
								{unreadCount}
							</span>
						</>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-96 p-0 bg-zinc-900 border-zinc-800" align="end">
				<div className="flex items-center justify-between p-4 border-b border-zinc-800">
					<h3 className="font-semibold text-white">Notifications</h3>
					{unreadCount > 0 && (
						<Button
							variant="ghost"
							size="sm"
							onClick={handleMarkAllAsRead}
							className="text-xs text-blue-400 hover:text-blue-300 h-auto py-1"
						>
							<CheckCheck className="w-3 h-3 mr-1" />
							Mark all read
						</Button>
					)}
				</div>

				<div className="max-h-96 overflow-y-auto">
					{notifications.length === 0 ? (
						<div className="p-8 text-center text-zinc-500">
							<Bell className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
							<p className="text-sm">No notifications</p>
						</div>
					) : (
						<div className="divide-y divide-zinc-800">
							{notifications.map((notification) => (
								<div
									key={notification.id}
									onClick={() => handleNotificationClick(notification)}
									className={`p-3 hover:bg-zinc-800/30 transition-colors cursor-pointer ${
										!notification.is_read ? "bg-zinc-800/50" : ""
									}`}
								>
									<div className="flex items-start gap-3">
										<div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
											{getNotificationIcon(notification.type)}
										</div>
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2 mb-0.5">
												<p
													className={`text-sm font-medium ${
														!notification.is_read ? "text-white" : "text-zinc-400"
													}`}
												>
													{notification.title}
												</p>
												{!notification.is_read && (
													<div className="w-2 h-2 bg-blue-500 rounded-full" />
												)}
											</div>
											<p className="text-xs text-zinc-400 line-clamp-2">{notification.message}</p>
											<p className="text-xs text-zinc-600 mt-1">
												{getRelativeTime(notification.created_at)}
											</p>
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>

				{notifications.length > 0 && (
					<div className="p-3 border-t border-zinc-800 text-center">
						<button
							onClick={() => {
								navigate("/notifications");
								setIsOpen(false);
							}}
							className="text-xs text-blue-400 hover:text-blue-300 font-medium"
						>
							View all notifications
						</button>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
};

export default NotificationCenter;
