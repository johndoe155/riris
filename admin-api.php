<?php
/**
 * BIC Admin API — admin-api.php
 * Place this file in the ROOT of your website (same folder as index.html).
 * 
 * Handles:
 *   - GET  ?action=get_gallery          → returns gallery-data.json
 *   - POST ?action=upload_image         → saves an image to /images/
 *   - POST ?action=save_gallery         → writes gallery-data.json
 *   - POST ?action=delete_image         → deletes an image file from /images/
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────
define('ADMIN_PASSWORD',   'admin123');          // Change if you like
define('GALLERY_JSON',     __DIR__ . '/gallery-data.json');
define('IMAGES_DIR',       __DIR__ . '/images/');
define('ALLOWED_MIME',     ['image/jpeg','image/png','image/webp','image/gif']);
define('MAX_FILE_BYTES',   8 * 1024 * 1024);     // 8 MB per image
// ─────────────────────────────────────────────────────────────────────────────

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');           // tighten for production
header('Access-Control-Allow-Headers: Content-Type, X-Admin-Token');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ── Auth check ────────────────────────────────────────────────────────────────
$token = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? ($_POST['token'] ?? '');
if ($token !== ADMIN_PASSWORD) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Unauthorized']);
    exit;
}

$action = $_GET['action'] ?? '';

// ── Route ─────────────────────────────────────────────────────────────────────
switch ($action) {

    // ── GET gallery ──────────────────────────────────────────────────────────
    case 'get_gallery':
        if (!file_exists(GALLERY_JSON)) {
            // Bootstrap with demo data from the current index.html
            $demo = [
                [
                    'id'       => 'item-' . uniqid(),
                    'title'    => 'Science Fair 2024',
                    'subtitle' => 'Innovation & Technology',
                    'images'   => ['images/gallery1.jpg','images/gallery1-2.jpg','images/gallery1-3.jpg']
                ],
                [
                    'id'       => 'item-' . uniqid(),
                    'title'    => 'Sports Day',
                    'subtitle' => 'Athletics & Teamwork',
                    'images'   => ['images/gallery1.jpg']
                ],
                [
                    'id'       => 'item-' . uniqid(),
                    'title'    => 'Cultural Festival',
                    'subtitle' => 'Diversity & Arts',
                    'images'   => ['images/gallery1.jpg']
                ]
            ];
            file_put_contents(GALLERY_JSON, json_encode($demo, JSON_PRETTY_PRINT));
        }
        echo file_get_contents(GALLERY_JSON);
        break;

    // ── SAVE gallery ─────────────────────────────────────────────────────────
    case 'save_gallery':
        $raw  = file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Invalid JSON body']);
            break;
        }
        // Sanitise each item
        $clean = [];
        foreach ($data as $item) {
            $clean[] = [
                'id'       => preg_replace('/[^a-z0-9\-]/', '', $item['id']   ?? ('item-' . uniqid())),
                'title'    => htmlspecialchars_decode(strip_tags($item['title']    ?? '')),
                'subtitle' => htmlspecialchars_decode(strip_tags($item['subtitle'] ?? '')),
                'images'   => array_values(array_filter(array_map('strval', $item['images'] ?? [])))
            ];
        }
        if (file_put_contents(GALLERY_JSON, json_encode($clean, JSON_PRETTY_PRINT)) !== false) {
            echo json_encode(['ok' => true, 'message' => 'Gallery saved.']);
        } else {
            http_response_code(500);
            echo json_encode(['ok' => false, 'error' => 'Could not write gallery-data.json. Check folder permissions.']);
        }
        break;

    // ── UPLOAD image ─────────────────────────────────────────────────────────
    case 'upload_image':
        if (empty($_FILES['image'])) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'No file received.']);
            break;
        }
        $file = $_FILES['image'];

        // Validate size
        if ($file['size'] > MAX_FILE_BYTES) {
            http_response_code(413);
            echo json_encode(['ok' => false, 'error' => 'File too large (max 8 MB).']);
            break;
        }

        // Validate MIME via finfo (not just extension)
        $finfo    = new finfo(FILEINFO_MIME_TYPE);
        $mime     = $finfo->file($file['tmp_name']);
        if (!in_array($mime, ALLOWED_MIME, true)) {
            http_response_code(415);
            echo json_encode(['ok' => false, 'error' => 'Unsupported file type: ' . $mime]);
            break;
        }

        // Build safe filename: originalname-timestamp.ext
        $ext      = ['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp','image/gif'=>'gif'][$mime];
        $baseName = pathinfo($file['name'], PATHINFO_FILENAME);
        $baseName = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $baseName);
        $safeName = $baseName . '-' . time() . '.' . $ext;
        $dest     = IMAGES_DIR . $safeName;

        // Ensure images dir exists
        if (!is_dir(IMAGES_DIR)) {
            mkdir(IMAGES_DIR, 0755, true);
        }

        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            http_response_code(500);
            echo json_encode(['ok' => false, 'error' => 'Failed to move uploaded file. Check /images/ folder permissions.']);
            break;
        }

        echo json_encode(['ok' => true, 'path' => 'images/' . $safeName]);
        break;

    // ── DELETE image ─────────────────────────────────────────────────────────
    case 'delete_image':
        $raw  = file_get_contents('php://input');
        $body = json_decode($raw, true);
        $rel  = $body['path'] ?? '';

        // Only allow paths inside /images/
        $rel = ltrim($rel, '/');
        if (!preg_match('#^images/[a-zA-Z0-9_\-\.]+$#', $rel)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Invalid path.']);
            break;
        }
        $full = __DIR__ . '/' . $rel;
        if (file_exists($full)) {
            unlink($full);
            echo json_encode(['ok' => true, 'message' => 'Deleted.']);
        } else {
            echo json_encode(['ok' => true, 'message' => 'File not found (already deleted).']);
        }
        break;

    default:
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Unknown action: ' . htmlspecialchars($action)]);
}
