"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/skills", label: "Skills" },
  { href: "/characters", label: "Characters" },
  { href: "/battlefield", label: "Battlefield" },
  { href: "/templates", label: "Templates" },
  { href: "/overview", label: "Overview" },
  { href: "/config", label: "Config" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3">
      <div className="max-w-7xl mx-auto flex gap-4 items-center flex-wrap">
        <span className="font-bold text-lg text-white shrink-0">FF Battler</span>
        <div className="flex gap-3 items-center flex-wrap">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm transition-colors whitespace-nowrap ${
                pathname === link.href
                  ? "text-white font-medium"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
