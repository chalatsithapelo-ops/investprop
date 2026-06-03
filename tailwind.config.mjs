/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./index.html"],
  theme: {
    extend: {
      colors: {
        // Light-mode palette — navy values inverted so existing classes produce a white UI
        navy: {
          50: "#111318",
          100: "#1a1d23",
          200: "#2b3035",
          300: "#495057",
          400: "#6c757d",
          500: "#98a1ab",
          600: "#c3cad2",
          700: "#dce0e5",
          800: "#e8ebee",
          900: "#f2f3f5",
          950: "#ffffff",
        },
        // Warm gold — slightly deeper for readability on white
        gold: {
          50: "#fef9ed",
          100: "#fbefc9",
          200: "#f6dc8e",
          300: "#f0c453",
          400: "#d4a02e",
          500: "#b8841f",
          600: "#96691a",
          700: "#7a5118",
          800: "#654219",
          900: "#55371a",
        },
        // Teal accent for CTAs and interactive elements
        accent: {
          50: "#eefbf4",
          100: "#d6f5e3",
          200: "#b0eacc",
          300: "#7ddaae",
          400: "#48c38c",
          500: "#26a972",
          600: "#18895c",
          700: "#146e4c",
          800: "#13573e",
          900: "#114834",
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Inter"', 'system-ui', 'sans-serif'],
      },
    },
  },
};
