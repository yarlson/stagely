import React, { useState } from "react";
import { db } from "../services/db";
import { Cloud, Save } from "lucide-react";
import EnvVarManager from "../components/EnvVarManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Settings: React.FC = () => {
	const [providers] = useState(db.getProviders());
	const [activeTab, setActiveTab] = useState<"cloud" | "config">("cloud");
	const team = db.getTeam();

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-white">Settings</h1>
				<p className="text-zinc-400">
					Configure your cloud providers and global team configuration.
				</p>
			</div>

			<div className="flex gap-2 border-b border-zinc-800">
				<Button
					onClick={() => setActiveTab("cloud")}
					variant="ghost"
					className={`rounded-none border-b-2 transition-colors ${
						activeTab === "cloud" ? "border-white text-white" : "border-transparent text-zinc-400"
					}`}
				>
					Cloud Providers
				</Button>
				<Button
					onClick={() => setActiveTab("config")}
					variant="ghost"
					className={`rounded-none border-b-2 transition-colors ${
						activeTab === "config" ? "border-white text-white" : "border-transparent text-zinc-400"
					}`}
				>
					Configuration
				</Button>
			</div>

			{activeTab === "cloud" && (
				<div className="space-y-6">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Cloud className="w-5 h-5" /> Connected Providers
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								{providers.map((p) => (
									<Card key={p.id}>
										<CardContent className="flex items-center justify-between p-4">
											<div>
												<p className="text-white font-medium">{p.name}</p>
												<p className="text-xs text-zinc-500 uppercase">
													{p.type} • {p.region}
												</p>
											</div>
											<Badge
												variant="outline"
												className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
											>
												Active
											</Badge>
										</CardContent>
									</Card>
								))}
							</div>

							<div className="mt-6 pt-6 border-t border-zinc-800">
								<h4 className="text-sm font-medium text-white mb-4">Add New Provider</h4>
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label htmlFor="provider-name" className="text-xs">
											Provider Name
										</Label>
										<Input
											id="provider-name"
											type="text"
											placeholder="Provider Name (e.g. My AWS)"
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="provider-type" className="text-xs">
											Provider Type
										</Label>
										<Select>
											<SelectTrigger id="provider-type">
												<SelectValue placeholder="Select provider" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="aws">Amazon Web Services</SelectItem>
												<SelectItem value="digitalocean">DigitalOcean</SelectItem>
												<SelectItem value="hetzner">Hetzner</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div className="md:col-span-2 space-y-2">
										<Label htmlFor="api-credentials" className="text-xs">
											API Credentials JSON
										</Label>
										<Textarea
											id="api-credentials"
											placeholder="Paste API Credentials JSON here..."
											className="h-24 font-mono"
										/>
									</div>
								</div>
								<Button className="mt-4">
									<Save className="w-4 h-4" /> Save Provider
								</Button>
							</div>
						</CardContent>
					</Card>
				</div>
			)}

			{activeTab === "config" && (
				<div className="space-y-8">
					<EnvVarManager
						level="team"
						referenceId={team.id}
						type="variable"
						title="Team Variables"
						description="Plain text environment variables available to all projects within the team."
					/>
					<EnvVarManager
						level="team"
						referenceId={team.id}
						type="secret"
						title="Team Secrets"
						description="Encrypted secrets available to all projects within the team. Values are masked."
					/>
				</div>
			)}
		</div>
	);
};

export default Settings;
