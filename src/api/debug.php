<?php
// Archivo de debug para ver qué está llegando
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

echo json_encode([
    'status' => 'debug',
    'method' => $_SERVER['REQUEST_METHOD'],
    'post_data' => file_get_contents("php://input"),
    'headers' => getallheaders()
]);
?>
