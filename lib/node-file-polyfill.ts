/**
 * Cheerio (tramite dipendenze) legge `globalThis.File` all’import.
 * Node 18 e alcuni contesti di build Next non espongono `File` (presente da Node 20 come in browser) → ReferenceError.
 */
function install(): void {
    const g = globalThis as unknown as { File?: unknown; Blob?: typeof Blob };
    if (g.File !== undefined && g.File != null) return;
    const BlobConstructor = g.Blob;
    if (typeof BlobConstructor !== "function") return;

    class FilePolyfill extends BlobConstructor {
        name: string;
        lastModified: number;
        constructor(parts: BlobPart[], name: string, options?: FilePropertyBag) {
            super(parts, options);
            this.name = String(name ?? "");
            this.lastModified =
                options && typeof options.lastModified === "number" ? options.lastModified : Date.now();
        }
    }

    g.File = FilePolyfill as unknown as typeof File;
}

install();
export {};
