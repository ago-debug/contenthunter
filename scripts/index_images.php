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
 * Estensioni allineate a lib/image-map-extensions.ts
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

/** Stesso elenco di lib/image-map-extensions.ts */
const ALLOWED_EXT = [
    'jpg', 'jpeg', 'jfif', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'svg', 'ico', 'avif', 'heic',
];

/**
 * @param array<string, list<string>> $map
 * @return array<string, list<string>>
 */
function scanImages(string $dir, string $rootDirNorm, array &$map, array &$stats): array
{
    $items = @scandir($dir);
    if ($items === false) {
        $stats['dirs_unreadable']++;
        return $map;
    }

    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        if ($item === 'index_images.php' || $item === 'images_map.json' || $item === 'images_index.json') {
            continue;
        }

        $fullPath = $dir . DIRECTORY_SEPARATOR . $item;

        if (is_dir($fullPath)) {
            scanImages($fullPath, $rootDirNorm, $map, $stats);
            continue;
        }

        if (!is_file($fullPath)) {
            continue;
        }

        $info = pathinfo($item);
        $ext = isset($info['extension']) ? strtolower((string) $info['extension']) : '';

        if (!in_array($ext, ALLOWED_EXT, true)) {
            continue;
        }

        $key = strtolower((string) $info['filename']);
        $relPath = relativePathFromRoot($fullPath, $rootDirNorm);
        $stats['files_indexed']++;

        if (!isset($map[$key])) {
            $map[$key] = [];
        }
        if (!in_array($relPath, $map[$key], true)) {
            $map[$key][] = $relPath;
        }
    }

    return $map;
}

/**
 * Percorso relativo alla root (solo slash /), senza dipendere solo da realpath
 * (evita path assoluti o vuoti su Windows / symlink).
 */
function relativePathFromRoot(string $fullPath, string $rootDirNorm): string
{
    $norm = static function (string $p): string {
        return str_replace('\\', '/', $p);
    };

    $root = rtrim($norm($rootDirNorm), '/');
    $full = $norm($fullPath);

    $prefix = $root . '/';
    if (strncmp($full, $prefix, strlen($prefix)) === 0) {
        return substr($full, strlen($prefix));
    }

    $rr = realpath($rootDirNorm);
    $rf = realpath($fullPath);
    if ($rr !== false && $rf !== false) {
        $r = rtrim(str_replace('\\', '/', $rr), '/') . '/';
        $f = str_replace('\\', '/', $rf);
        if (strncmp($f, $r, strlen($r)) === 0) {
            return substr($f, strlen($r));
        }
    }

    // Windows: confronto case-insensitive per prefisso
    $isWin = (defined('PHP_OS_FAMILY') && PHP_OS_FAMILY === 'Windows')
        || (stripos((string) PHP_OS, 'WIN') === 0);
    if ($isWin) {
        $rp = rtrim(str_replace('\\', '/', $rootDirNorm), '/') . '/';
        $fp = str_replace('\\', '/', $fullPath);
        if (strlen($fp) >= strlen($rp) && strcasecmp(substr($fp, 0, strlen($rp)), $rp) === 0) {
            return substr($fp, strlen($rp));
        }
    }

    // Ultimo tentativo: strip prefisso root case-insensitive (path UNC / symlink)
    $stripped = preg_replace('#^' . preg_quote($root, '#') . '/#i', '', $full, 1);
    if ($stripped !== $full && $stripped !== '') {
        return $stripped;
    }

    return ltrim(str_replace('\\', '/', str_replace($root . '/', '', $full)), '/');
}

try {
    if (PHP_SAPI !== 'cli') {
        @set_time_limit(0);
        @ini_set('max_execution_time', '0');
    }
    @ini_set('memory_limit', '512M');

    $start = microtime(true);
    $rootDir = __DIR__;
    $rootReal = realpath($rootDir);
    if ($rootReal === false) {
        throw new RuntimeException('Impossibile risolvere il percorso della cartella.');
    }

    $rootDirNorm = str_replace('\\', '/', $rootReal);
    $imageMap = [];
    $stats = ['files_indexed' => 0, 'dirs_unreadable' => 0];

    scanImages($rootDir, $rootDirNorm, $imageMap, $stats);

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
        'files_indexed' => $stats['files_indexed'],
        'dirs_unreadable' => $stats['dirs_unreadable'],
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
