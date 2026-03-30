/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            backgroundImage: {
                "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
                "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
            },
            colors: {
                beige: {
                    50: "#fcfaf8",
                    100: "#f7f1eb",
                    200: "#ece1d6",
                    300: "#e0ccbc",
                    400: "#d1b19a",
                    500: "#c2977a",
                    600: "#b17e60",
                    700: "#936750",
                    800: "#7a5644",
                    900: "#65493b",
                },
                primary: {
                    50: "#f8fafc",
                    100: "#f1f5f9",
                    200: "#e2e8f0",
                    300: "#cbd5e1",
                    400: "#94a3b8",
                    500: "#64748b",
                    600: "#475569",
                    700: "#334155",
                    800: "#1e293b",
                    900: "#0f172a",
                },
            },
            fontFamily: {
                inter: ["Inter", "sans-serif"],
                outfit: ["Outfit", "sans-serif"],
            },
        },
    },
    plugins: [],
};
