<?php
require_once 'config.php';

// Obtener datos del POST
$data = json_decode(file_get_contents("php://input"));

if (!$data || !isset($data->cedula) || !isset($data->fecha_nacimiento)) {
    http_response_code(400);
    echo json_encode(['error' => 'Datos incompletos']);
    exit();
}

$cedula = $conn->real_escape_string($data->cedula);
$fecha_nacimiento = $conn->real_escape_string($data->fecha_nacimiento);

// Consultar si el usuario existe en la tabla persona
$sql = "SELECT pers_id, pers_nombre, pers_ci, pers_fech_naci 
        FROM persona 
        WHERE pers_ci = ? AND pers_fech_naci = ?";

$stmt = $conn->prepare($sql);
$stmt->bind_param("ss", $cedula, $fecha_nacimiento);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows > 0) {
    $usuario = $result->fetch_assoc();
    
    // Respuesta exitosa
    echo json_encode([
        'success' => true,
        'usuario' => [
            'id' => $usuario['pers_id'],
            'cedula' => $usuario['pers_ci'],
            'nombre' => $usuario['pers_nombre'],
            'fecha_nacimiento' => $usuario['pers_fech_naci']
        ]
    ]);
} else {
    // Usuario no encontrado
    echo json_encode([
        'success' => false,
        'error' => 'Usuario no encontrado o datos incorrectos'
    ]);
}

$stmt->close();
$conn->close();
?>
