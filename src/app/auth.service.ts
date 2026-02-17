import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MockApiService, Usuario, AuthResponse } from './mock-api.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private nodeApiUrl = 'http://localhost:3002/api'; // Backend Node.js
  private useMock = false; // true = Mock API, false = MySQL real via Node.js

  constructor(private http: HttpClient, private mockApi: MockApiService) {}

  validarUsuario(cedula: string, fechaNacimiento: string): Observable<AuthResponse> {
    if (this.useMock) {
      return this.mockApi.validarUsuario(cedula, fechaNacimiento);
    } else {
      // Usar backend Node.js real
      const headers = new HttpHeaders({
        'Content-Type': 'application/json'
      });

      const body = {
        cedula: cedula,
        fecha_nacimiento: fechaNacimiento
      };

      return this.http.post<AuthResponse>(`${this.nodeApiUrl}/validar_usuario`, body, { headers });
    }
  }
}
