import { Moon, Sun } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="inline-flex items-center justify-center rounded-full border border-gray-200 bg-white p-2 text-gray-700 shadow-sm hover:border-orange-300 hover:text-orange-500 transition-colors dark:border-slate-700 dark:bg-slate-900 dark:text-gray-200"
      aria-label="Toggle dark mode"
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
