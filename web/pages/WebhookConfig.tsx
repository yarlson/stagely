import React, { useState, useEffect } from "react";
import { Webhook } from "../types";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
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
import { Webhook as WebhookIcon, Plus, Trash2, Eye, EyeOff, Check, X, Clock } from "lucide-react";

const WebhookConfig: React.FC = () => {
	const [webhooks, setWebhooks] = useState<Webhook[]>([]);
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
	const [newWebhook, setNewWebhook] = useState({
		url: "",
		events: [] as Webhook["events"],
		secret: "",
	});
	const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});

	useEffect(() => {
		// Mock data - in production this would come from the database
		const mockWebhooks: Webhook[] = [
			{
				id: "wh_1",
				project_id: "proj_1",
				url: "https://api.acme.com/webhooks/stagely",
				events: ["stagelet.deployed", "stagelet.failed", "stagelet.terminated"],
				secret: "whsec_abc123def456ghi789jkl012mno345",
				is_active: true,
				last_triggered_at: "2025-12-06T14:30:00Z",
				created_at: "2025-11-01T10:00:00Z",
			},
			{
				id: "wh_2",
				project_id: "proj_2",
				url: "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX",
				events: ["build.completed", "build.failed"],
				secret: "whsec_xyz789abc123def456ghi012jkl345",
				is_active: true,
				last_triggered_at: "2025-12-06T13:15:00Z",
				created_at: "2025-10-15T14:30:00Z",
			},
			{
				id: "wh_3",
				project_id: "proj_1",
				url: "https://discord.com/api/webhooks/1234567890/abcdefghijklmnopqrstuvwxyz",
				events: ["stagelet.deployed"],
				secret: "whsec_mno345pqr678stu901vwx234yz567",
				is_active: false,
				created_at: "2025-09-20T09:00:00Z",
			},
		];
		setWebhooks(mockWebhooks);
	}, []);

	const handleCreateWebhook = () => {
		if (!newWebhook.url || newWebhook.events.length === 0) return;

		const webhook: Webhook = {
			id: `wh_${Date.now()}`,
			project_id: "proj_1",
			url: newWebhook.url,
			events: newWebhook.events,
			secret:
				newWebhook.secret ||
				`whsec_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
			is_active: true,
			created_at: new Date().toISOString(),
		};

		setWebhooks([...webhooks, webhook]);
		setNewWebhook({ url: "", events: [], secret: "" });
		setIsCreateDialogOpen(false);
	};

	const handleToggleActive = (webhookId: string) => {
		setWebhooks(
			webhooks.map((wh) => (wh.id === webhookId ? { ...wh, is_active: !wh.is_active } : wh)),
		);
	};

	const handleDeleteWebhook = (webhookId: string) => {
		setWebhooks(webhooks.filter((wh) => wh.id !== webhookId));
	};

	const handleToggleEvent = (event: Webhook["events"][number]) => {
		setNewWebhook((prev) => ({
			...prev,
			events: prev.events.includes(event)
				? prev.events.filter((e) => e !== event)
				: [...prev.events, event],
		}));
	};

	const allEvents: Webhook["events"] = [
		"stagelet.deployed",
		"stagelet.failed",
		"stagelet.terminated",
		"build.completed",
		"build.failed",
	];

	const getEventBadgeColor = (event: string): string => {
		if (event.includes("deployed") || event.includes("completed"))
			return "text-green-500 bg-green-500/10 border-green-500/20";
		if (event.includes("failed")) return "text-red-500 bg-red-500/10 border-red-500/20";
		if (event.includes("terminated")) return "text-amber-500 bg-amber-500/10 border-amber-500/20";
		return "text-blue-500 bg-blue-500/10 border-blue-500/20";
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-white">Webhook Configuration</h1>
					<p className="text-zinc-400">Configure webhooks to receive real-time notifications</p>
				</div>
				<Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
					<DialogTrigger asChild>
						<Button className="bg-blue-600 hover:bg-blue-700">
							<Plus className="w-4 h-4 mr-2" />
							Add Webhook
						</Button>
					</DialogTrigger>
					<DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl">
						<DialogHeader>
							<DialogTitle className="text-white">Create Webhook</DialogTitle>
							<DialogDescription className="text-zinc-400">
								Configure a webhook endpoint to receive event notifications
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-4 py-4">
							<div className="space-y-2">
								<Label htmlFor="url" className="text-zinc-300">
									Webhook URL
								</Label>
								<Input
									id="url"
									type="url"
									placeholder="https://api.example.com/webhooks"
									value={newWebhook.url}
									onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })}
									className="bg-zinc-800 border-zinc-700 text-white"
								/>
							</div>
							<div className="space-y-2">
								<Label className="text-zinc-300">Events to Subscribe</Label>
								<div className="flex flex-wrap gap-2">
									{allEvents.map((event) => (
										<button
											key={event}
											onClick={() => handleToggleEvent(event)}
											className={`px-3 py-1.5 text-xs rounded border transition-colors ${
												newWebhook.events.includes(event)
													? "bg-blue-600 border-blue-500 text-white"
													: "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"
											}`}
										>
											{newWebhook.events.includes(event) && (
												<Check className="w-3 h-3 inline mr-1" />
											)}
											{event}
										</button>
									))}
								</div>
							</div>
							<div className="space-y-2">
								<Label htmlFor="secret" className="text-zinc-300">
									Secret Key (Optional)
								</Label>
								<Input
									id="secret"
									type="text"
									placeholder="Leave empty to auto-generate"
									value={newWebhook.secret}
									onChange={(e) => setNewWebhook({ ...newWebhook, secret: e.target.value })}
									className="bg-zinc-800 border-zinc-700 text-white font-mono text-sm"
								/>
								<p className="text-xs text-zinc-500">
									Used to verify webhook signatures. Auto-generated if not provided.
								</p>
							</div>
						</div>
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => setIsCreateDialogOpen(false)}
								className="border-zinc-700 text-zinc-300"
							>
								Cancel
							</Button>
							<Button onClick={handleCreateWebhook} className="bg-blue-600 hover:bg-blue-700">
								Create Webhook
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>

			{/* Webhooks List */}
			<div className="space-y-4">
				{webhooks.length === 0 ? (
					<div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
						<WebhookIcon className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
						<p className="text-zinc-400 mb-4">No webhooks configured</p>
						<Button
							onClick={() => setIsCreateDialogOpen(true)}
							variant="outline"
							className="border-zinc-700 text-zinc-300"
						>
							<Plus className="w-4 h-4 mr-2" />
							Create your first webhook
						</Button>
					</div>
				) : (
					webhooks.map((webhook) => (
						<div
							key={webhook.id}
							className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden"
						>
							<div className="p-4 flex items-start justify-between">
								<div className="flex items-start gap-4 flex-1">
									<div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0 mt-1">
										<WebhookIcon className="w-5 h-5 text-zinc-400" />
									</div>
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2 mb-2">
											<span className="text-sm font-medium text-white truncate">{webhook.url}</span>
											{webhook.is_active ? (
												<Badge
													variant="outline"
													className="text-green-500 bg-green-500/10 border-green-500/20"
												>
													Active
												</Badge>
											) : (
												<Badge
													variant="outline"
													className="text-zinc-500 bg-zinc-500/10 border-zinc-500/20"
												>
													Inactive
												</Badge>
											)}
										</div>
										<div className="flex flex-wrap gap-2 mb-3">
											{webhook.events.map((event) => (
												<Badge key={event} variant="outline" className={getEventBadgeColor(event)}>
													{event}
												</Badge>
											))}
										</div>
										<div className="flex items-center gap-4 text-xs text-zinc-500">
											<span className="flex items-center gap-1">
												<Clock className="w-3 h-3" />
												Created {new Date(webhook.created_at).toLocaleDateString()}
											</span>
											{webhook.last_triggered_at && (
												<span>
													Last triggered {new Date(webhook.last_triggered_at).toLocaleString()}
												</span>
											)}
										</div>
										<div className="mt-3 p-3 bg-zinc-800/50 rounded border border-zinc-700">
											<div className="flex items-center justify-between">
												<span className="text-xs text-zinc-400 font-medium">Secret Key</span>
												<Button
													variant="ghost"
													size="sm"
													onClick={() =>
														setShowSecret({
															...showSecret,
															[webhook.id]: !showSecret[webhook.id],
														})
													}
													className="text-zinc-400 hover:text-zinc-300 h-6 px-2"
												>
													{showSecret[webhook.id] ? (
														<EyeOff className="w-3 h-3" />
													) : (
														<Eye className="w-3 h-3" />
													)}
												</Button>
											</div>
											<code className="text-xs text-zinc-300 font-mono block mt-1">
												{showSecret[webhook.id]
													? webhook.secret
													: "•".repeat(webhook.secret.length)}
											</code>
										</div>
									</div>
								</div>
								<div className="flex items-center gap-2 flex-shrink-0 ml-4">
									<Button
										variant="outline"
										size="sm"
										onClick={() => handleToggleActive(webhook.id)}
										className={
											webhook.is_active
												? "border-amber-700 text-amber-300 hover:bg-amber-900/20"
												: "border-green-700 text-green-300 hover:bg-green-900/20"
										}
									>
										{webhook.is_active ? (
											<>
												<X className="w-4 h-4 mr-1" />
												Disable
											</>
										) : (
											<>
												<Check className="w-4 h-4 mr-1" />
												Enable
											</>
										)}
									</Button>
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
												<AlertDialogTitle className="text-white">Delete Webhook</AlertDialogTitle>
												<AlertDialogDescription className="text-zinc-400">
													Are you sure you want to delete this webhook? This action cannot be
													undone.
												</AlertDialogDescription>
											</AlertDialogHeader>
											<AlertDialogFooter>
												<AlertDialogCancel className="border-zinc-700 text-zinc-300">
													Cancel
												</AlertDialogCancel>
												<AlertDialogAction onClick={() => handleDeleteWebhook(webhook.id)}>
													Delete
												</AlertDialogAction>
											</AlertDialogFooter>
										</AlertDialogContent>
									</AlertDialog>
								</div>
							</div>
						</div>
					))
				)}
			</div>

			{/* Documentation */}
			<div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
				<h2 className="text-lg font-semibold text-white mb-4">Webhook Documentation</h2>
				<div className="space-y-4 text-sm text-zinc-400">
					<div>
						<h3 className="text-zinc-300 font-medium mb-2">Payload Format</h3>
						<p className="mb-2">
							All webhooks deliver a JSON payload with the following structure:
						</p>
						<pre className="bg-zinc-800/50 p-3 rounded text-xs font-mono text-zinc-300 overflow-x-auto">
							{`{
  "event": "stagelet.deployed",
  "timestamp": "2025-12-06T14:30:00Z",
  "data": {
    "stagelet_id": "env_123",
    "project_id": "proj_1",
    "pr_number": 42,
    "url": "https://abc123.stagely.dev"
  }
}`}
						</pre>
					</div>
					<div>
						<h3 className="text-zinc-300 font-medium mb-2">Signature Verification</h3>
						<p className="mb-2">
							All webhook requests include an{" "}
							<code className="text-zinc-300 bg-zinc-800 px-1 rounded">X-Stagely-Signature</code>{" "}
							header containing an HMAC-SHA256 signature of the payload using your secret key.
						</p>
						<p>
							Verify the signature to ensure the webhook is from Stagely and hasn't been tampered
							with.
						</p>
					</div>
					<div>
						<h3 className="text-zinc-300 font-medium mb-2">Retry Policy</h3>
						<p>
							If your endpoint returns a non-2xx status code, Stagely will retry the webhook up to 3
							times with exponential backoff (1s, 5s, 30s).
						</p>
					</div>
				</div>
			</div>
		</div>
	);
};

export default WebhookConfig;
