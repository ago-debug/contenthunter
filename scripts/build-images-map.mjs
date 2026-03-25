#!/usr/bin/env node
/**
 * Genera images_map.json (o images_index.json) nello stesso formato usato da
 * POST /api/repositories/[id]/associate-images
 *
 * Uso:
 *   node scripts/build-images-map.mjs /percorso/cartella/immagini
 *   node scripts/build-images-map.mjs /percorso/cartella/immagini ./images_map.json
 *
 * Carica il file JSON generato nella stessa directory web dell'URL configurato
 * in Import Lab (es. https://.../IMAGES_SERITUALI/images_map.json).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Allineato a lib/image-map-extensions.ts */
const EXTS = [
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
];

function buildImageMap(root) {
    const imageMap = {};
    if (!fs.existsSync(root)) {
        console.error("Cartella non trovata:", root);
        process.exit(1);
    }
    const dirs = [root];

    while (dirs.length > 0) {
        const currentDir = dirs.pop();
        let files;
        try {
            files = fs.readdirSync(currentDir);
        } catch (e) {
            console.warn("Skip:", currentDir, e.message);
            continue;
        }

        for (const file of files) {
            const fullPath = path.join(currentDir, file);
            let stat;
            try {
                stat = fs.statSync(fullPath);
            } catch {
                continue;
            }

            if (stat.isDirectory()) {
                dirs.push(fullPath);
                continue;
            }

            const ext = path.extname(file).toLowerCase();
            if (!EXTS.includes(ext)) continue;

            const nameWithoutExt = path.basename(file, ext).toLowerCase();
            const relativePath = path.relative(root, fullPath);
            if (!imageMap[nameWithoutExt]) imageMap[nameWithoutExt] = [];
            imageMap[nameWithoutExt].push(relativePath);
        }
    }

    return imageMap;
}

function main() {
    const args = process.argv.slice(2);
    if (args.length < 1 || args[0] === "-h" || args[0] === "--help") {
        console.log(
            "Uso: node scripts/build-images-map.mjs <cartella_immagini> [file_output.json]\n" +
                "Default output: images_map.json nella directory corrente."
        );
        process.exit(args.length < 1 ? 1 : 0);
    }

    const root = path.resolve(args[0]);
    const outFile = path.resolve(args[1] || "images_map.json");

    console.log("Scansione:", root);
    const map = buildImageMap(root);
    const keys = Object.keys(map);
    let paths = 0;
    for (const k of keys) {
        paths += map[k].length;
    }

    fs.writeFileSync(outFile, JSON.stringify(map, null, 2), "utf8");
    console.log(
        "OK: scritto",
        outFile,
        "| chiavi (nomi file senza estensione):",
        keys.length,
        "| percorsi totali:",
        paths
    );
    console.log(
        "\nCarica questo file sul server web accanto alle immagini (stesso path dell'URL in Import Lab) " +
            "con nome images_map.json oppure images_index.json."
    );
}

main();
