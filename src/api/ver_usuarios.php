<?php
require_once 'config.php';

// Mostrar usuarios existentes para pruebas
$sql = "SELECT pers_id, pers_ci, pers_nombre, pers_fech_naci 
        FROM persona 
        LIMIT 10";

$result = $conn->query($sql);

if ($result && $result->num_rows > 0) {
    $usuarios = [];
    while ($row = $result->fetch_assoc()) {
        $usuarios[] = [
            'id' => $row['pers_id'],
            'cedula' => $row['pers_ci'],
            'nombre' => $row['pers_nombre'],
            'fecha_nacimiento' => $row['pers_fech_naci']
        ];
    }
    
    echo json_encode([
        'status' => 'success',
        'usuarios' => $usuarios
    ]);
} else {
    echo json_encode([
        'status' => 'error',
        'message' => 'No hay usuarios en la base de datos'
    ]);
}

$conn->close();
?>
