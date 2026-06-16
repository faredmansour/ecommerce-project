import { Moon, Sun } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white p-2 text-zinc-700 shadow-sm hover:border-gold hover:text-gold transition-colors dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
      aria-label="Toggle dark mode"
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
