import React, { useState, useEffect } from "react";
import { CostBreakdown } from "../types";
import { Button } from "../components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../components/ui/select";
import { DollarSign, TrendingUp, Calendar, Download, Box } from "lucide-react";
import {
	LineChart,
	Line,
	BarChart,
	Bar,
	PieChart,
	Pie,
	Cell,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	Legend,
} from "recharts";

const CostAnalytics: React.FC = () => {
	const [costData, setCostData] = useState<CostBreakdown[]>([]);
	const [timeRange, setTimeRange] = useState("7d");

	useEffect(() => {
		// Mock data - in production this would come from the database
		const generateMockData = (): CostBreakdown[] => {
			const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
			const data: CostBreakdown[] = [];

			for (let i = days - 1; i >= 0; i--) {
				const date = new Date();
				date.setDate(date.getDate() - i);

				data.push({
					date: date.toISOString().split("T")[0],
					total_cost: Math.random() * 8 + 2,
					by_project: [
						{
							project_id: "proj_1",
							project_name: "API Backend",
							cost: Math.random() * 3 + 1,
						},
						{
							project_id: "proj_2",
							project_name: "Frontend App",
							cost: Math.random() * 2 + 0.5,
						},
						{
							project_id: "proj_3",
							project_name: "Worker Service",
							cost: Math.random() * 1.5 + 0.3,
						},
						{
							project_id: "proj_4",
							project_name: "Mobile API",
							cost: Math.random() * 1 + 0.2,
						},
					],
					by_provider: [
						{ provider_type: "aws", cost: Math.random() * 4 + 1 },
						{ provider_type: "digitalocean", cost: Math.random() * 2 + 0.5 },
						{ provider_type: "hetzner", cost: Math.random() * 1.5 + 0.3 },
					],
				});
			}

			return data;
		};

		setCostData(generateMockData());
	}, [timeRange]);

	const totalCost = costData.reduce((sum, day) => sum + day.total_cost, 0);
	const avgDailyCost = totalCost / costData.length;
	const projectedMonthlyCost = avgDailyCost * 30;

	// Aggregate project costs
	const projectCosts = costData.reduce(
		(acc, day) => {
			day.by_project.forEach((proj) => {
				if (!acc[proj.project_name]) {
					acc[proj.project_name] = 0;
				}
				acc[proj.project_name] += proj.cost;
			});
			return acc;
		},
		{} as Record<string, number>,
	);

	const projectCostData = Object.entries(projectCosts).map(([name, cost]) => ({
		name,
		cost: parseFloat(cost.toFixed(2)),
	}));

	// Aggregate provider costs
	const providerCosts = costData.reduce(
		(acc, day) => {
			day.by_provider.forEach((prov) => {
				if (!acc[prov.provider_type]) {
					acc[prov.provider_type] = 0;
				}
				acc[prov.provider_type] += prov.cost;
			});
			return acc;
		},
		{} as Record<string, number>,
	);

	const providerCostData = Object.entries(providerCosts).map(([name, cost]) => ({
		name: name.toUpperCase(),
		cost: parseFloat(cost.toFixed(2)),
	}));

	const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

	const handleExport = () => {
		const csv = [
			"Date,Total Cost,AWS,DigitalOcean,Hetzner",
			...costData.map((day) => {
				const aws = day.by_provider.find((p) => p.provider_type === "aws")?.cost || 0;
				const digitalocean =
					day.by_provider.find((p) => p.provider_type === "digitalocean")?.cost || 0;
				const hetzner = day.by_provider.find((p) => p.provider_type === "hetzner")?.cost || 0;
				return `${day.date},${day.total_cost.toFixed(2)},${aws.toFixed(2)},${digitalocean.toFixed(2)},${hetzner.toFixed(2)}`;
			}),
		].join("\n");

		const blob = new Blob([csv], { type: "text/csv" });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `cost-analytics-${timeRange}-${new Date().toISOString().split("T")[0]}.csv`;
		a.click();
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-white">Cost Analytics</h1>
					<p className="text-zinc-400">Track infrastructure spending and optimize costs</p>
				</div>
				<div className="flex items-center gap-3">
					<Select value={timeRange} onValueChange={setTimeRange}>
						<SelectTrigger className="w-32 bg-zinc-800 border-zinc-700 text-white">
							<SelectValue />
						</SelectTrigger>
						<SelectContent className="bg-zinc-800 border-zinc-700">
							<SelectItem value="7d">Last 7 days</SelectItem>
							<SelectItem value="30d">Last 30 days</SelectItem>
							<SelectItem value="90d">Last 90 days</SelectItem>
						</SelectContent>
					</Select>
					<Button
						onClick={handleExport}
						variant="outline"
						className="border-zinc-700 text-zinc-300"
					>
						<Download className="w-4 h-4 mr-2" />
						Export
					</Button>
				</div>
			</div>

			{/* Stats Grid */}
			<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
				<div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg">
					<div className="flex items-center justify-between mb-2">
						<span className="text-zinc-400 text-sm font-medium">Total Spend</span>
						<DollarSign className="w-4 h-4 text-zinc-500" />
					</div>
					<div className="text-2xl font-bold text-white">${totalCost.toFixed(2)}</div>
					<div className="text-xs text-zinc-500 mt-1">
						{timeRange === "7d"
							? "Last 7 days"
							: timeRange === "30d"
								? "Last 30 days"
								: "Last 90 days"}
					</div>
				</div>
				<div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg">
					<div className="flex items-center justify-between mb-2">
						<span className="text-zinc-400 text-sm font-medium">Avg Daily Cost</span>
						<Calendar className="w-4 h-4 text-zinc-500" />
					</div>
					<div className="text-2xl font-bold text-white">${avgDailyCost.toFixed(2)}</div>
					<div className="text-xs text-zinc-500 mt-1">Per day average</div>
				</div>
				<div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg">
					<div className="flex items-center justify-between mb-2">
						<span className="text-zinc-400 text-sm font-medium">Projected Monthly</span>
						<TrendingUp className="w-4 h-4 text-zinc-500" />
					</div>
					<div className="text-2xl font-bold text-white">${projectedMonthlyCost.toFixed(2)}</div>
					<div className="text-xs text-zinc-500 mt-1">Based on current usage</div>
				</div>
				<div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg">
					<div className="flex items-center justify-between mb-2">
						<span className="text-zinc-400 text-sm font-medium">Active Projects</span>
						<Box className="w-4 h-4 text-zinc-500" />
					</div>
					<div className="text-2xl font-bold text-white">{projectCostData.length}</div>
					<div className="text-xs text-zinc-500 mt-1">Generating costs</div>
				</div>
			</div>

			{/* Cost Trend Chart */}
			<div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
				<h2 className="font-semibold text-white mb-4">Daily Cost Trend</h2>
				<ResponsiveContainer width="100%" height={300}>
					<LineChart
						data={costData.map((d) => ({
							date: new Date(d.date).toLocaleDateString("en-US", {
								month: "short",
								day: "numeric",
							}),
							cost: parseFloat(d.total_cost.toFixed(2)),
						}))}
					>
						<CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
						<XAxis
							dataKey="date"
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
							cursor={{ stroke: "#27272a", strokeWidth: 2 }}
							contentStyle={{
								backgroundColor: "#18181b",
								borderColor: "#27272a",
								borderRadius: "6px",
								color: "#f4f4f5",
							}}
							formatter={(value: number) => [`$${value.toFixed(2)}`, "Cost"]}
						/>
						<Line
							type="monotone"
							dataKey="cost"
							stroke="#3b82f6"
							strokeWidth={2}
							dot={{ fill: "#3b82f6", r: 4 }}
						/>
					</LineChart>
				</ResponsiveContainer>
			</div>

			{/* Cost by Project and Provider */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* By Project */}
				<div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
					<h2 className="font-semibold text-white mb-4">Cost by Project</h2>
					<ResponsiveContainer width="100%" height={300}>
						<BarChart data={projectCostData}>
							<CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
							<XAxis
								dataKey="name"
								stroke="#71717a"
								fontSize={11}
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
								formatter={(value: number) => [`$${value.toFixed(2)}`, "Cost"]}
							/>
							<Bar dataKey="cost" fill="#3b82f6" radius={[4, 4, 0, 0]} />
						</BarChart>
					</ResponsiveContainer>
				</div>

				{/* By Provider */}
				<div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
					<h2 className="font-semibold text-white mb-4">Cost by Provider</h2>
					<div className="flex items-center justify-center">
						<ResponsiveContainer width="100%" height={300}>
							<PieChart>
								<Pie
									data={providerCostData}
									cx="50%"
									cy="50%"
									labelLine={false}
									label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
									outerRadius={100}
									fill="#8884d8"
									dataKey="cost"
								>
									{providerCostData.map((entry, index) => (
										<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
									))}
								</Pie>
								<Tooltip
									contentStyle={{
										backgroundColor: "#18181b",
										borderColor: "#27272a",
										borderRadius: "6px",
										color: "#f4f4f5",
									}}
									formatter={(value: number) => [`$${value.toFixed(2)}`, "Cost"]}
								/>
							</PieChart>
						</ResponsiveContainer>
					</div>
				</div>
			</div>

			{/* Cost Breakdown Table */}
			<div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
				<div className="p-4 border-b border-zinc-800">
					<h2 className="font-semibold text-white">Project Cost Breakdown</h2>
				</div>
				<table className="w-full">
					<thead className="bg-zinc-800/50">
						<tr>
							<th className="text-left px-6 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
								Project
							</th>
							<th className="text-right px-6 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
								Total Cost
							</th>
							<th className="text-right px-6 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
								Avg Daily
							</th>
							<th className="text-right px-6 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
								% of Total
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-zinc-800">
						{projectCostData.map((project, index) => {
							const avgDaily = project.cost / costData.length;
							const percentage = (project.cost / totalCost) * 100;

							return (
								<tr key={index} className="hover:bg-zinc-800/30 transition-colors">
									<td className="px-6 py-4 text-sm font-medium text-white">{project.name}</td>
									<td className="px-6 py-4 text-sm text-zinc-300 text-right font-mono">
										${project.cost.toFixed(2)}
									</td>
									<td className="px-6 py-4 text-sm text-zinc-400 text-right font-mono">
										${avgDaily.toFixed(2)}
									</td>
									<td className="px-6 py-4 text-sm text-zinc-400 text-right">
										{percentage.toFixed(1)}%
									</td>
								</tr>
							);
						})}
					</tbody>
					<tfoot className="bg-zinc-800/50">
						<tr>
							<td className="px-6 py-4 text-sm font-bold text-white">Total</td>
							<td className="px-6 py-4 text-sm font-bold text-white text-right font-mono">
								${totalCost.toFixed(2)}
							</td>
							<td className="px-6 py-4 text-sm font-medium text-zinc-300 text-right font-mono">
								${avgDailyCost.toFixed(2)}
							</td>
							<td className="px-6 py-4 text-sm text-zinc-400 text-right">100%</td>
						</tr>
					</tfoot>
				</table>
			</div>

			{/* Cost Optimization Tips */}
			<div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-6">
				<h2 className="font-semibold text-blue-300 mb-3 flex items-center gap-2">
					<TrendingUp className="w-5 h-5" />
					Cost Optimization Tips
				</h2>
				<ul className="space-y-2 text-sm text-blue-400/80">
					<li className="flex items-start gap-2">
						<span className="text-blue-500 mt-0.5">•</span>
						<span>Use spot instances for non-critical preview environments to save up to 70%</span>
					</li>
					<li className="flex items-start gap-2">
						<span className="text-blue-500 mt-0.5">•</span>
						<span>Set auto-termination timers for stale stagelets (24-hour TTL recommended)</span>
					</li>
					<li className="flex items-start gap-2">
						<span className="text-blue-500 mt-0.5">•</span>
						<span>Enable build caching to reduce build times and costs by 50-80%</span>
					</li>
					<li className="flex items-start gap-2">
						<span className="text-blue-500 mt-0.5">•</span>
						<span>Review underutilized projects and consider consolidating resources</span>
					</li>
				</ul>
			</div>
		</div>
	);
};

export default CostAnalytics;
