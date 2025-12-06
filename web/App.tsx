import React from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import ProjectList from "./pages/ProjectList";
import ProjectDetails from "./pages/ProjectDetails";
import StageletDetails from "./pages/StageletDetails";
import Settings from "./pages/Settings";
import TeamMembers from "./pages/TeamMembers";
import AuditLogs from "./pages/AuditLogs";
import BuildQueue from "./pages/BuildQueue";
import CostAnalytics from "./pages/CostAnalytics";
import WebhookConfig from "./pages/WebhookConfig";
import Notifications from "./pages/Notifications";

const App: React.FC = () => {
	return (
		<HashRouter>
			<Layout>
				<Routes>
					<Route path="/" element={<Dashboard />} />
					<Route path="/projects" element={<ProjectList />} />
					<Route path="/projects/:projectId" element={<ProjectDetails />} />
					<Route path="/stagelets/:id" element={<StageletDetails />} />
					<Route path="/settings" element={<Settings />} />
					<Route path="/team/members" element={<TeamMembers />} />
					<Route path="/team/audit-logs" element={<AuditLogs />} />
					<Route path="/build-queue" element={<BuildQueue />} />
					<Route path="/cost-analytics" element={<CostAnalytics />} />
					<Route path="/webhooks" element={<WebhookConfig />} />
					<Route path="/notifications" element={<Notifications />} />
				</Routes>
			</Layout>
		</HashRouter>
	);
};

export default App;
