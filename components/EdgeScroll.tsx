import React, { useRef, useState, useEffect, ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface EdgeScrollProps {
    children: ReactNode;
    className?: string;
}

export function EdgeScroll({ children, className = "" }: EdgeScrollProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [showLeft, setShowLeft] = useState(false);
    const [showRight, setShowRight] = useState(false);
    const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const updateArrows = () => {
        if (!scrollContainerRef.current) return;
        const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
        setShowLeft(scrollLeft > 0);
        setShowRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth);
    };

    useEffect(() => {
        updateArrows();
        // Attaching resize observer to auto-show/hide arrows if content size changes
        const observer = new ResizeObserver(updateArrows);
        if (scrollContainerRef.current) {
            observer.observe(scrollContainerRef.current);
            // Also observe children to react to dynamic content load
            Array.from(scrollContainerRef.current.children).forEach(child => observer.observe(child));
        }
        return () => observer.disconnect();
    }, []);

    const startScroll = (direction: 'left' | 'right') => {
        if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = setInterval(() => {
            if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollBy({
                    left: direction === 'right' ? 20 : -20,
                    behavior: 'auto'
                });
            }
        }, 16);
    };

    const stopScroll = () => {
        if (scrollIntervalRef.current) {
            clearInterval(scrollIntervalRef.current);
            scrollIntervalRef.current = null;
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!scrollContainerRef.current) return;
        const rect = scrollContainerRef.current.getBoundingClientRect();
        const threshold = 120; // larger detection zone for smoother feel

        const mouseX = e.clientX;
        const distFromLeft = mouseX - rect.left;
        const distFromRight = rect.right - mouseX;

        if (distFromLeft < threshold && showLeft) {
            // Speed increases as you get closer to the edge
            const speed = Math.max(5, 30 * (1 - distFromLeft / threshold));
            if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
            scrollIntervalRef.current = setInterval(() => {
                scrollContainerRef.current?.scrollBy({ left: -speed, behavior: 'auto' });
            }, 16);
        } else if (distFromRight < threshold && showRight) {
            const speed = Math.max(5, 30 * (1 - distFromRight / threshold));
            if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
            scrollIntervalRef.current = setInterval(() => {
                scrollContainerRef.current?.scrollBy({ left: speed, behavior: 'auto' });
            }, 16);
        } else {
            stopScroll();
        }
    };

    const handleScroll = () => {
        updateArrows();
    };

    return (
        <div className={`relative group ${className}`} onMouseMove={handleMouseMove} onMouseLeave={stopScroll}>
            {/* Left fade/arrow - Less invasive, premium glassmorphism */}
            <div
                className={`absolute top-0 left-0 bottom-0 w-16 bg-gradient-to-r from-white via-white/40 to-transparent z-10 pointer-events-none transition-opacity duration-500 flex items-center justify-start ${showLeft ? 'opacity-100' : 'opacity-0'}`}
            >
                <div className="w-6 h-6 ml-1.5 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-slate-400 shadow-[0_4px_12px_rgba(0,0,0,0.05)] border border-white/20">
                    <ChevronLeft className="w-3.5 h-3.5 mr-0.5" />
                </div>
            </div>

            {/* Scrollable Container */}
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="w-full overflow-x-auto overflow-y-visible custom-scrollbar relative"
            >
                {children}
            </div>

            {/* Right fade/arrow - Less invasive, premium glassmorphism */}
            <div
                className={`absolute top-0 right-0 bottom-0 w-16 bg-gradient-to-l from-white via-white/40 to-transparent z-10 pointer-events-none transition-opacity duration-500 flex items-center justify-end ${showRight ? 'opacity-100' : 'opacity-0'}`}
            >
                <div className="w-6 h-6 mr-1.5 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-slate-400 shadow-[0_4px_12px_rgba(0,0,0,0.05)] border border-white/20">
                    <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                </div>
            </div>
        </div>
    );
}

// Ensure the component handles window resize
export default EdgeScroll;
