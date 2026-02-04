import { FileIcon, VideoIcon, FolderIcon, Upload } from "lucide-react";
import { Link, useLocation } from "wouter";
import { triggerHaptic } from "@/lib/haptics";

interface MobileBottomNavProps {
  onUploadClick?: () => void;
}

export function MobileBottomNav({ onUploadClick }: MobileBottomNavProps) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Files", icon: FileIcon },
    { href: "/videos", label: "Videos", icon: VideoIcon },
    { href: "/collections", label: "Collections", icon: FolderIcon },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 pb-safe">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
              onClick={() => triggerHaptic('light')}
            >
              <Icon className={`h-5 w-5 ${isActive ? 'scale-110' : ''} transition-transform`} />
              <span className="text-[10px] mt-1 font-medium">{item.label}</span>
            </Link>
          );
        })}
        
        {/* Upload FAB */}
        {onUploadClick && (
          <button
            onClick={() => {
              triggerHaptic('medium');
              onUploadClick();
            }}
            className="flex flex-col items-center justify-center flex-1 h-full py-2 text-primary"
          >
            <div className="bg-primary rounded-full p-2 -mt-4 shadow-lg">
              <Upload className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-[10px] mt-1 font-medium">Upload</span>
          </button>
        )}
      </div>
    </nav>
  );
}
