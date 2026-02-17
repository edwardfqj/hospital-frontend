<?php
// Archivo de prueba para verificar la conexión a la base de datos
require_once 'config.php';

// Probar conexión
if ($conn->connect_error) {
    echo json_encode(['status' => 'error', 'message' => 'Error de conexión: ' . $conn->connect_error]);
    exit();
}

// Probar consulta simple
$sql = "SELECT COUNT(*) as total FROM persona";
$result = $conn->query($sql);

if ($result) {
    $row = $result->fetch_assoc();
    echo json_encode([
        'status' => 'success', 
        'message' => 'Conexión exitosa a la base de datos',
        'total_personas' => $row['total']
    ]);
} else {
    echo json_encode(['status' => 'error', 'message' => 'Error en la consulta: ' . $conn->error]);
}

$conn->close();
?>
