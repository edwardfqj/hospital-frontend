import { ChangeDetectorRef, Component, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { catchError, finalize, of, timeout } from 'rxjs';


interface Appointment {
  id: string;
  patientId: string;
  specialty: string;
  espeId: number;
  doctorId: number;
  doctorName: string;
  durationMinutes: number;
  date: Date;
  time: string;
}

interface Specialty {
  id: number;
  nombre: string;
}

interface Doctor {
  id: number;
  nombre: string;
  espe_id: number;
}

interface AvailableSlotsResponse {
  status: string;
  durationMinutes: number | null;
  slots: string[];
  message?: string;
}

interface AvailableDatesResponse {
  status: string;
  medi_id?: number;
  from?: string;
  to?: string;
  availableDates: string[];
  message?: string;
}

interface Patient {
  id: string;
  cedula: string;
  birthDate: Date;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('Sistema de Citas Hospitalarias');

  private apiBaseUrl = 'https://hospital-backend-xyz.onrender.com/api';
  
  // Form states
  currentStep: 'login' | 'specialty' | 'doctor' | 'datetime' | 'confirmation' = 'login';
  
  // Patient data
  patientCedula = '';
  patientBirthDate = '';
  currentPatient = signal<Patient | null>(null);
  
  // Appointment data
  selectedSpecialty = '';
  selectedEspeId: number | null = null;
  selectedDoctorId: number | null = null;
  selectedDoctorName = '';
  selectedDurationMinutes = 30;
  selectedDate = '';
  selectedTime = '';

  calendarMonth = new Date();
  doctorAvailableDates = new Set<string>();
  doctorDatesLoading = false;
  doctorDatesError = '';

  doctorSlots: string[] = [];
  doctorSlotsLoading = false;
  doctorSlotsError = '';

  lastDurationResp: any = null;
  lastSlotsResp: any = null;
  
  // Data storage
  appointments = signal<Appointment[]>([]);
  
  specialties: Specialty[] = [];
  doctors: Doctor[] = [];
  doctorsLoading = false;
  doctorsLoadError = '';
  doctorsLastUrl = '';
  doctorsLastEspeId: number | null = null;
  doctorsLastStatus = '';
  doctorsLastCount: number | null = null;
  
  // Available time slots
  timeSlots = [
    '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
    '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
    '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
    '17:00', '17:30', '18:00'
  ];
  
  // Validation messages
  errorMessage = '';
  successMessage = '';
  
  constructor(
    private authService: AuthService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {
    this.loadStoredData();
    this.loadSpecialties();
  }

  getSpecialtyImageUrl(specialty: Specialty): string {
    const raw = (specialty?.nombre || '').toString().trim().toLowerCase();
    const normalize = (s: string) => s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9]/g, '');

    const key = normalize(raw);

    const map: Record<string, string> = {
      nefrologia: '/nefrolog%C3%ADa.png',
      neonatologia: '/neonatologia.png',
      nutricion: '/nutricion.png',
      pediatria: '/pediatria.png',
      psicorehabilitacion: '/psicorehabilitacion.png',
      psiquitria: '/psiquitria.png',
      psiquiatria: '/psiquitria.png'
    };

    return map[key] || '/icono.jpg';
  }

  private loadSpecialties() {
    this.http.get<{ status: string; especialidades: Specialty[] }>(`${this.apiBaseUrl}/especialidades`)
      .subscribe({
        next: (resp) => {
          if (resp?.status === 'success' && Array.isArray(resp.especialidades)) {
            this.specialties = resp.especialidades;
          } else {
            this.errorMessage = 'No se pudieron cargar las especialidades.';
          }
        },
        error: () => {
          this.errorMessage = 'Error de conexión al cargar especialidades.';
        }
      });
  }
  
  private loadStoredData() {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('hospital_appointments');
      if (stored) {
        const parsed = JSON.parse(stored, (key, value) => {
          if (key === 'date') return new Date(value);
          return value;
        });

        if (Array.isArray(parsed)) {
          const migrated = parsed.map((apt: any) => ({
            ...apt,
            espeId: typeof apt?.espeId === 'number' ? apt.espeId : 0,
            doctorId: typeof apt?.doctorId === 'number' ? apt.doctorId : 0,
            doctorName: typeof apt?.doctorName === 'string' ? apt.doctorName : '',
            durationMinutes: typeof apt?.durationMinutes === 'number' ? apt.durationMinutes : 30
          }));
          this.appointments.set(migrated);
        }
      }
    }
  }
  
  private saveData() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('hospital_appointments', JSON.stringify(this.appointments()));
    }
  }
  
  validatePatient() {
    console.log('=== VALIDACIÓN CON NODE.JS API ===');
    console.log('Datos ingresados:', {
      cedula: this.patientCedula,
      fechaNacimiento: this.patientBirthDate
    });
    
    this.errorMessage = '';
    this.successMessage = '';
    
    if (!this.patientCedula || !this.patientBirthDate) {
      this.errorMessage = 'Por favor ingrese todos los campos';
      return;
    }
    
    // Usar el AuthService con backend Node.js
    this.authService.validarUsuario(this.patientCedula, this.patientBirthDate)
      .subscribe({
        next: (response) => {
          console.log('✅ Respuesta de Node.js API:', response);
          
          if (response.success && response.usuario) {
            // Crear paciente con datos de la base de datos
            const patient: Patient = {
              id: response.usuario.id.toString(),
              cedula: response.usuario.cedula,
              birthDate: new Date(response.usuario.fecha_nacimiento)
            };
            
            this.currentPatient.set(patient);
            this.currentStep = 'specialty';
            const nombre = response.usuario.nombre || 'Paciente';
            this.successMessage = `¡Bienvenido ${nombre}! Ahora seleccione una especialidad`;
          } else {
            this.errorMessage = response.error || 'Usuario no encontrado o datos incorrectos';
          }
        },
        error: (error) => {
          console.error('❌ Error de Node.js API:', error);
          this.errorMessage = 'Error de conexión con el servidor. Por favor intente más tarde.';
        }
      });
  }

  selectSpecialty(specialty: Specialty) {
    this.selectedSpecialty = specialty.nombre;
    this.selectedEspeId = specialty.id;
    this.selectedDoctorId = null;
    this.selectedDoctorName = '';
    this.selectedDate = '';
    this.selectedTime = '';
    this.doctors = [];
    this.doctorsLoadError = '';
    this.doctorsLoading = true;
    this.doctorsLastEspeId = specialty.id;
    this.doctorsLastCount = null;
    this.doctorsLastStatus = 'loading';

    this.successMessage = `Especialidad seleccionada: ${specialty.nombre}`;
    this.loadDoctorsBySpecialty(specialty.id);
    this.currentStep = 'doctor';
  }

  private loadDoctorsBySpecialty(espeId: number) {
    this.doctorsLoading = true;
    this.doctorsLoadError = '';
    this.doctorsLastStatus = 'loading';
    this.doctorsLastCount = null;

    const url = `${this.apiBaseUrl}/medicos?espe_id=${espeId}`;
    this.doctorsLastUrl = url;
    this.doctorsLastEspeId = espeId;
    console.log('[doctors] GET', url);

    this.http.get<{ status: string; medicos: Doctor[] }>(url)
      .pipe(
        timeout(8000),
        catchError((err) => {
          console.error('[doctors] error', err);
          this.doctors = [];
          this.doctorsLastStatus = 'error';
          this.doctorsLastCount = null;
          const message = err?.message ? String(err.message) : 'Error de conexión al cargar médicos.';
          this.doctorsLoadError = message;
          this.doctorsLoading = false;
          this.cdr.detectChanges();
          return of({ status: 'error', medicos: [] as Doctor[] });
        }),
        finalize(() => {
          this.doctorsLoading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe((resp) => {
        this.doctorsLastStatus = resp?.status ?? '';
        if (resp?.status === 'success' && Array.isArray(resp.medicos)) {
          this.doctors = resp.medicos;
          this.doctorsLastCount = resp.medicos.length;
          console.log('[doctors] OK count=', resp.medicos.length);
        } else if (resp?.status !== 'error') {
          this.doctors = [];
          this.doctorsLoadError = 'No se pudieron cargar los médicos.';
          this.doctorsLastCount = 0;
          this.doctorsLastStatus = 'error';
          console.log('[doctors] Unexpected response', resp);
        }

        this.doctorsLoading = false;
        if (this.doctorsLastCount === null) {
          this.doctorsLastCount = Array.isArray(this.doctors) ? this.doctors.length : 0;
        }
        this.cdr.detectChanges();
      });
  }

  selectDoctor(doctor: Doctor) {
    this.selectedDoctorId = doctor.id;
    this.selectedDoctorName = doctor.nombre;
    this.selectedDurationMinutes = 30;
    this.currentStep = 'datetime';
    this.successMessage = `Médico seleccionado: ${doctor.nombre}`;

    this.selectedDate = '';
    this.selectedTime = '';
    this.doctorSlots = [];
    this.doctorSlotsError = '';

    this.calendarMonth = new Date(this.getMinDate() + 'T00:00:00');
    this.loadAvailableDatesForDoctorMonth(doctor.id, this.calendarMonth);
  }

  onDateSelected(dateIso: string) {
    this.selectedDate = dateIso;
    this.selectedTime = '';

    if (this.selectedDoctorId) {
      this.loadDurationMinutesForDoctor(this.selectedDoctorId);
      this.loadAvailableSlotsForDoctor(this.selectedDoctorId, this.selectedDate);
    }
  }

  prevMonth() {
    const d = new Date(this.calendarMonth);
    d.setMonth(d.getMonth() - 1);
    this.calendarMonth = d;
    if (this.selectedDoctorId) {
      this.loadAvailableDatesForDoctorMonth(this.selectedDoctorId, this.calendarMonth);
    }
  }

  nextMonth() {
    const d = new Date(this.calendarMonth);
    d.setMonth(d.getMonth() + 1);
    this.calendarMonth = d;
    if (this.selectedDoctorId) {
      this.loadAvailableDatesForDoctorMonth(this.selectedDoctorId, this.calendarMonth);
    }
  }

  getCalendarTitle(): string {
    return this.calendarMonth.toLocaleDateString('es-EC', { month: 'long', year: 'numeric' });
  }

  getCalendarCells(): Array<{ dateIso: string | null; day: number | null; enabled: boolean; selected: boolean }> {
    const year = this.calendarMonth.getFullYear();
    const month = this.calendarMonth.getMonth();
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const jsDow = first.getDay();
    const mondayIndex = (jsDow + 6) % 7;
    const cells: Array<{ dateIso: string | null; day: number | null; enabled: boolean; selected: boolean }> = [];

    for (let i = 0; i < mondayIndex; i++) {
      cells.push({ dateIso: null, day: null, enabled: false, selected: false });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const iso = this.toIsoDate(d);
      const enabled = this.doctorAvailableDates.has(iso);
      const selected = this.selectedDate === iso;
      cells.push({ dateIso: iso, day, enabled, selected });
    }

    while (cells.length % 7 !== 0) {
      cells.push({ dateIso: null, day: null, enabled: false, selected: false });
    }

    return cells;
  }

  private toIsoDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private loadAvailableDatesForDoctorMonth(mediId: number, monthDate: Date) {
    this.doctorDatesLoading = true;
    this.doctorDatesError = '';
    this.doctorAvailableDates = new Set<string>();

    const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

    const min = new Date(this.getMinDate() + 'T00:00:00');
    const max = new Date(this.getMaxDate() + 'T00:00:00');
    const from = start < min ? min : start;
    const to = end > max ? max : end;

    const fromIso = this.toIsoDate(from);
    const toIso = this.toIsoDate(to);

    if (from > to) {
      this.doctorDatesLoading = false;
      this.doctorAvailableDates = new Set<string>();
      return;
    }

    const url = `${this.apiBaseUrl}/agenda/fechas-disponibles?medi_id=${mediId}&from=${fromIso}&to=${toIso}`;
    this.http.get<AvailableDatesResponse>(url)
      .pipe(
        timeout(8000),
        catchError((err) => {
          const message = err?.message ? String(err.message) : 'Error de conexión al cargar fechas.';
          this.doctorDatesError = message;
          return of({ status: 'error', availableDates: [] as string[] } as AvailableDatesResponse);
        }),
        finalize(() => {
          this.doctorDatesLoading = false;
          this.cdr.detectChanges();
        })
      )
      .subscribe((resp) => {
        if (resp?.status === 'success' && Array.isArray(resp.availableDates)) {
          this.doctorAvailableDates = new Set(resp.availableDates);
        } else {
          this.doctorAvailableDates = new Set<string>();
          this.doctorDatesError = resp?.message || 'No se pudieron cargar las fechas.';
        }
        this.cdr.detectChanges();
      });
  }

  private loadAvailableSlotsForDoctor(mediId: number, fecha: string) {
    this.doctorSlotsLoading = true;
    this.doctorSlotsError = '';
    this.doctorSlots = [];

    const url = `${this.apiBaseUrl}/agenda/horarios-disponibles?medi_id=${mediId}&fecha=${fecha}`;
    this.http.get<AvailableSlotsResponse>(url)
      .subscribe({
        next: (resp) => {
          this.lastSlotsResp = resp;
          if (resp?.status === 'success' && Array.isArray(resp.slots)) {
            this.doctorSlots = resp.slots;
            const d = Number((resp as any)?.durationMinutes);
            if (!Number.isNaN(d) && d > 0) {
              this.selectedDurationMinutes = d;
            }
          } else {
            this.doctorSlots = [];
            this.doctorSlotsError = resp?.message || 'No se pudieron cargar los horarios.';
          }

          this.doctorSlotsLoading = false;
          this.selectedTime = '';
          this.cdr.detectChanges();
        },
        error: () => {
          this.doctorSlots = [];
          this.doctorSlotsError = 'Error de conexión al cargar horarios.';
          this.doctorSlotsLoading = false;
          this.selectedTime = '';
          this.cdr.detectChanges();
        }
      });
  }

  private loadDurationMinutesForDoctor(mediId: number) {
    const fecha = this.selectedDate || this.getMinDate();
    const url = `${this.apiBaseUrl}/agenda/duracion-cita?medi_id=${mediId}&fecha=${fecha}`;
    this.http.get<{ status: string; durationMinutes: number | null }>(url)
      .subscribe({
        next: (resp) => {
          console.log('[duration] resp', { mediId, fecha, resp });
          this.lastDurationResp = resp;
          const d = Number((resp as any)?.durationMinutes);
          if (resp?.status === 'success' && !Number.isNaN(d) && d > 0) {
            this.selectedDurationMinutes = d;
          } else {
            this.selectedDurationMinutes = 30;
          }

          this.selectedTime = '';
          this.cdr.detectChanges();
        },
        error: () => {
          console.log('[duration] error', { mediId, fecha });
          this.selectedDurationMinutes = 30;
          this.selectedTime = '';
          this.cdr.detectChanges();
        }
      });
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(n => parseInt(n, 10));
    return (h * 60) + m;
  }

  private rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
    return aStart < bEnd && bStart < aEnd;
  }
  
  getMinDate(): string {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  }
  
  getMaxDate(): string {
    const d = new Date();
    d.setDate(d.getDate() + 365);
    return d.toISOString().split('T')[0];
  }
  
  getAvailableTimeSlots(): string[] {
    const baseSlots = this.doctorSlots.length > 0 ? this.doctorSlots : this.timeSlots;

    if (!this.selectedDate || !this.currentPatient() || !this.selectedSpecialty) {
      return baseSlots;
    }
    
    const selectedDate = new Date(this.selectedDate);

    const dayAppointments = this.appointments().filter(
      apt => apt.date.toDateString() === selectedDate.toDateString()
    );

    const patientAppointments = dayAppointments.filter(
      apt => apt.patientId === this.currentPatient()!.id
    );

    const doctorAppointments = (this.selectedDoctorId != null)
      ? dayAppointments.filter(apt => apt.doctorId === this.selectedDoctorId)
      : [];
    
    const selectedDuration = this.selectedDurationMinutes || 30;

    return baseSlots.filter(time => {
      const selectedStart = this.timeToMinutes(time);
      const selectedEnd = selectedStart + selectedDuration;

      // Global: block if this doctor already has an appointment that overlaps this slot
      const isTakenByAnotherPatient = doctorAppointments.some(apt => {
        const aptStart = this.timeToMinutes(apt.time);
        const aptDuration = (apt.durationMinutes || 30);
        const aptEnd = aptStart + aptDuration;
        return this.rangesOverlap(aptStart, aptEnd, selectedStart, selectedEnd);
      });

      if (isTakenByAnotherPatient) return false;

      const hasOverlap = patientAppointments.some(apt => {
        const aptStart = this.timeToMinutes(apt.time);
        const aptDuration = (apt.durationMinutes || 30);
        const aptEnd = aptStart + aptDuration;
        return this.rangesOverlap(aptStart, aptEnd, selectedStart, selectedEnd);
      });

      return !hasOverlap;
    });
  }
  
  validateAppointment() {
    this.errorMessage = '';
    
    if (!this.selectedEspeId || !this.selectedDoctorId || !this.selectedDoctorName) {
      this.errorMessage = 'Por favor seleccione especialidad y médico';
      return;
    }

    if (!this.selectedDate || !this.selectedTime) {
      this.errorMessage = 'Por favor seleccione fecha y hora';
      return;
    }

    const selectedDate = new Date(this.selectedDate + 'T00:00:00');
    const minAllowedDate = new Date(this.getMinDate() + 'T00:00:00');
    const maxAllowedDate = new Date(this.getMaxDate() + 'T00:00:00');

    if (selectedDate < minAllowedDate) {
      this.errorMessage = 'Solo se pueden agendar citas a partir de 30 días desde hoy';
      return;
    }

    if (selectedDate > maxAllowedDate) {
      this.errorMessage = 'La fecha seleccionada excede el rango permitido';
      return;
    }
    
    // Check if patient already has appointment in same specialty
    const existingSpecialtyAppointment = this.appointments().some(
      apt => apt.patientId === this.currentPatient()!.id && 
             apt.espeId === this.selectedEspeId
    );
    
    if (existingSpecialtyAppointment) {
      this.errorMessage = 'Ya tiene una cita agendada en esta especialidad';
      return;
    }

    // Global: prevent selecting a slot already taken by another patient (same doctor/date overlap)
    const globalSameDoctorDay = this.appointments().filter(
      apt => apt.doctorId === this.selectedDoctorId &&
             apt.date.toDateString() === selectedDate.toDateString()
    );

    const selectedStartGlobal = this.timeToMinutes(this.selectedTime);
    const selectedEndGlobal = selectedStartGlobal + (this.selectedDurationMinutes || 30);

    for (const apt of globalSameDoctorDay) {
      const aptStart = this.timeToMinutes(apt.time);
      const aptEnd = aptStart + (apt.durationMinutes || 30);

      if (this.rangesOverlap(aptStart, aptEnd, selectedStartGlobal, selectedEndGlobal)) {
        this.errorMessage = 'Ese horario ya no está disponible';
        return;
      }
    }
    
    // Check overlap for same day appointments using durationMinutes
    const sameDayAppointments = this.appointments().filter(
      apt => apt.patientId === this.currentPatient()!.id && 
             apt.date.toDateString() === selectedDate.toDateString()
    );

    const selectedStart = this.timeToMinutes(this.selectedTime);
    const selectedEnd = selectedStart + (this.selectedDurationMinutes || 30);

    for (const apt of sameDayAppointments) {
      const aptStart = this.timeToMinutes(apt.time);
      const aptEnd = aptStart + (apt.durationMinutes || 30);

      if (this.rangesOverlap(aptStart, aptEnd, selectedStart, selectedEnd)) {
        this.errorMessage = 'Ya tiene una cita que se cruza con ese horario';
        return;
      }
    }
    
    this.currentStep = 'confirmation';
  }
  
  confirmAppointment() {
    if (!this.currentPatient() || !this.selectedSpecialty || !this.selectedEspeId || !this.selectedDoctorId || !this.selectedDoctorName || !this.selectedDate || !this.selectedTime) {
      this.errorMessage = 'Faltan datos para confirmar la cita';
      return;
    }
    
    const appointment: Appointment = {
      id: Date.now().toString(),
      patientId: this.currentPatient()!.id,
      specialty: this.selectedSpecialty,
      espeId: this.selectedEspeId,
      doctorId: this.selectedDoctorId,
      doctorName: this.selectedDoctorName,
      durationMinutes: this.selectedDurationMinutes || 30,
      date: new Date(this.selectedDate),
      time: this.selectedTime
    };
    
    const updatedAppointments = [...this.appointments(), appointment];
    this.appointments.set(updatedAppointments);
    this.saveData();
    
    this.successMessage = '¡Cita agendada exitosamente!';
    
    // Reset form after 3 seconds
    setTimeout(() => {
      this.resetForm();
    }, 3000);
  }
  
  resetForm() {
    this.currentStep = 'login';
    this.patientCedula = '';
    this.patientBirthDate = '';
    this.currentPatient.set(null);
    this.selectedSpecialty = '';
    this.selectedEspeId = null;
    this.selectedDoctorId = null;
    this.selectedDoctorName = '';
    this.doctors = [];
    this.selectedDate = '';
    this.selectedTime = '';
    this.doctorAvailableDates = new Set<string>();
    this.doctorDatesLoading = false;
    this.doctorDatesError = '';
    this.calendarMonth = new Date(this.getMinDate() + 'T00:00:00');
    this.errorMessage = '';
    this.successMessage = '';
  }
  
  getPatientAppointments(): Appointment[] {
    if (!this.currentPatient()) return [];
    return this.appointments().filter(apt => apt.patientId === this.currentPatient()!.id);
  }
  
  cancelAppointment(appointmentId: string) {
    const updatedAppointments = this.appointments().filter(apt => apt.id !== appointmentId);
    this.appointments.set(updatedAppointments);
    this.saveData();
    this.successMessage = 'Cita cancelada exitosamente';
  }
}
