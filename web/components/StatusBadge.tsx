import React from "react";
import { StageletStatus } from "../types";
import { Circle, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
	status: StageletStatus;
	size?: "sm" | "md";
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = "md" }) => {
	const config = {
		pending: {
			color: "text-zinc-500",
			bg: "bg-zinc-500/10",
			border: "border-zinc-500/20",
			icon: Circle,
			label: "Pending",
		},
		building: {
			color: "text-amber-500",
			bg: "bg-amber-500/10",
			border: "border-amber-500/20",
			icon: Loader2,
			label: "Building",
			animate: true,
		},
		deploying: {
			color: "text-blue-500",
			bg: "bg-blue-500/10",
			border: "border-blue-500/20",
			icon: Loader2,
			label: "Deploying",
			animate: true,
		},
		ready: {
			color: "text-emerald-500",
			bg: "bg-emerald-500/10",
			border: "border-emerald-500/20",
			icon: CheckCircle2,
			label: "Ready",
		},
		failed: {
			color: "text-rose-500",
			bg: "bg-rose-500/10",
			border: "border-rose-500/20",
			icon: XCircle,
			label: "Failed",
		},
		terminated: {
			color: "text-zinc-500",
			bg: "bg-zinc-500/10",
			border: "border-zinc-500/20",
			icon: XCircle,
			label: "Terminated",
		},
	}[status];

	const Icon = config.icon;

	return (
		<Badge variant="outline" className={`gap-1.5 ${config.bg} ${config.color} ${config.border}`}>
			<Icon className={`w-3.5 h-3.5 ${config.animate ? "animate-spin" : ""}`} />
			{config.label}
		</Badge>
	);
};

export default StatusBadge;
