/** @type {import('tailwindcss').Config} */
export default {
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	darkMode: "class", // Enable dark mode with class strategy
	theme: {
		extend: {
			typography: {
				DEFAULT: {
					css: {
						maxWidth: "65ch",
						color: "var(--tw-prose-body)",
						a: {
							color: "var(--tw-prose-links)",
							"&:hover": {
								color: "var(--tw-prose-links-hover)",
							},
						},
						code: {
							color: "var(--tw-prose-code)",
							backgroundColor: "var(--tw-prose-code-bg)",
							paddingLeft: "0.25rem",
							paddingRight: "0.25rem",
							paddingTop: "0.125rem",
							paddingBottom: "0.125rem",
							borderRadius: "0.25rem",
						},
						"code::before": {
							content: '""',
						},
						"code::after": {
							content: '""',
						},
						pre: {
							backgroundColor: "var(--tw-prose-pre-bg)",
							overflowX: "auto",
							fontSize: "0.875em",
						},
						"pre code": {
							backgroundColor: "transparent",
							borderWidth: "0",
							borderRadius: "0",
							padding: "0",
							fontWeight: "inherit",
							color: "inherit",
							fontSize: "inherit",
							fontFamily: "inherit",
							lineHeight: "inherit",
						},
					},
				},
				// Dark mode typography
				dark: {
					css: {
						color: "rgb(229 231 235)", // text-gray-200
						a: { color: "rgb(129 140 248)" }, // indigo-400
						strong: { color: "rgb(229 231 235)" },
						h1: { color: "rgb(229 231 235)" },
						h2: { color: "rgb(229 231 235)" },
						h3: { color: "rgb(229 231 235)" },
						h4: { color: "rgb(229 231 235)" },
						h5: { color: "rgb(229 231 235)" },
						h6: { color: "rgb(229 231 235)" },
						blockquote: { color: "rgb(209 213 219)" },
						code: {
							color: "rgb(229 231 235)",
							backgroundColor: "rgb(55 65 81)", // bg-gray-700
						},
						"pre code": {
							backgroundColor: "transparent",
							color: "inherit",
						},
						pre: {
							color: "rgb(229 231 235)",
							backgroundColor: "rgb(31 41 55)", // bg-gray-800
						},
						hr: { borderColor: "rgb(75 85 99)" },
						ol: {
							li: {
								"&::marker": {
									color: "rgb(156 163 175)",
								},
							},
						},
						ul: {
							li: {
								"&::marker": {
									color: "rgb(156 163 175)",
								},
							},
						},
						thead: { color: "rgb(229 231 235)" },
						tbody: {
							tr: { borderBottomColor: "rgb(55 65 81)" },
						},
					},
				},
			},
		},
	},
	plugins: [
		require("@tailwindcss/typography"),
		require("@tailwindcss/forms"),
	],
};
