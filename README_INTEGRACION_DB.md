# Integración con Base de Datos - Sistema de Citas Hospitalarias

## 📋 Requisitos

1. **Servidor Web** (Apache/Nginx) con PHP 7.4+
2. **Base de Datos MySQL** con la estructura `agendamiento.sql`
3. **Angular CLI** para el frontend

## 🗄️ Configuración de la Base de Datos

1. Importa el archivo `agendamiento.sql` a tu base de datos MySQL
2. Asegúrate que la tabla `persona` exista con los campos:
   - `pers_id` (ID del paciente)
   - `pers_ci` (Cédula del paciente)
   - `pers_fecha_nacimiento` (Fecha de nacimiento)
   - `pers_nombre` (Nombre del paciente)

## 🔧 Configuración PHP

1. Copia los archivos de la API a tu servidor web:
   ```
   api/
   ├── config.php
   ├── validar_usuario.php
   ├── test.php
   └── .htaccess
   ```

2. Configura la conexión a la base de datos en `api/config.php`:
   ```php
   $host = 'localhost';
   $dbname = 'agendamiento'; // Nombre de tu base de datos
   $username = 'root'; // Usuario de la base de datos
   $password = ''; // Contraseña de la base de datos
   ```

3. Asegúrate que el módulo `mysqli` esté habilitado en PHP

## 🧪 Probar la API

1. Accede a `http://localhost/api/test.php` para verificar la conexión
2. Deberías ver una respuesta como:
   ```json
   {
     "status": "success",
     "message": "Conexión exitosa a la base de datos",
     "total_personas": 1234
   }
   ```

## 🚀 Configuración Angular

1. El frontend ya está configurado para usar la API en `http://localhost/api`
2. Si tu API está en otra URL, modifica `auth.service.ts`:
   ```typescript
   private apiUrl = 'http://tu-dominio/api';
   ```

## 📱 Flujo de Autenticación

1. **Frontend**: Usuario ingresa cédula y fecha de nacimiento
2. **Angular**: Envía datos a `api/validar_usuario.php`
3. **PHP**: Valida contra la tabla `persona` en MySQL
4. **Respuesta**: 
   - ✅ Si existe: Retorna datos del usuario y permite continuar
   - ❌ Si no existe: Retorna error

## 🔍 Validaciones Implementadas

- **Formato de cédula**: 8-10 dígitos numéricos
- **Validación en BD**: Verifica cédula y fecha de nacimiento coincidan
- **Manejo de errores**: Muestra mensajes claros al usuario
- **CORS**: Configurado para permitir peticiones desde Angular

## 🐛 Solución de Problemas

### Error de conexión
- Verifica que MySQL esté corriendo
- Confirma credenciales en `config.php`
- Revisa que la base de datos exista

### Error CORS
- Asegúrate que `.htaccess` esté en la carpeta `api`
- Verifica que `mod_headers` esté habilitado en Apache

### Error 404 en API
- Confirma que los archivos PHP estén en la ubicación correcta
- Verifica la configuración del servidor web

## 📞 Soporte

Si tienes problemas, revisa:
1. Logs de errores de Apache/Nginx
2. Consola del navegador para errores de red
3. Logs de PHP para errores de conexión a BD
