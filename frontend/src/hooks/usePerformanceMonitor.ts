import { useEffect, useRef } from "react";

interface PerformanceMetrics {
	renderCount: number;
	lastRenderTime: number;
	averageRenderTime: number;
	slowRenders: number;
}

/**
 * Hook to monitor component rendering performance
 */
export const usePerformanceMonitor = (componentName: string, threshold = 16.67) => {
	const metrics = useRef<PerformanceMetrics>({
		renderCount: 0,
		lastRenderTime: 0,
		averageRenderTime: 0,
		slowRenders: 0,
	});

	const renderStartTime = useRef<number>(0);

	// Track render start
	renderStartTime.current = performance.now();

	useEffect(() => {
		// Calculate render time
		const renderEndTime = performance.now();
		const renderTime = renderEndTime - renderStartTime.current;

		// Update metrics
		metrics.current.renderCount++;
		metrics.current.lastRenderTime = renderTime;
		metrics.current.averageRenderTime =
			(metrics.current.averageRenderTime * (metrics.current.renderCount - 1) + renderTime) /
			metrics.current.renderCount;

		// Track slow renders (> 16.67ms for 60fps)
		if (renderTime > threshold) {
			metrics.current.slowRenders++;
			console.warn(
				`[Performance] ${componentName} slow render: ${renderTime.toFixed(2)}ms`,
				{
					renderCount: metrics.current.renderCount,
					slowRenders: metrics.current.slowRenders,
					averageTime: metrics.current.averageRenderTime.toFixed(2),
				}
			);
		}

		// Log performance summary every 100 renders in development
		if (process.env.NODE_ENV === "development" && metrics.current.renderCount % 100 === 0) {
			console.log(`[Performance Summary] ${componentName}:`, {
				totalRenders: metrics.current.renderCount,
				slowRenders: metrics.current.slowRenders,
				slowRenderPercentage: (
					(metrics.current.slowRenders / metrics.current.renderCount) *
					100
				).toFixed(2),
				averageRenderTime: metrics.current.averageRenderTime.toFixed(2),
				lastRenderTime: metrics.current.lastRenderTime.toFixed(2),
			});
		}
	});

	return metrics.current;
};