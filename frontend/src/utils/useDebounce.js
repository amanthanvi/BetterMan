// frontend/src/utils/useDebounce.js
import { useState, useEffect } from "react";

/**
 * Custom hook for debouncing a value
 *
 * @param {any} value - The value to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {any} - The debounced value
 */
const useDebounce = (value, delay) => {
	const [debouncedValue, setDebouncedValue] = useState(value);

	useEffect(() => {
		// Set a timer to update the debounced value after the specified delay
		const handler = setTimeout(() => {
			setDebouncedValue(value);
		}, delay);

		// Clear the timeout if value changes or component unmounts
		return () => {
			clearTimeout(handler);
		};
	}, [value, delay]);

	return debouncedValue;
};

export default useDebounce;
