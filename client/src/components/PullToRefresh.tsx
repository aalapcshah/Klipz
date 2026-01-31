import React, { useState, useRef, useCallback, useEffect } from 'react';
import { RefreshCw, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  threshold?: number;
  maxPull?: number;
}

export function PullToRefresh({
  onRefresh,
  children,
  className,
  disabled = false,
  threshold = 80,
  maxPull = 120,
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const isPullingRef = useRef(false);

  const canPull = useCallback(() => {
    if (disabled || isRefreshing) return false;
    // Only allow pull when scrolled to top
    const container = containerRef.current;
    if (!container) return false;
    return window.scrollY <= 0;
  }, [disabled, isRefreshing]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!canPull()) return;
    startYRef.current = e.touches[0].clientY;
    currentYRef.current = e.touches[0].clientY;
    isPullingRef.current = false;
  }, [canPull]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!canPull()) return;
    
    currentYRef.current = e.touches[0].clientY;
    const diff = currentYRef.current - startYRef.current;
    
    // Only start pulling if moving down and at top of page
    if (diff > 0 && window.scrollY <= 0) {
      if (!isPullingRef.current) {
        isPullingRef.current = true;
        setIsPulling(true);
      }
      
      // Apply resistance to pull
      const resistance = 0.5;
      const adjustedDiff = Math.min(diff * resistance, maxPull);
      setPullDistance(adjustedDiff);
      
      // Haptic feedback when crossing threshold
      if (adjustedDiff >= threshold && pullDistance < threshold) {
        triggerHaptic('medium');
      }
      
      // Prevent default scroll when pulling
      e.preventDefault();
    }
  }, [canPull, maxPull, threshold, pullDistance]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current) return;
    
    isPullingRef.current = false;
    setIsPulling(false);
    
    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      triggerHaptic('success');
      
      try {
        await onRefresh();
      } catch (error) {
        console.error('Refresh failed:', error);
        triggerHaptic('error');
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, threshold, onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Add touch event listeners to document for better capture
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const progress = Math.min(pullDistance / threshold, 1);
  const showIndicator = isPulling || isRefreshing;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Pull indicator */}
      <div
        className={cn(
          'absolute left-0 right-0 flex items-center justify-center transition-all duration-200 z-50',
          showIndicator ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        style={{
          top: -60,
          transform: `translateY(${pullDistance}px)`,
        }}
      >
        <div
          className={cn(
            'flex items-center justify-center w-12 h-12 rounded-full',
            'bg-primary/10 border border-primary/20',
            isRefreshing && 'bg-primary/20'
          )}
        >
          {isRefreshing ? (
            <RefreshCw className="w-6 h-6 text-primary animate-spin" />
          ) : (
            <ArrowDown
              className={cn(
                'w-6 h-6 text-primary transition-transform duration-200',
                progress >= 1 && 'rotate-180'
              )}
              style={{
                opacity: progress,
                transform: `rotate(${progress >= 1 ? 180 : 0}deg)`,
              }}
            />
          )}
        </div>
      </div>

      {/* Pull progress bar */}
      {showIndicator && !isRefreshing && (
        <div
          className="absolute left-0 right-0 h-1 bg-primary/20 z-40"
          style={{ top: pullDistance - 4 }}
        >
          <div
            className="h-full bg-primary transition-all duration-100"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}

      {/* Content with transform */}
      <div
        className="transition-transform duration-200"
        style={{
          transform: isPulling || isRefreshing ? `translateY(${pullDistance}px)` : 'translateY(0)',
        }}
      >
        {children}
      </div>

      {/* Refreshing overlay message */}
      {isRefreshing && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 md:hidden">
          <div className="bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-medium shadow-lg flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Refreshing...
          </div>
        </div>
      )}
    </div>
  );
}

export default PullToRefresh;
