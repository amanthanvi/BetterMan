import React, { useEffect, useState } from "react";
import {
	ActivityLogIcon,
	Cross2Icon,
	ExclamationTriangleIcon,
	CheckCircledIcon,
	ReloadIcon,
} from "@radix-ui/react-icons";
import { cn } from "@/utils/cn";
import { clearAllCaches } from "@/utils/clearCache";
import toast from "react-hot-toast";

interface PerformanceMetrics {
	apiLatency: number;
	cacheHitRate: number;
	errorRate: number;
	activeRequests: number;
}

interface HealthStatus {
	api: "healthy" | "degraded" | "error";
	cache: "healthy" | "degraded" | "error";
	search: "healthy" | "degraded" | "error";
}

export const PerformanceMonitor: React.FC = () => {
	const [isOpen, setIsOpen] = useState(false);
	const [metrics, setMetrics] = useState<PerformanceMetrics>({
		apiLatency: 0,
		cacheHitRate: 0,
		errorRate: 0,
		activeRequests: 0,
	});
	const [health, setHealth] = useState<HealthStatus>({
		api: "healthy",
		cache: "healthy",
		search: "healthy",
	});
	const [recentErrors, setRecentErrors] = useState<string[]>([]);

	// Monitor API performance
	useEffect(() => {
		// Skip in production
		if (process.env.NODE_ENV === "production") return;
		
		const originalFetch = window.fetch;
		let requestCount = 0;
		let errorCount = 0;
		const latencies: number[] = [];

		window.fetch = async function(...args) {
			const startTime = performance.now();
			requestCount++;
			setMetrics((prev) => ({
				...prev,
				activeRequests: prev.activeRequests + 1,
			}));

			try {
				// Call original fetch with proper context
				const response = await originalFetch.apply(this, args);
				const endTime = performance.now();
				const latency = endTime - startTime;
				latencies.push(latency);

				// Keep only last 10 latencies
				if (latencies.length > 10) latencies.shift();

				// Update metrics
				const avgLatency =
					latencies.reduce((a, b) => a + b, 0) / latencies.length;
				const errorRate = (errorCount / requestCount) * 100;

				setMetrics((prev) => ({
					...prev,
					apiLatency: Math.round(avgLatency),
					errorRate: Math.round(errorRate),
					activeRequests: Math.max(0, prev.activeRequests - 1),
				}));

				// Extract URL from fetch args
				let url = "";
				if (typeof args[0] === "string") {
					url = args[0];
				} else if (args[0] instanceof Request) {
					url = args[0].url;
				} else if (args[0] instanceof URL) {
					url = args[0].toString();
				}

				// Check if response is ok
				if (!response.ok) {
					errorCount++;
					setRecentErrors((prev) => [
						`${response.status} - ${url}`,
						...prev.slice(0, 4),
					]);
				}

				// Update health status
				setHealth((prev) => ({
					...prev,
					api: avgLatency > 1000 ? "degraded" : "healthy",
					search:
						url.includes("/search") && !response.ok
							? "error"
							: prev.search,
				}));

				return response;
			} catch (error) {
				errorCount++;
				setMetrics((prev) => ({
					...prev,
					activeRequests: Math.max(0, prev.activeRequests - 1),
				}));

				const errorMsg =
					error instanceof Error ? error.message : "Unknown error";
				setRecentErrors((prev) => [errorMsg, ...prev.slice(0, 4)]);

				throw error;
			}
		};

		// Cleanup
		return () => {
			window.fetch = originalFetch;
		};
	}, []);

	// Simulate cache hit rate (in real app, get from backend)
	useEffect(() => {
		const interval = setInterval(() => {
			const hitRate = 75 + Math.random() * 20; // 75-95%
			setMetrics((prev) => ({
				...prev,
				cacheHitRate: Math.round(hitRate),
			}));

			setHealth((prev) => ({
				...prev,
				cache: hitRate < 80 ? "degraded" : "healthy",
			}));
		}, 5000);

		return () => clearInterval(interval);
	}, []);

	const getStatusColor = (status: "healthy" | "degraded" | "error") => {
		switch (status) {
			case "healthy":
				return "text-green-500";
			case "degraded":
				return "text-yellow-500";
			case "error":
				return "text-red-500";
		}
	};

	const getStatusIcon = (status: "healthy" | "degraded" | "error") => {
		switch (status) {
			case "healthy":
				return <CheckCircledIcon className="w-4 h-4" />;
			case "degraded":
				return <ExclamationTriangleIcon className="w-4 h-4" />;
			case "error":
				return <Cross2Icon className="w-4 h-4" />;
		}
	};

	const handleClearCache = async () => {
		const success = await clearAllCaches();
		if (success) {
			toast.success("Cache cleared successfully");
			// Clear errors after cache clear
			setRecentErrors([]);
		} else {
			toast.error("Failed to clear cache");
		}
	};

	// Only show monitor in development
	if (process.env.NODE_ENV === "production") {
		return null;
	}

	return (
		<>
			{/* Floating Button */}
			<button}}
				onClick={() => setIsOpen(!isOpen)}
				className={cn(
					"fixed bottom-4 right-4 z-50 p-3 rounded-full shadow-lg",
					"bg-gray-900 dark:bg-gray-800 text-white",
					"hover:bg-gray-800 dark:hover:bg-gray-700",
					health.api === "error" || health.search === "error"
						? "animate-pulse bg-red-600 hover:bg-red-700"
						: ""
				)}
			>
				<ActivityLogIcon className="w-5 h-5" />
			</button>

			{/* Monitor Panel */}
			<>
				{isOpen && (
					<div}}}
						className="fixed bottom-20 right-4 z-50 w-96 max-w-[calc(100vw-2rem)]"
					>
						<div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700">
							{/* Header */}
							<div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
								<h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
									Performance Monitor
								</h3>
								<button
									onClick={() => setIsOpen(false)}
									className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
								>
									<Cross2Icon className="w-5 h-5" />
								</button>
							</div>

							{/* Metrics */}
							<div className="p-4 space-y-4">
								{/* Health Status */}
								<div>
									<h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
										System Health
									</h4>
									<div className="grid grid-cols-3 gap-2">
										{Object.entries(health).map(
											([service, status]) => (
												<div
													key={service}
													className="flex items-center space-x-2 p-2 rounded bg-gray-50 dark:bg-gray-700"
												>
													<span
														className={getStatusColor(
															status
														)}
													>
														{getStatusIcon(status)}
													</span>
													<span className="text-xs capitalize">
														{service}
													</span>
												</div>
											)
										)}
									</div>
								</div>

								{/* Performance Metrics */}
								<div>
									<h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
										Performance
									</h4>
									<div className="space-y-2">
										<div className="flex justify-between text-sm">
											<span className="text-gray-600 dark:text-gray-400">
												API Latency
											</span>
											<span className="font-mono">
												{metrics.apiLatency}ms
											</span>
										</div>
										<div className="flex justify-between text-sm">
											<span className="text-gray-600 dark:text-gray-400">
												Cache Hit Rate
											</span>
											<span className="font-mono">
												{metrics.cacheHitRate}%
											</span>
										</div>
										<div className="flex justify-between text-sm">
											<span className="text-gray-600 dark:text-gray-400">
												Error Rate
											</span>
											<span className="font-mono">
												{metrics.errorRate}%
											</span>
										</div>
										<div className="flex justify-between text-sm">
											<span className="text-gray-600 dark:text-gray-400">
												Active Requests
											</span>
											<span className="font-mono">
												{metrics.activeRequests}
											</span>
										</div>
									</div>
								</div>

								{/* Recent Errors */}
								{recentErrors.length > 0 && (
									<div>
										<h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
											Recent Errors
										</h4>
										<div className="space-y-1 max-h-32 overflow-y-auto">
											{recentErrors.map((error, idx) => (
												<div
													key={idx}
													className="text-xs text-red-600 dark:text-red-400 font-mono p-1 bg-red-50 dark:bg-red-900/20 rounded"
												>
													{error}
												</div>
											))}
										</div>
									</div>
								)}

								{/* Actions */}
								<div className="flex space-x-2">
									<button
										onClick={handleClearCache}
										className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm transition-colors"
									>
										<ReloadIcon className="w-4 h-4" />
										<span>Clear Cache</span>
									</button>
									<button
										onClick={() => window.location.reload()}
										className="flex-1 px-3 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
									>
										Reload Page
									</button>
								</div>
							</div>
						</div>
					</div>
				)}
			</>
		</>
	);
};
