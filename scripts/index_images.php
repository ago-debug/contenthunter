<?php
/**
 * ContentHunter Image Indexer
 * 
 * Posiziona questo file nella cartella principale delle immagini sul tuo server.
 * Eseguilo tramite browser (es: https://tuosito.it/immagini/index_images.php)
 * genererà un file 'images_map.json' che verrà letto automaticamente dal PIM.
 */

header('Content-Type: application/json');

function scanImages($dir, $rootDir, &$map = []) {
    $items = scandir($dir);
    
    foreach ($items as $item) {
        if ($item === '.' || $item === '..' || $item === 'index_images.php' || $item === 'images_map.json') {
            continue;
        }

        $fullPath = $dir . DIRECTORY_SEPARATOR . $item;
        
        if (is_dir($fullPath)) {
            scanImages($fullPath, $rootDir, $map);
        } else {
            $info = pathinfo($item);
            $ext = isset($info['extension']) ? strtolower($info['extension']) : '';
            
            if (in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'])) {
                // Rimuoviamo l'estensione per il matching dello SKU
                $sku = strtolower($info['filename']);
                
                // Calcoliamo il percorso relativo rispetto alla root
                $relPath = str_replace($rootDir . DIRECTORY_SEPARATOR, '', $fullPath);
                // Normalizziamo gli slash per URL (Unix style)
                $relPath = str_replace('\\', '/', $relPath);
                
                if (!isset($map[$sku])) {
                    $map[$sku] = [];
                }
                
                // Evitiamo duplicati
                if (!in_array($relPath, $map[$sku])) {
                    $map[$sku][] = $relPath;
                }
            }
        }
    }
    return $map;
}

try {
    $start = microtime(true);
    $rootDir = __DIR__;
    $imageMap = [];
    
    scanImages($rootDir, $rootDir, $imageMap);
    
    $json = json_encode($imageMap, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    
    if (file_put_contents('images_map.json', $json)) {
        $end = microtime(true);
        $duration = round($end - $start, 3);
        
        echo json_encode([
            "status" => "success",
            "message" => "Indice generato con successo",
            "file" => "images_map.json",
            "products_found" => count($imageMap),
            "execution_time_sec" => $duration
        ], JSON_PRETTY_PRINT);
    } else {
        throw new Exception("Impossibile scrivere il file 'images_map.json'. Verifica i permessi della cartella.");
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "status" => "error",
        "message" => $e->getMessage()
    ], JSON_PRETTY_PRINT);
}
