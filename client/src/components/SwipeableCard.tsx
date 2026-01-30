import React, { useState, useRef, useCallback } from 'react';
import { Trash2, Star, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

interface SwipeableCardProps {
  children: React.ReactNode;
  onDelete?: () => void;
  onFavorite?: () => void;
  isFavorite?: boolean;
  className?: string;
  disabled?: boolean;
}

export function SwipeableCard({
  children,
  onDelete,
  onFavorite,
  isFavorite = false,
  className,
  disabled = false,
}: SwipeableCardProps) {
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showActions, setShowActions] = useState<'left' | 'right' | null>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  const SWIPE_THRESHOLD = 80;
  const ACTION_THRESHOLD = 120;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isHorizontalSwipe.current = null;
    setIsDragging(true);
  }, [disabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled || !isDragging) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - startX.current;
    const diffY = currentY - startY.current;

    // Determine if this is a horizontal or vertical swipe
    if (isHorizontalSwipe.current === null) {
      if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
        isHorizontalSwipe.current = Math.abs(diffX) > Math.abs(diffY);
      }
    }

    // Only handle horizontal swipes
    if (isHorizontalSwipe.current === false) {
      return;
    }

    // Prevent vertical scrolling during horizontal swipe
    if (isHorizontalSwipe.current === true) {
      e.preventDefault();
    }

    // Limit the swipe distance
    const maxSwipe = 150;
    const clampedX = Math.max(-maxSwipe, Math.min(maxSwipe, diffX));
    setTranslateX(clampedX);

    // Trigger haptic when crossing thresholds
    if (Math.abs(clampedX) >= SWIPE_THRESHOLD && Math.abs(translateX) < SWIPE_THRESHOLD) {
      triggerHaptic('light');
    }
    if (Math.abs(clampedX) >= ACTION_THRESHOLD && Math.abs(translateX) < ACTION_THRESHOLD) {
      triggerHaptic('medium');
    }
  }, [disabled, isDragging, translateX]);

  const handleTouchEnd = useCallback(() => {
    if (disabled) return;
    setIsDragging(false);

    // Check if action should be triggered
    if (translateX <= -ACTION_THRESHOLD && onDelete) {
      triggerHaptic('heavy');
      setShowActions('left');
      setTimeout(() => {
        onDelete();
        setTranslateX(0);
        setShowActions(null);
      }, 200);
    } else if (translateX >= ACTION_THRESHOLD && onFavorite) {
      triggerHaptic('heavy');
      setShowActions('right');
      setTimeout(() => {
        onFavorite();
        setTranslateX(0);
        setShowActions(null);
      }, 200);
    } else {
      // Snap back
      setTranslateX(0);
      setShowActions(null);
    }

    isHorizontalSwipe.current = null;
  }, [disabled, translateX, onDelete, onFavorite]);

  const getBackgroundColor = () => {
    if (translateX < -SWIPE_THRESHOLD) {
      return 'bg-red-500/90';
    }
    if (translateX > SWIPE_THRESHOLD) {
      return isFavorite ? 'bg-gray-500/90' : 'bg-yellow-500/90';
    }
    return 'bg-transparent';
  };

  const getActionIcon = () => {
    if (translateX < -SWIPE_THRESHOLD) {
      return <Trash2 className="w-6 h-6 text-white" />;
    }
    if (translateX > SWIPE_THRESHOLD) {
      return isFavorite ? (
        <X className="w-6 h-6 text-white" />
      ) : (
        <Star className="w-6 h-6 text-white fill-white" />
      );
    }
    return null;
  };

  const getActionText = () => {
    if (translateX < -SWIPE_THRESHOLD) {
      return 'Delete';
    }
    if (translateX > SWIPE_THRESHOLD) {
      return isFavorite ? 'Unfavorite' : 'Favorite';
    }
    return '';
  };

  return (
    <div className={cn('relative overflow-hidden rounded-lg', className)}>
      {/* Background action indicator */}
      <div
        className={cn(
          'absolute inset-0 flex items-center transition-colors duration-150',
          getBackgroundColor(),
          translateX < 0 ? 'justify-end pr-4' : 'justify-start pl-4'
        )}
      >
        <div className="flex flex-col items-center gap-1">
          {getActionIcon()}
          <span className="text-xs font-medium text-white">{getActionText()}</span>
        </div>
      </div>

      {/* Swipeable content */}
      <div
        ref={cardRef}
        className={cn(
          'relative bg-card transition-transform',
          isDragging ? 'transition-none' : 'duration-200 ease-out'
        )}
        style={{ transform: `translateX(${translateX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>

      {/* Swipe hint indicator (only on mobile) */}
      {!disabled && translateX === 0 && (
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 md:hidden">
          <div className="w-8 h-1 bg-muted-foreground/30 rounded-full" />
        </div>
      )}
    </div>
  );
}
