/**
 * Estensioni incluse in images_map.json / buildImageMap / index_images.php
 * (mantenere allineati associate-images e script esterni).
 */
export const IMAGE_MAP_FILE_EXTENSIONS = [
    ".jpg",
    ".jpeg",
    ".jfif",
    ".png",
    ".webp",
    ".gif",
    ".bmp",
    ".tif",
    ".tiff",
    ".svg",
    ".ico",
    ".avif",
    ".heic",
] as const;

export function isImageMapExtension(extWithDot: string): boolean {
    const e = extWithDot.toLowerCase();
    return (IMAGE_MAP_FILE_EXTENSIONS as readonly string[]).includes(e);
}
