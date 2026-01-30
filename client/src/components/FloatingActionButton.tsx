import React, { useState, useEffect } from 'react';
import { Plus, Camera, Upload, Search, X, Video, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

interface FABAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  color?: string;
}

interface FloatingActionButtonProps {
  actions: FABAction[];
  className?: string;
}

export function FloatingActionButton({ actions, className }: FloatingActionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Only render on mobile
  if (!isMobile) return null;

  const toggleMenu = () => {
    triggerHaptic('light');
    setIsOpen(!isOpen);
  };

  const handleActionClick = (action: FABAction) => {
    triggerHaptic('medium');
    action.onClick();
    setIsOpen(false);
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* FAB Container */}
      <div className={cn('fixed bottom-20 right-4 z-50 md:hidden', className)}>
        {/* Action buttons */}
        <div
          className={cn(
            'flex flex-col-reverse gap-3 mb-3 transition-all duration-300 ease-out',
            isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
          )}
        >
          {actions.map((action, index) => (
            <div
              key={index}
              className="flex items-center gap-3 justify-end"
              style={{
                transitionDelay: isOpen ? `${index * 50}ms` : '0ms',
              }}
            >
              <span
                className={cn(
                  'bg-card text-card-foreground px-3 py-1.5 rounded-lg text-sm font-medium shadow-lg border',
                  'transition-all duration-200',
                  isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
                )}
                style={{
                  transitionDelay: isOpen ? `${index * 50 + 100}ms` : '0ms',
                }}
              >
                {action.label}
              </span>
              <Button
                size="icon"
                className={cn(
                  'h-12 w-12 rounded-full shadow-lg transition-all duration-200',
                  action.color || 'bg-primary hover:bg-primary/90'
                )}
                onClick={() => handleActionClick(action)}
              >
                {action.icon}
              </Button>
            </div>
          ))}
        </div>

        {/* Main FAB button */}
        <Button
          size="icon"
          className={cn(
            'h-14 w-14 rounded-full shadow-xl transition-all duration-300',
            isOpen
              ? 'bg-destructive hover:bg-destructive/90 rotate-45'
              : 'bg-primary hover:bg-primary/90 rotate-0'
          )}
          onClick={toggleMenu}
        >
          {isOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <Plus className="h-6 w-6" />
          )}
        </Button>
      </div>
    </>
  );
}

// Pre-configured FAB for Files page
export function FilesFAB({
  onCameraClick,
  onUploadClick,
  onSearchClick,
}: {
  onCameraClick: () => void;
  onUploadClick: () => void;
  onSearchClick: () => void;
}) {
  const actions: FABAction[] = [
    {
      icon: <Camera className="h-5 w-5" />,
      label: 'Take Photo',
      onClick: onCameraClick,
      color: 'bg-green-600 hover:bg-green-700',
    },
    {
      icon: <Upload className="h-5 w-5" />,
      label: 'Upload File',
      onClick: onUploadClick,
      color: 'bg-blue-600 hover:bg-blue-700',
    },
    {
      icon: <Search className="h-5 w-5" />,
      label: 'Search',
      onClick: onSearchClick,
      color: 'bg-purple-600 hover:bg-purple-700',
    },
  ];

  return <FloatingActionButton actions={actions} />;
}

// Pre-configured FAB for Videos page
export function VideosFAB({
  onRecordClick,
  onUploadClick,
  onVoiceClick,
}: {
  onRecordClick: () => void;
  onUploadClick: () => void;
  onVoiceClick?: () => void;
}) {
  const actions: FABAction[] = [
    {
      icon: <Video className="h-5 w-5" />,
      label: 'Record Video',
      onClick: onRecordClick,
      color: 'bg-red-600 hover:bg-red-700',
    },
    {
      icon: <Upload className="h-5 w-5" />,
      label: 'Upload Video',
      onClick: onUploadClick,
      color: 'bg-blue-600 hover:bg-blue-700',
    },
  ];

  if (onVoiceClick) {
    actions.push({
      icon: <Mic className="h-5 w-5" />,
      label: 'Voice Note',
      onClick: onVoiceClick,
      color: 'bg-orange-600 hover:bg-orange-700',
    });
  }

  return <FloatingActionButton actions={actions} />;
}
