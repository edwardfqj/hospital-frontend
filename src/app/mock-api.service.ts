import { Injectable } from '@angular/core';
import { Observable, of, delay } from 'rxjs';

export interface Usuario {
  id: number;
  cedula: string;
  nombre: string | null;
  fecha_nacimiento: string;
}

export interface AuthResponse {
  success: boolean;
  usuario?: Usuario;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MockApiService {
  
  // Base de datos simulada
  private usuarios = [
    {
      id: 277961,
      cedula: '1700000001',
      nombre: null,
      fecha_nacimiento: '1990-05-20'
    }
  ];

  validarUsuario(cedula: string, fechaNacimiento: string): Observable<AuthResponse> {
    console.log('=== MOCK API ===');
    console.log('Buscando usuario:', { cedula, fechaNacimiento });

    // Simular delay de red
    return of(this.buscarUsuario(cedula, fechaNacimiento)).pipe(
      delay(500) // Simular 500ms de latencia
    );
  }

  private buscarUsuario(cedula: string, fechaNacimiento: string): AuthResponse {
    const usuario = this.usuarios.find(u => 
      u.cedula === cedula && u.fecha_nacimiento === fechaNacimiento
    );

    if (usuario) {
      console.log('✅ Usuario encontrado:', usuario);
      return {
        success: true,
        usuario: usuario
      };
    } else {
      console.log('❌ Usuario no encontrado');
      return {
        success: false,
        error: 'Usuario no encontrado o datos incorrectos'
      };
    }
  }

  // Método para agregar usuarios de prueba
  agregarUsuario(id: number, cedula: string, fechaNacimiento: string) {
    this.usuarios.push({
      id,
      cedula,
      nombre: null,
      fecha_nacimiento: fechaNacimiento
    });
  }
}
