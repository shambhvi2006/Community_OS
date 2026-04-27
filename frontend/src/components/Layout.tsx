import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import Chatbot from "./Chatbot";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/map", label: "Needs Map" },
  { to: "/impact", label: "Impact" },
  { to: "/inventory", label: "Inventory" },
  { to: "/forecasts", label: "Forecasts" },
  { to: "/overflow", label: "Overflow" },
  { to: "/volunteers", label: "Volunteers" },
  { to: "/blog", label: "Blog" },
  { to: "/admin", label: "Admin" },
];

export default function Layout() {
  const { user, role, ngoId, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setSidebarOpen(false);
          }}
          role="button"
          tabIndex={0}
          aria-label="Close sidebar"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-indigo-700 text-white transform transition-transform lg:translate-x-0 lg:static lg:z-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-indigo-600">
          <span className="text-lg font-bold">CommunityOS</span>
          <button
            type="button"
            className="lg:hidden text-indigo-200 hover:text-white"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            ✕
          </button>
        </div>
        <nav className="mt-4 space-y-1 px-2" aria-label="Main navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium ${
                  isActive
                    ? "bg-indigo-800 text-white"
                    : "text-indigo-100 hover:bg-indigo-600"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 flex items-center justify-between bg-white shadow px-4">
          <button
            type="button"
            className="lg:hidden text-gray-500 hover:text-gray-700"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>

          <div className="flex items-center gap-3 ml-auto">
            {ngoId && (
              <span className="hidden sm:inline text-sm text-gray-500">
                {ngoId}
              </span>
            )}
            {role && (
              <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                {role}
              </span>
            )}
            <span className="text-sm font-medium text-gray-700 truncate max-w-[150px]">
              {user?.displayName ?? user?.email}
            </span>
            <button
              type="button"
              onClick={signOut}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 overflow-auto">
          <Outlet />
        </main>
      </div>

      {/* Chatbot */}
      <Chatbot />
    </div>
  );
}
