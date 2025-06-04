/**
 * Utility to clean groff/troff formatting from man page text
 */

/**
 * Remove groff/troff formatting codes from text
 * @param text - The text containing groff formatting
 * @returns Clean text without formatting codes
 */
export const cleanGroffFormatting = (text: string): string => {
	if (!text) return "";

	let cleaned = text;

	// Remove font formatting codes like \fB, \fI, \fR, \fP (both uppercase and lowercase)
	cleaned = cleaned.replace(/\\f[BIPRbipr]/g, "");

	// Remove other common groff escape sequences
	cleaned = cleaned.replace(/\\-/g, "-"); // Escaped hyphen
	cleaned = cleaned.replace(/\\\./g, "."); // Escaped period
	cleaned = cleaned.replace(/\\\\/g, "\\"); // Escaped backslash
	cleaned = cleaned.replace(/\\&/g, ""); // Non-printing character
	cleaned = cleaned.replace(/\\~/g, " "); // Non-breaking space
	cleaned = cleaned.replace(/\\0/g, " "); // Digit-width space
	cleaned = cleaned.replace(/\\c/g, ""); // Continue on same line
	cleaned = cleaned.replace(/\\\|/g, ""); // Narrow space
	cleaned = cleaned.replace(/\\s[+-]?\d+/g, ""); // Size changes
	cleaned = cleaned.replace(/\\\*/g, ""); // String interpolation
	cleaned = cleaned.replace(/\\n/g, "\n"); // Newline
	cleaned = cleaned.replace(/\\t/g, "\t"); // Tab

	// Remove .BR, .IR, .BI, etc. macros
	cleaned = cleaned.replace(/^\.[A-Z]{2}\s+/gm, "");

	// Remove .TH, .SH, .PP, etc. macros
	cleaned = cleaned.replace(/^\.[A-Z]+\b.*$/gm, "");

	// Remove leading dots from lines (common in man pages)
	cleaned = cleaned.replace(/^\./gm, "");

	// Remove common man page section headers in all caps
	cleaned = cleaned.replace(
		/^(NAME|SYNOPSIS|DESCRIPTION|OPTIONS|EXAMPLES|SEE ALSO|AUTHOR|BUGS)\s*$/gm,
		""
	);

	// Clean up extra whitespace
	cleaned = cleaned.replace(/\s+/g, " ").trim();

	return cleaned;
};

/**
 * Extract clean title from groff-formatted text
 * Attempts to get the most meaningful title
 */
export const extractCleanTitle = (
	title: string,
	id: string,
	section?: number
): string => {
	if (!title) return id;

	// Clean groff formatting
	let cleaned = cleanGroffFormatting(title);

	// If title is empty after cleaning, use ID
	if (!cleaned || cleaned === "Unknown") {
		return id;
	}

	// If title looks like a description, try to extract command name
	if (cleaned.includes(" - ")) {
		const parts = cleaned.split(" - ");
		if (parts[0].trim()) {
			return parts[0].trim();
		}
	}

	// If title is very long, it might be a description
	if (cleaned.length > 50) {
		// Try to find the command name at the beginning
		const words = cleaned.split(" ");
		if (words[0] && words[0].length < 20) {
			return words[0];
		}
	}

	return cleaned;
};

/**
 * Format a document title for display
 */
export const formatDocumentTitle = (doc: {
	title?: string;
	name?: string;
	id: string;
	section?: number;
}): string => {
	const title = doc.title || doc.name || doc.id;
	return extractCleanTitle(title, doc.name || doc.id, doc.section);
};
