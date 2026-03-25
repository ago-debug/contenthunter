<?php
/**
 * ContentHunter Image Indexer (allineato al PIM associate-images)
 *
 * Copia questo file nella cartella radice delle immagini sul server e aprilo nel browser
 * (es. https://tuosito.it/immagini/index_images.php) oppure eseguilo da CLI: php index_images.php
 *
 * Genera images_map.json letto da POST /api/repositories/[id]/associate-images
 *
 * Formato JSON: { "nomefile_senza_estensione_minuscolo": ["percorso/relativo.jpg", ...], ... }
 *
 * Estensioni come in app/api/repositories/[id]/associate-images/route.ts: jpg, jpeg, png, webp, gif
 * (SVG escluso: il PIM non lo indicizza nello stesso set.)
 */

declare(strict_types=1);

// Sicurezza: in produzione imposta una chiave e passa ?key=... nel browser, oppure proteggi con .htaccess
$INDEX_SECRET = getenv('CH_IMAGE_INDEX_SECRET') ?: '';

if (PHP_SAPI !== 'cli') {
    if ($INDEX_SECRET !== '') {
        $k = isset($_GET['key']) ? (string) $_GET['key'] : '';
        if (!hash_equals($INDEX_SECRET, $k)) {
            http_response_code(403);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['status' => 'error', 'message' => 'Forbidden'], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }
    header('Content-Type: application/json; charset=utf-8');
}

/** Stesso elenco di associate-images/route.ts (buildImageMap) */
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

/**
 * @param array<string, list<string>> $map
 * @return array<string, list<string>>
 */
function scanImages(string $dir, string $rootReal, array &$map): array
{
    $items = @scandir($dir);
    if ($items === false) {
        return $map;
    }

    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        // Non indicizzare lo script né i JSON generati (evita ricorsione / rumore)
        if ($item === 'index_images.php' || $item === 'images_map.json' || $item === 'images_index.json') {
            continue;
        }

        $fullPath = $dir . DIRECTORY_SEPARATOR . $item;

        if (is_dir($fullPath)) {
            scanImages($fullPath, $rootReal, $map);
            continue;
        }

        $info = pathinfo($item);
        $ext = isset($info['extension']) ? strtolower((string) $info['extension']) : '';

        if (!in_array($ext, ALLOWED_EXT, true)) {
            continue;
        }

        $key = strtolower((string) $info['filename']);
        $relPath = relativePathFromRoot($fullPath, $rootReal);

        if (!isset($map[$key])) {
            $map[$key] = [];
        }
        if (!in_array($relPath, $map[$key], true)) {
            $map[$key][] = $relPath;
        }
    }

    return $map;
}

function relativePathFromRoot(string $fullPath, string $rootReal): string
{
    $full = realpath($fullPath);
    $root = $rootReal;
    if ($full === false) {
        return str_replace('\\', '/', $fullPath);
    }
    $prefix = rtrim($root, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
    if (strncmp($full, $prefix, strlen($prefix)) === 0) {
        $rel = substr($full, strlen($prefix));
    } else {
        // fallback
        $rel = str_replace(rtrim($root, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR, '', $full);
    }
    return str_replace('\\', '/', $rel);
}

try {
    $start = microtime(true);
    $rootDir = __DIR__;
    $rootReal = realpath($rootDir);
    if ($rootReal === false) {
        throw new RuntimeException('Impossibile risolvere il percorso della cartella.');
    }

    $imageMap = [];
    scanImages($rootDir, $rootReal, $imageMap);

    $outFile = $rootDir . DIRECTORY_SEPARATOR . 'images_map.json';
    $json = json_encode(
        $imageMap,
        JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR
    );

    if (file_put_contents($outFile, $json) === false) {
        throw new RuntimeException("Impossibile scrivere images_map.json. Verifica i permessi in: {$rootDir}");
    }

    $end = microtime(true);
    $duration = round($end - $start, 3);

    $payload = [
        'status' => 'success',
        'message' => 'Indice generato con successo',
        'file' => 'images_map.json',
        'keys' => count($imageMap),
        'execution_time_sec' => $duration,
    ];

    if (PHP_SAPI !== 'cli') {
        echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    } else {
        fwrite(STDOUT, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL);
    }
} catch (Throwable $e) {
    if (PHP_SAPI !== 'cli') {
        http_response_code(500);
    }
    $err = ['status' => 'error', 'message' => $e->getMessage()];
    echo json_encode($err, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit(1);
}
