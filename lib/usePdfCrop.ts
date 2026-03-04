import React, { useState, useRef, useEffect } from 'react';

export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

export const usePdfCrop = (canvasRef: React.RefObject<HTMLCanvasElement>) => {
    const [isDrawing, setIsDrawing] = useState(false);
    const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
    const [currentBox, setCurrentBox] = useState<Box | null>(null);

    const getCoordinates = (e: MouseEvent | TouchEvent) => {
        if (!canvasRef.current) return { x: 0, y: 0 };
        const rect = canvasRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        // Calculate relative coordinates in percentage (0-1000 for Gemini style)
        return {
            x: (clientX - rect.left) / rect.width,
            y: (clientY - rect.top) / rect.height
        };
    };

    const handleMouseDown = (e: any) => {
        const coords = getCoordinates(e.nativeEvent);
        setIsDrawing(true);
        setStartPoint(coords);
        setCurrentBox({ x: coords.x, y: coords.y, width: 0, height: 0 });
    };

    const handleMouseMove = (e: any) => {
        if (!isDrawing) return;
        const coords = getCoordinates(e.nativeEvent);

        setCurrentBox({
            x: Math.min(startPoint.x, coords.x),
            y: Math.min(startPoint.y, coords.y),
            width: Math.abs(coords.x - startPoint.x),
            height: Math.abs(coords.y - startPoint.y)
        });
    };

    const handleMouseUp = () => {
        setIsDrawing(false);
    };

    const clearBox = () => setCurrentBox(null);

    return {
        currentBox,
        isDrawing,
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
        clearBox
    };
};
