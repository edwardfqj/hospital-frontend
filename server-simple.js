const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware - CORS permisivo
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());

// Endpoint de validación simple (sin base de datos por ahora)
app.post('/api/validar_usuario', (req, res) => {
  try {
    const { cedula, fecha_nacimiento } = req.body;
    
    console.log('=== SERVIDOR SIMPLE ===');
    console.log('Datos recibidos:', { cedula, fecha_nacimiento });
    
    // Validación hardcoded para pruebas
    if (cedula === '1700000001' && fecha_nacimiento === '1990-05-20') {
      console.log('✅ Usuario válido');
      res.json({
        success: true,
        usuario: {
          id: 277961,
          cedula: '1700000001',
          nombre: null,
          fecha_nacimiento: '1990-05-20'
        }
      });
    } else {
      console.log('❌ Usuario inválido');
      res.json({
        success: false,
        error: 'Usuario no encontrado o datos incorrectos'
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error del servidor: ' + error.message
    });
  }
});

// Endpoint de prueba
app.get('/api/test', (req, res) => {
  res.json({
    status: 'success',
    message: 'Servidor simple funcionando',
    timestamp: new Date().toISOString()
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor SIMPLE corriendo en http://localhost:${PORT}`);
  console.log(`📡 Endpoints disponibles:`);
  console.log(`   POST /api/validar_usuario - Validar usuario`);
  console.log(`   GET  /api/test - Test de conexión`);
});

module.exports = app;
