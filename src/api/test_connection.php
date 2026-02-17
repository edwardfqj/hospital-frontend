<?php
// Test específico de conexión a la base de datos
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

$host = 'localhost';
$dbname = 'agendamiento';
$username = 'root';
$password = 'Messi2002';

try {
    $conn = new mysqli($host, $username, $password, $dbname);
    
    if ($conn->connect_error) {
        throw new Exception("Error de conexión: " . $conn->connect_error);
    }
    
    // Test simple query
    $result = $conn->query("SELECT 1 as test");
    $row = $result->fetch_assoc();
    
    echo json_encode([
        'status' => 'success',
        'message' => 'Conexión a BD exitosa',
        'test_query' => $row['test']
    ]);
    
    $conn->close();
    
} catch (Exception $e) {
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage()
    ]);
}
?>
