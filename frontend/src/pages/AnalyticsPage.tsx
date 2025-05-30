import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
	BarChartIcon,
	PersonIcon,
	MagnifyingGlassIcon,
	ClockIcon,
	ArrowUpIcon,
	ActivityLogIcon,
	ComponentInstanceIcon,
	LightningBoltIcon,
	EyeOpenIcon,
	HeartIcon,
} from "@radix-ui/react-icons";
import { useAppStore } from "@/stores/appStore";

interface MetricCard {
	title: string;
	value: string | number;
	change?: number;
	icon: React.ReactNode;
	color: string;
	trend?: "up" | "down" | "stable";
}

interface AnalyticsData {
	totalSearches: number;
	totalUsers: number;
	avgResponseTime: number;
	cacheHitRate: number;
	popularCommands: Array<{ command: string; count: number }>;
	searchTrends: Array<{ time: string; searches: number }>;
	systemHealth: {
		cpu: number;
		memory: number;
		disk: number;
		uptime: string;
	};
	recentActivity: Array<{
		id: string;
		type: "search" | "view" | "favorite";
		command: string;
		timestamp: Date;
		responseTime?: number;
	}>;
}

export const AnalyticsPage: React.FC = () => {
	const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
	const [loading, setLoading] = useState(true);
	const [refreshInterval, setRefreshInterval] =
		useState<NodeJS.Timeout | null>(null);

	const {} = useAppStore();

	// Mock analytics data (in real app, this would come from API)
	const fetchAnalytics = async (): Promise<AnalyticsData> => {
		// Simulate API delay
		await new Promise((resolve) => setTimeout(resolve, 500));

		return {
			totalSearches: Math.floor(Math.random() * 10000) + 5000,
			totalUsers: Math.floor(Math.random() * 1000) + 500,
			avgResponseTime: Math.floor(Math.random() * 50) + 80,
			cacheHitRate: Math.floor(Math.random() * 20) + 75,
			popularCommands: [
				{
					command: "ls",
					count: Math.floor(Math.random() * 500) + 1000,
				},
				{
					command: "find",
					count: Math.floor(Math.random() * 400) + 800,
				},
				{
					command: "grep",
					count: Math.floor(Math.random() * 300) + 600,
				},
				{
					command: "chmod",
					count: Math.floor(Math.random() * 200) + 400,
				},
				{
					command: "awk",
					count: Math.floor(Math.random() * 150) + 300,
				},
			],
			searchTrends: Array.from({ length: 24 }, (_, i) => ({
				time: `${23 - i}:00`,
				searches: Math.floor(Math.random() * 100) + 20,
			})),
			systemHealth: {
				cpu: Math.floor(Math.random() * 30) + 20,
				memory: Math.floor(Math.random() * 40) + 40,
				disk: Math.floor(Math.random() * 20) + 60,
				uptime: "15d 4h 32m",
			},
			recentActivity: Array.from({ length: 10 }, (_, i) => ({
				id: `activity-${i}`,
				type: ["search", "view", "favorite"][
					Math.floor(Math.random() * 3)
				] as any,
				command: ["ls", "find", "grep", "awk", "sed"][
					Math.floor(Math.random() * 5)
				],
				timestamp: new Date(Date.now() - Math.random() * 3600000),
				responseTime: Math.floor(Math.random() * 200) + 50,
			})),
		};
	};

	useEffect(() => {
		const loadAnalytics = async () => {
			setLoading(true);
			try {
				const data = await fetchAnalytics();
				setAnalytics(data);
			} catch (error) {
				console.error("Failed to fetch analytics:", error);
			} finally {
				setLoading(false);
			}
		};

		loadAnalytics();

		// Set up auto-refresh every 30 seconds
		const interval = setInterval(loadAnalytics, 30000);
		setRefreshInterval(interval);

		return () => {
			if (interval) clearInterval(interval);
		};
	}, []);

	if (loading || !analytics) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<motion.div
					animate={{ rotate: 360 }}
					transition={{
						duration: 1,
						repeat: Infinity,
						ease: "linear",
					}}
					className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"
				/>
			</div>
		);
	}

	const metrics: MetricCard[] = [
		{
			title: "Total Searches",
			value: analytics.totalSearches.toLocaleString(),
			change: 12.5,
			icon: <MagnifyingGlassIcon className="w-5 h-5" />,
			color: "blue",
			trend: "up",
		},
		{
			title: "Active Users",
			value: analytics.totalUsers.toLocaleString(),
			change: 8.2,
			icon: <PersonIcon className="w-5 h-5" />,
			color: "green",
			trend: "up",
		},
		{
			title: "Avg Response Time",
			value: `${analytics.avgResponseTime}ms`,
			change: -5.3,
			icon: <ClockIcon className="w-5 h-5" />,
			color: "purple",
			trend: "down",
		},
		{
			title: "Cache Hit Rate",
			value: `${analytics.cacheHitRate}%`,
			change: 3.1,
			icon: <LightningBoltIcon className="w-5 h-5" />,
			color: "orange",
			trend: "up",
		},
	];

	return (
		<div className="space-y-6 p-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold text-gray-900 dark:text-white">
						Analytics Dashboard
					</h1>
					<p className="text-gray-600 dark:text-gray-400 mt-1">
						Real-time insights into BetterMan usage and performance
					</p>
				</div>
				<div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
					<ActivityLogIcon className="w-4 h-4" />
					<span>Auto-refresh: 30s</span>
				</div>
			</div>

			{/* Metrics Grid */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
				{metrics.map((metric, index) => (
					<MetricCardComponent
						key={metric.title}
						metric={metric}
						index={index}
					/>
				))}
			</div>

			{/* Charts Row */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Popular Commands */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.3 }}
					className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700"
				>
					<div className="flex items-center justify-between mb-4">
						<h3 className="text-lg font-semibold text-gray-900 dark:text-white">
							Popular Commands
						</h3>
						<BarChartIcon className="w-5 h-5 text-gray-400" />
					</div>
					<div className="space-y-3">
						{analytics.popularCommands.map((command, index) => (
							<div
								key={command.command}
								className="flex items-center justify-between"
							>
								<div className="flex items-center space-x-3">
									<span className="text-sm font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
										{command.command}
									</span>
								</div>
								<div className="flex items-center space-x-2">
									<div className="w-20 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
										<div
											className="h-full bg-blue-500 rounded-full transition-all duration-500"
											style={{
												width: `${
													(command.count /
														analytics
															.popularCommands[0]
															.count) *
													100
												}%`,
											}}
										/>
									</div>
									<span className="text-sm text-gray-600 dark:text-gray-400 w-12 text-right">
										{command.count}
									</span>
								</div>
							</div>
						))}
					</div>
				</motion.div>

				{/* System Health */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.4 }}
					className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700"
				>
					<div className="flex items-center justify-between mb-4">
						<h3 className="text-lg font-semibold text-gray-900 dark:text-white">
							System Health
						</h3>
						<ComponentInstanceIcon className="w-5 h-5 text-gray-400" />
					</div>
					<div className="space-y-4">
						<HealthMetric
							label="CPU Usage"
							value={analytics.systemHealth.cpu}
							max={100}
							color="blue"
						/>
						<HealthMetric
							label="Memory"
							value={analytics.systemHealth.memory}
							max={100}
							color="green"
						/>
						<HealthMetric
							label="Disk"
							value={analytics.systemHealth.disk}
							max={100}
							color="orange"
						/>
						<div className="pt-2 border-t border-gray-200 dark:border-gray-700">
							<div className="flex items-center justify-between">
								<span className="text-sm text-gray-600 dark:text-gray-400">
									Uptime
								</span>
								<span className="text-sm font-mono text-gray-900 dark:text-white">
									{analytics.systemHealth.uptime}
								</span>
							</div>
						</div>
					</div>
				</motion.div>
			</div>

			{/* Recent Activity */}
			<motion.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.5 }}
				className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700"
			>
				<div className="flex items-center justify-between mb-4">
					<h3 className="text-lg font-semibold text-gray-900 dark:text-white">
						Recent Activity
					</h3>
					<EyeOpenIcon className="w-5 h-5 text-gray-400" />
				</div>
				<div className="space-y-3">
					{analytics.recentActivity.map((activity) => (
						<ActivityItem key={activity.id} activity={activity} />
					))}
				</div>
			</motion.div>
		</div>
	);
};

interface MetricCardComponentProps {
	metric: MetricCard;
	index: number;
}

const MetricCardComponent: React.FC<MetricCardComponentProps> = ({
	metric,
	index,
}) => {
	const colorClasses = {
		blue: "text-blue-600 bg-blue-100 dark:bg-blue-900/20",
		green: "text-green-600 bg-green-100 dark:bg-green-900/20",
		purple: "text-purple-600 bg-purple-100 dark:bg-purple-900/20",
		orange: "text-orange-600 bg-orange-100 dark:bg-orange-900/20",
	};

	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay: index * 0.1 }}
			className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700"
		>
			<div className="flex items-center justify-between">
				<div>
					<p className="text-sm text-gray-600 dark:text-gray-400">
						{metric.title}
					</p>
					<p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
						{metric.value}
					</p>
					{metric.change !== undefined && (
						<div className="flex items-center mt-2">
							<ArrowUpIcon
								className={`w-4 h-4 mr-1 ${
									metric.trend === "up"
										? "text-green-500 rotate-0"
										: metric.trend === "down"
										? "text-red-500 rotate-180"
										: "text-gray-400"
								}`}
							/>
							<span
								className={`text-sm ${
									metric.trend === "up"
										? "text-green-600"
										: metric.trend === "down"
										? "text-red-600"
										: "text-gray-600"
								}`}
							>
								{metric.change > 0 ? "+" : ""}
								{metric.change}%
							</span>
						</div>
					)}
				</div>
				<div
					className={`w-12 h-12 rounded-lg flex items-center justify-center ${
						colorClasses[metric.color as keyof typeof colorClasses]
					}`}
				>
					{metric.icon}
				</div>
			</div>
		</motion.div>
	);
};

interface HealthMetricProps {
	label: string;
	value: number;
	max: number;
	color: string;
}

const HealthMetric: React.FC<HealthMetricProps> = ({
	label,
	value,
	max,
	color,
}) => {
	const percentage = (value / max) * 100;
	const colorClasses = {
		blue: "bg-blue-500",
		green: "bg-green-500",
		orange: "bg-orange-500",
	};

	return (
		<div>
			<div className="flex items-center justify-between mb-1">
				<span className="text-sm text-gray-600 dark:text-gray-400">
					{label}
				</span>
				<span className="text-sm font-mono text-gray-900 dark:text-white">
					{value}%
				</span>
			</div>
			<div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
				<motion.div
					initial={{ width: 0 }}
					animate={{ width: `${percentage}%` }}
					transition={{ duration: 1, ease: "easeOut" }}
					className={`h-full rounded-full ${
						colorClasses[color as keyof typeof colorClasses]
					}`}
				/>
			</div>
		</div>
	);
};

interface ActivityItemProps {
	activity: AnalyticsData["recentActivity"][0];
}

const ActivityItem: React.FC<ActivityItemProps> = ({ activity }) => {
	const getIcon = () => {
		switch (activity.type) {
			case "search":
				return <MagnifyingGlassIcon className="w-4 h-4" />;
			case "view":
				return <EyeOpenIcon className="w-4 h-4" />;
			case "favorite":
				return <HeartIcon className="w-4 h-4" />;
			default:
				return <ActivityLogIcon className="w-4 h-4" />;
		}
	};

	const getActionText = () => {
		switch (activity.type) {
			case "search":
				return "searched for";
			case "view":
				return "viewed";
			case "favorite":
				return "favorited";
			default:
				return "interacted with";
		}
	};

	return (
		<div className="flex items-center space-x-3 py-2">
			<div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-400">
				{getIcon()}
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-sm text-gray-900 dark:text-white">
					User {getActionText()}{" "}
					<span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-xs">
						{activity.command}
					</span>
				</p>
				<div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
					<span>{activity.timestamp.toLocaleTimeString()}</span>
					{activity.responseTime && (
						<>
							<span>•</span>
							<span>{activity.responseTime}ms</span>
						</>
					)}
				</div>
			</div>
		</div>
	);
};
