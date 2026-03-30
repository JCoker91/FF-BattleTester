"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/skills", label: "Skills" },
  { href: "/characters", label: "Characters" },
  { href: "/battlefield", label: "Battlefield" },
  { href: "/overview", label: "Overview" },
  { href: "/config", label: "Config" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3">
      <div className="max-w-7xl mx-auto flex gap-6 items-center">
        <span className="font-bold text-lg text-white">FF Battler</span>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`text-sm transition-colors ${
              pathname === link.href
                ? "text-white font-medium"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
