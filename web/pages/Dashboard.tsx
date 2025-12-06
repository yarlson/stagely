import React, { useState, useEffect } from "react";
import { db } from "../services/db";
import { Stagelet } from "../types";
import StatusBadge from "../components/StatusBadge";
import { Link } from "react-router-dom";
import { ArrowUpRight, Activity, DollarSign, Box } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const Dashboard: React.FC = () => {
	const [stagelets, setStagelets] = useState<Stagelet[]>([]);

	useEffect(() => {
		setStagelets(db.getStagelets());
	}, []);

	const activeStagelets = stagelets.filter((e) => e.status !== "terminated").length;
	const totalCost = stagelets.reduce((acc, curr) => acc + curr.estimated_cost_usd, 0).toFixed(2);

	// Mock data for chart
	const costData = [
		{ name: "Mon", cost: 2.4 },
		{ name: "Tue", cost: 1.3 },
		{ name: "Wed", cost: 3.8 },
		{ name: "Thu", cost: 2.1 },
		{ name: "Fri", cost: 1.9 },
		{ name: "Sat", cost: 0.5 },
		{ name: "Sun", cost: 0.8 },
	];

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-white">Dashboard</h1>
				<p className="text-zinc-400">Overview of your infrastructure and costs.</p>
			</div>

			{/* Stats Grid */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				<div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg">
					<div className="flex items-center justify-between mb-2">
						<span className="text-zinc-400 text-sm font-medium">Active Stagelets</span>
						<Box className="w-4 h-4 text-zinc-500" />
					</div>
					<div className="text-2xl font-bold text-white">{activeStagelets}</div>
				</div>
				<div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg">
					<div className="flex items-center justify-between mb-2">
						<span className="text-zinc-400 text-sm font-medium">Monthly Cost (Est.)</span>
						<DollarSign className="w-4 h-4 text-zinc-500" />
					</div>
					<div className="text-2xl font-bold text-white">${totalCost}</div>
				</div>
				<div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg">
					<div className="flex items-center justify-between mb-2">
						<span className="text-zinc-400 text-sm font-medium">System Health</span>
						<Activity className="w-4 h-4 text-emerald-500" />
					</div>
					<div className="text-2xl font-bold text-emerald-500">Operational</div>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Recent Activity */}
				<div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
					<div className="p-4 border-b border-zinc-800 flex items-center justify-between">
						<h2 className="font-semibold text-white">Recent Stagelets</h2>
						<Link
							to="/projects"
							className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
						>
							View all <ArrowUpRight className="w-3 h-3" />
						</Link>
					</div>
					<div className="divide-y divide-zinc-800">
						{stagelets.slice(0, 5).map((stagelet) => (
							<div
								key={stagelet.id}
								className="p-4 flex items-center justify-between hover:bg-zinc-800/50 transition-colors"
							>
								<div className="flex items-center gap-4">
									<div className="flex flex-col">
										<Link
											to={`/stagelets/${stagelet.id}`}
											className="text-sm font-medium text-white hover:underline"
										>
											PR #{stagelet.pr_number}: {stagelet.branch_name}
										</Link>
										<span className="text-xs text-zinc-500">
											{stagelet.subdomain_hash}.stagely.dev
										</span>
									</div>
								</div>
								<div className="flex items-center gap-4">
									<span className="text-xs text-zinc-500 font-mono hidden sm:block">
										{new Date(stagelet.updated_at).toLocaleTimeString()}
									</span>
									<StatusBadge status={stagelet.status} size="sm" />
								</div>
							</div>
						))}
						{stagelets.length === 0 && (
							<div className="p-8 text-center text-zinc-500 text-sm">
								No active stagelets found.
							</div>
						)}
					</div>
				</div>

				{/* Cost Chart */}
				<div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col">
					<h2 className="font-semibold text-white mb-4">Daily Spend (7 Days)</h2>
					<div className="flex-1 min-h-[200px]">
						<ResponsiveContainer width="100%" height="100%">
							<BarChart data={costData}>
								<CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
								<XAxis
									dataKey="name"
									stroke="#71717a"
									fontSize={12}
									tickLine={false}
									axisLine={false}
								/>
								<YAxis
									stroke="#71717a"
									fontSize={12}
									tickLine={false}
									axisLine={false}
									tickFormatter={(value) => `$${value}`}
								/>
								<Tooltip
									cursor={{ fill: "#27272a" }}
									contentStyle={{
										backgroundColor: "#18181b",
										borderColor: "#27272a",
										borderRadius: "6px",
										color: "#f4f4f5",
									}}
								/>
								<Bar dataKey="cost" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={32} />
							</BarChart>
						</ResponsiveContainer>
					</div>
				</div>
			</div>
		</div>
	);
};

export default Dashboard;
