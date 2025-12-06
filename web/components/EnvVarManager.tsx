import React, { useState, useEffect } from "react";
import { db } from "../services/db";
import { EnvVar } from "../types";
import { Plus, Trash2, Eye, EyeOff, Lock, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface EnvVarManagerProps {
	level: "team" | "project" | "stagelet";
	referenceId: string;
	type: "secret" | "variable";
	title?: string;
	description?: string;
}

const EnvVarManager: React.FC<EnvVarManagerProps> = ({
	level,
	referenceId,
	type,
	title,
	description,
}) => {
	const [items, setItems] = useState<EnvVar[]>([]);
	const [showValues, setShowValues] = useState<Record<string, boolean>>({});
	const [newKey, setNewKey] = useState("");
	const [newValue, setNewValue] = useState("");
	const [newScope, setNewScope] = useState("global");

	useEffect(() => {
		loadItems();
	}, [referenceId, level, type]);

	const loadItems = () => {
		setItems(db.getEnvVars(level, referenceId, type));
	};

	const handleAdd = () => {
		if (!newKey || !newValue) return;

		db.saveEnvVar({
			key: newKey,
			value: newValue,
			scope: newScope,
			level,
			reference_id: referenceId,
			type,
		});

		setNewKey("");
		setNewValue("");
		setNewScope("global");
		loadItems();
	};

	const handleDelete = (id: string) => {
		if (confirm(`Are you sure you want to delete this ${type}?`)) {
			db.deleteEnvVar(id);
			loadItems();
		}
	};

	const toggleVisibility = (id: string) => {
		setShowValues((prev) => ({ ...prev, [id]: !prev[id] }));
	};

	const Icon = type === "secret" ? Lock : Type;
	const defaultTitle =
		type === "secret"
			? `${level.charAt(0).toUpperCase() + level.slice(1)} Secrets`
			: `${level.charAt(0).toUpperCase() + level.slice(1)} Variables`;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Icon className="w-5 h-5 text-zinc-400" /> {title || defaultTitle}
				</CardTitle>
				{description && <CardDescription>{description}</CardDescription>}
			</CardHeader>
			<CardContent>
				{/* Add New Item */}
				<div className="mb-6 p-4 bg-zinc-950/50 rounded-lg border border-zinc-800/50">
					<div className="grid grid-cols-12 gap-3 items-end">
						<div className="col-span-4">
							<label className="block text-xs text-zinc-500 mb-1">Key</label>
							<input
								type="text"
								placeholder="e.g. API_KEY"
								value={newKey}
								onChange={(e) => setNewKey(e.target.value.toUpperCase())}
								className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-700 font-mono"
							/>
						</div>
						<div className="col-span-4">
							<label className="block text-xs text-zinc-500 mb-1">Value</label>
							<input
								type={type === "secret" ? "password" : "text"}
								placeholder="Value"
								value={newValue}
								onChange={(e) => setNewValue(e.target.value)}
								className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-700 font-mono"
							/>
						</div>
						<div className="col-span-3">
							<label className="block text-xs text-zinc-500 mb-1">Scope</label>
							<input
								type="text"
								placeholder="global"
								value={newScope}
								onChange={(e) => setNewScope(e.target.value)}
								className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-700"
							/>
						</div>
						<div className="col-span-1">
							<Button
								onClick={handleAdd}
								disabled={!newKey || !newValue}
								size="icon"
								className="w-full h-[38px] bg-emerald-600 hover:bg-emerald-500"
							>
								<Plus className="w-4 h-4" />
							</Button>
						</div>
					</div>
				</div>

				{/* List */}
				{items.length === 0 ? (
					<div className="text-center py-8 text-zinc-500 text-sm border-2 border-dashed border-zinc-800 rounded-lg">
						No {type}s defined at this level.
					</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-left text-sm">
							<thead className="text-zinc-500 border-b border-zinc-800">
								<tr>
									<th className="pb-3 font-medium pl-2">Key</th>
									<th className="pb-3 font-medium">Value</th>
									<th className="pb-3 font-medium">Scope</th>
									<th className="pb-3 font-medium text-right pr-2">Actions</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-zinc-800">
								{items.map((item) => (
									<tr key={item.id} className="group">
										<td className="py-3 pl-2 font-mono text-zinc-300">{item.key}</td>
										<td className="py-3 font-mono text-zinc-500">
											<div className="flex items-center gap-2">
												<span>
													{type === "variable"
														? item.value
														: showValues[item.id]
															? item.value
															: "••••••••••••••••"}
												</span>
												{type === "secret" && (
													<Button
														onClick={() => toggleVisibility(item.id)}
														variant="ghost"
														size="icon-sm"
														className="opacity-0 group-hover:opacity-100 h-6 w-6"
													>
														{showValues[item.id] ? (
															<EyeOff className="w-3 h-3" />
														) : (
															<Eye className="w-3 h-3" />
														)}
													</Button>
												)}
											</div>
										</td>
										<td className="py-3 text-zinc-400">
											<Badge variant="secondary" className="text-xs">
												{item.scope}
											</Badge>
										</td>
										<td className="py-3 text-right pr-2">
											<Button
												onClick={() => handleDelete(item.id)}
												variant="ghost"
												size="icon-sm"
												className="hover:text-rose-500"
											>
												<Trash2 className="w-4 h-4" />
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</CardContent>
		</Card>
	);
};

export default EnvVarManager;
