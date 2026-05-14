/**
 * Coordinate Gemini/OpenAI per `image_bbox`: [ymin, xmin, ymax, xmax] scala 0–1000.
 * Usare solo nel browser (canvas).
 */

export function bboxNormalizedToPixelRect(
    bbox: number[],
    width: number,
    height: number
): { left: number; top: number; width: number; height: number } {
    const ymin = Number(bbox[0]);
    const xmin = Number(bbox[1]);
    const ymax = Number(bbox[2]);
    const xmax = Number(bbox[3]);
    const left = Math.floor((xmin / 1000) * width);
    const top = Math.floor((ymin / 1000) * height);
    const right = Math.ceil((xmax / 1000) * width);
    const bottom = Math.ceil((ymax / 1000) * height);
    const w = Math.max(1, right - left);
    const h = Math.max(1, bottom - top);
    return { left, top, width: w, height: h };
}

export function cropViewportCanvasToJpegDataUrl(
    sourceCanvas: HTMLCanvasElement,
    bbox: number[],
    quality = 0.9
): string {
    const { width, height } = sourceCanvas;
    const r = bboxNormalizedToPixelRect(bbox, width, height);
    const out = document.createElement("canvas");
    out.width = r.width;
    out.height = r.height;
    const ctx = out.getContext("2d");
    if (!ctx) {
        throw new Error("Canvas 2D non disponibile");
    }
    ctx.drawImage(sourceCanvas, r.left, r.top, r.width, r.height, 0, 0, r.width, r.height);
    return out.toDataURL("image/jpeg", quality);
}

export function isValidBbox1000(bbox: unknown): bbox is number[] {
    return Array.isArray(bbox) && bbox.length === 4 && bbox.every((n) => Number.isFinite(Number(n)));
}
