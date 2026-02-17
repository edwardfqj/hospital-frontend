const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const PORT = 3002;

// Middleware - Permitir todos los orígenes
app.use(cors({
  origin: true, // Permitir todos los orígenes
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));
app.use(express.json());

// Configuración de la base de datos
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  charset: 'utf8mb4',
  ssl: { rejectUnauthorized: true } // TiDB/Aiven requieren SSL
};
// Pool de conexiones
const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Endpoint de prueba
app.get('/api/test', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute('SELECT COUNT(*) as total FROM persona');
    connection.release();
    
    res.json({
      status: 'success',
      message: 'Conexión exitosa a la base de datos',
      total_personas: rows[0].total
    });
  } catch (error) {
    console.error('Error en test:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error de conexión: ' + error.message
    });
  }
});

app.get('/api/diagnostico/medicos-por-especialidad-columnas', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    const [byEspeId] = await connection.execute(
      `SELECT espe_id, COUNT(*) AS total
       FROM medico
       WHERE espe_id IS NOT NULL
       GROUP BY espe_id
       ORDER BY total DESC, espe_id ASC
       LIMIT 200`
    );

    const [byEspeMediId] = await connection.execute(
      `SELECT espe_medi_id, COUNT(*) AS total
       FROM medico
       WHERE espe_medi_id IS NOT NULL
       GROUP BY espe_medi_id
       ORDER BY total DESC, espe_medi_id ASC
       LIMIT 200`
    );

    connection.release();

    res.json({
      status: 'success',
      byEspeId,
      byEspeMediId
    });
  } catch (error) {
    console.error('Error en diagnostico medicos-por-especialidad-columnas:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error: ' + error.message
    });
  }
});

app.get('/api/diagnostico/agenda-con-jornada', async (req, res) => {
  try {
    const mediId = req.query.medi_id;

    const connection = await pool.getConnection();
    let rows;

    if (mediId) {
      [rows] = await connection.execute(
        `SELECT a.medi_id, a.agen_id, a.agen_dura_cita, a.agen_fech_inic, a.agen_fech_fina, COUNT(j.jorn_id) AS total_jornadas
         FROM agenda a
         LEFT JOIN jornada j ON j.agen_id = a.agen_id
         WHERE a.medi_id = ?
         GROUP BY a.medi_id, a.agen_id, a.agen_dura_cita, a.agen_fech_inic, a.agen_fech_fina
         ORDER BY total_jornadas DESC, a.agen_fech_fina DESC, a.agen_id ASC
         LIMIT 50`,
        [mediId]
      );
    } else {
      [rows] = await connection.execute(
        `SELECT a.medi_id, a.agen_id, a.agen_dura_cita, a.agen_fech_inic, a.agen_fech_fina, COUNT(j.jorn_id) AS total_jornadas
         FROM agenda a
         LEFT JOIN jornada j ON j.agen_id = a.agen_id
         GROUP BY a.medi_id, a.agen_id, a.agen_dura_cita, a.agen_fech_inic, a.agen_fech_fina
         HAVING total_jornadas > 0
         ORDER BY a.medi_id ASC, a.agen_id ASC
         LIMIT 200`
      );
    }

    connection.release();

    res.json({
      status: 'success',
      data: rows
    });
  } catch (error) {
    console.error('Error en diagnostico agenda-con-jornada:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error: ' + error.message
    });
  }
});

app.get('/api/agenda/horarios-disponibles', async (req, res) => {
  try {
    const mediId = req.query.medi_id;
    const fecha = req.query.fecha;

    if (!mediId || !fecha) {
      return res.status(400).json({
        status: 'error',
        message: 'Falta medi_id o fecha'
      });
    }

    const parsed = new Date(`${fecha}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return res.status(400).json({
        status: 'error',
        message: 'Fecha inválida'
      });
    }

    const jsDay = parsed.getDay();
    const diaIdMon0 = (jsDay + 6) % 7;

    const connection = await pool.getConnection();

    let agendaRows;
    [agendaRows] = await connection.execute(
      `SELECT agen_id, medi_id, agen_dura_cita, agen_fech_inic, agen_fech_fina, stat_agen_id
       FROM agenda
       WHERE medi_id = ?
         AND stat_agen_id = 1
         AND ? BETWEEN agen_fech_inic AND agen_fech_fina
       ORDER BY agen_fech_fina DESC, agen_fech_inic DESC
       LIMIT 1`,
      [mediId, fecha]
    );

    if (!agendaRows || agendaRows.length === 0) {
      [agendaRows] = await connection.execute(
        `SELECT agen_id, medi_id, agen_dura_cita, agen_fech_inic, agen_fech_fina, stat_agen_id
         FROM agenda
         WHERE medi_id = ?
           AND stat_agen_id = 1
         ORDER BY agen_fech_fina DESC, agen_fech_inic DESC
         LIMIT 1`,
        [mediId]
      );
    }

    if (!agendaRows || agendaRows.length === 0) {
      connection.release();
      return res.json({
        status: 'success',
        durationMinutes: null,
        slots: [],
        message: 'No se encontró agenda para el médico'
      });
    }

    let agenda = agendaRows[0];
    let durationMinutes = Number(agenda.agen_dura_cita);

    if (!durationMinutes || durationMinutes <= 0) {
      connection.release();
      return res.json({
        status: 'success',
        durationMinutes: null,
        slots: [],
        message: 'Duración de cita inválida'
      });
    }

    let diaIdUsed = diaIdMon0;
    let jRows;

    [jRows] = await connection.execute(
      `SELECT jorn_id, dia_id, jorn_hora_inic, jorn_hora_fina
       FROM jornada
       WHERE agen_id = ? AND dia_id = ?
       ORDER BY jorn_hora_inic ASC`,
      [agenda.agen_id, diaIdUsed]
    );

    if (!jRows || jRows.length === 0) {
      diaIdUsed = jsDay;
      [jRows] = await connection.execute(
        `SELECT jorn_id, dia_id, jorn_hora_inic, jorn_hora_fina
         FROM jornada
         WHERE agen_id = ? AND dia_id = ?
         ORDER BY jorn_hora_inic ASC`,
        [agenda.agen_id, diaIdUsed]
      );
    }

    // Si no hay jornada para este agen_id, intentar encontrar otra agenda del mismo médico que sí tenga jornada
    if (!jRows || jRows.length === 0) {
      let altAgendaRows;
      [altAgendaRows] = await connection.execute(
        `SELECT a.agen_id, a.medi_id, a.agen_dura_cita, a.agen_fech_inic, a.agen_fech_fina, a.stat_agen_id
         FROM agenda a
         INNER JOIN jornada j ON j.agen_id = a.agen_id
         WHERE a.medi_id = ?
           AND a.stat_agen_id = 1
         ORDER BY a.agen_fech_fina DESC, a.agen_fech_inic DESC
         LIMIT 1`,
        [mediId]
      );

      if (altAgendaRows && altAgendaRows.length > 0) {
        agenda = altAgendaRows[0];
        durationMinutes = Number(agenda.agen_dura_cita);

        diaIdUsed = diaIdMon0;
        [jRows] = await connection.execute(
          `SELECT jorn_id, dia_id, jorn_hora_inic, jorn_hora_fina
           FROM jornada
           WHERE agen_id = ? AND dia_id = ?
           ORDER BY jorn_hora_inic ASC`,
          [agenda.agen_id, diaIdUsed]
        );

        if (!jRows || jRows.length === 0) {
          diaIdUsed = jsDay;
          [jRows] = await connection.execute(
            `SELECT jorn_id, dia_id, jorn_hora_inic, jorn_hora_fina
             FROM jornada
             WHERE agen_id = ? AND dia_id = ?
             ORDER BY jorn_hora_inic ASC`,
            [agenda.agen_id, diaIdUsed]
          );
        }
      }
    }

    connection.release();

    if (!jRows || jRows.length === 0) {
      return res.json({
        status: 'success',
        medi_id: Number(mediId),
        fecha,
        dia_id: diaIdUsed,
        durationMinutes,
        agenda: {
          agen_id: agenda.agen_id,
          agen_fech_inic: agenda.agen_fech_inic,
          agen_fech_fina: agenda.agen_fech_fina
        },
        slots: [],
        message: 'No hay jornada registrada para este médico en este día'
      });
    }

    const toMinutes = (hhmmss) => {
      const s = (hhmmss || '').toString();
      const parts = s.split(':');
      const h = parseInt(parts[0] || '0', 10);
      const m = parseInt(parts[1] || '0', 10);
      return (h * 60) + m;
    };

    const toHHMM = (mins) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const slots = [];

    for (const jr of (jRows || [])) {
      const start = toMinutes(jr.jorn_hora_inic);
      const end = toMinutes(jr.jorn_hora_fina);

      for (let t = start; t + durationMinutes <= end; t += durationMinutes) {
        slots.push(toHHMM(t));
      }
    }

    res.json({
      status: 'success',
      medi_id: Number(mediId),
      fecha,
      dia_id: diaIdUsed,
      durationMinutes,
      agenda: {
        agen_id: agenda.agen_id,
        agen_fech_inic: agenda.agen_fech_inic,
        agen_fech_fina: agenda.agen_fech_fina
      },
      slots
    });
  } catch (error) {
    console.error('Error en agenda/horarios-disponibles:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error: ' + error.message
    });
  }
});

app.get('/api/agenda/fechas-disponibles', async (req, res) => {
  try {
    const mediId = req.query.medi_id;
    const from = req.query.from;
    const to = req.query.to;

    if (!mediId || !from || !to) {
      return res.status(400).json({
        status: 'error',
        message: 'Falta medi_id, from o to'
      });
    }

    const fromDate = new Date(`${from}T00:00:00`);
    const toDate = new Date(`${to}T00:00:00`);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return res.status(400).json({
        status: 'error',
        message: 'Rango de fechas inválido'
      });
    }

    const connection = await pool.getConnection();
    const [agendaRows] = await connection.execute(
      `SELECT agen_id, medi_id, agen_fech_inic, agen_fech_fina
       FROM agenda
       WHERE medi_id = ?
         AND stat_agen_id = 1
         AND agen_fech_inic <= ?
         AND agen_fech_fina >= ?
       ORDER BY agen_fech_inic ASC`,
      [mediId, to, from]
    );

    if (!agendaRows || agendaRows.length === 0) {
      connection.release();
      return res.json({
        status: 'success',
        medi_id: Number(mediId),
        from,
        to,
        availableDates: [],
        message: 'No se encontró agenda activa en el rango'
      });
    }

    const fmt = (d) => {
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${yr}-${mo}-${da}`;
    };

    const addDays = (d, n) => {
      const x = new Date(d);
      x.setDate(x.getDate() + n);
      return x;
    };

    const available = new Set();

    for (const a of agendaRows) {
      const [jDiaRows] = await connection.execute(
        `SELECT DISTINCT dia_id
         FROM jornada
         WHERE agen_id = ?
         ORDER BY dia_id ASC`,
        [a.agen_id]
      );

      const diaIds = new Set((jDiaRows || []).map(r => Number(r.dia_id)));
      if (diaIds.size === 0) continue;

      const aFrom = new Date(String(a.agen_fech_inic).split('T')[0] + 'T00:00:00');
      const aTo = new Date(String(a.agen_fech_fina).split('T')[0] + 'T00:00:00');
      const rangeFrom = aFrom > fromDate ? aFrom : fromDate;
      const rangeTo = aTo < toDate ? aTo : toDate;
      if (rangeFrom > rangeTo) continue;

      for (let d = new Date(rangeFrom); d <= rangeTo; d = addDays(d, 1)) {
        const jsDay = d.getDay();
        const diaIdMon0 = (jsDay + 6) % 7;
        if (diaIds.has(diaIdMon0) || diaIds.has(jsDay)) {
          available.add(fmt(d));
        }
      }
    }

    connection.release();

    const availableDates = Array.from(available).sort();

    res.json({
      status: 'success',
      medi_id: Number(mediId),
      from,
      to,
      availableDates
    });
  } catch (error) {
    console.error('Error en agenda/fechas-disponibles:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error: ' + error.message
    });
  }
});

app.get('/api/jornada', async (req, res) => {
  try {
    const agenId = req.query.agen_id;
    if (!agenId) {
      return res.status(400).json({
        status: 'error',
        message: 'Falta agen_id'
      });
    }

    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      `SELECT jorn_id, agen_id, dia_id, jorn_hora_inic, jorn_hora_fina, espe_id, cons_id
       FROM jornada
       WHERE agen_id = ?
       ORDER BY dia_id ASC, jorn_hora_inic ASC
       LIMIT 200`,
      [agenId]
    );

    const [diasRows] = await connection.execute(
      `SELECT DISTINCT dia_id
       FROM jornada
       WHERE agen_id = ?
       ORDER BY dia_id ASC`,
      [agenId]
    );
    connection.release();

    res.json({
      status: 'success',
      total: rows.length,
      dias: diasRows.map(r => r.dia_id),
      data: rows
    });
  } catch (error) {
    console.error('Error en jornada:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error: ' + error.message
    });
  }
});

app.get('/api/diagnostico/jornada-por-agenda', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      `SELECT agen_id, COUNT(*) AS total_jornadas
       FROM jornada
       GROUP BY agen_id
       ORDER BY total_jornadas DESC, agen_id ASC
       LIMIT 200`
    );
    connection.release();

    res.json({
      status: 'success',
      data: rows
    });
  } catch (error) {
    console.error('Error en diagnostico jornada-por-agenda:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error: ' + error.message
    });
  }
});

app.get('/api/diagnostico/medicos-por-especialidad-id', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      `SELECT 
          m.espe_medi_id AS espe_id,
          e.espe_nombre AS especialidad,
          COUNT(*) AS total_medicos
        FROM medico m
        LEFT JOIN especialidad e ON e.espe_id = m.espe_medi_id
        WHERE m.espe_medi_id IS NOT NULL
        GROUP BY m.espe_medi_id, e.espe_nombre
        ORDER BY total_medicos DESC, m.espe_medi_id ASC
        LIMIT 200`
    );
    connection.release();

    res.json({
      status: 'success',
      data: rows
    });
  } catch (error) {
    console.error('Error en diagnostico medicos-por-especialidad-id:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error: ' + error.message
    });
  }
});

app.get('/api/diagnostico/agenda-por-medico', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      `SELECT medi_id, COUNT(*) AS total_agendas
       FROM agenda
       GROUP BY medi_id
       ORDER BY total_agendas DESC, medi_id ASC
       LIMIT 50`
    );
    connection.release();

    res.json({
      status: 'success',
      data: rows
    });
  } catch (error) {
    console.error('Error en diagnostico agenda-por-medico:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error: ' + error.message
    });
  }
});

app.get('/api/diagnostico/agenda-ultima-duracion', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      `SELECT a.medi_id, a.agen_id, a.agen_dura_cita, a.agen_fech_inic, a.agen_fech_fina, a.stat_agen_id
       FROM agenda a
       INNER JOIN (
         SELECT medi_id, MAX(agen_fech_inic) AS max_fech_inic
         FROM agenda
         GROUP BY medi_id
       ) x ON x.medi_id = a.medi_id AND x.max_fech_inic = a.agen_fech_inic
       ORDER BY a.medi_id ASC
       LIMIT 200`
    );
    connection.release();

    res.json({
      status: 'success',
      data: rows
    });
  } catch (error) {
    console.error('Error en diagnostico agenda-ultima-duracion:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error: ' + error.message
    });
  }
});

app.get('/api/diagnostico/medicos-por-especialidad', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      `SELECT 
          m.espe_id AS espe_id,
          e.espe_medi_nombre AS especialidad,
          COUNT(*) AS total_medicos
        FROM medico m
        LEFT JOIN especialidad_medico e ON e.espe_medi_id = m.espe_id
        GROUP BY m.espe_id, e.espe_medi_nombre
        ORDER BY total_medicos DESC, m.espe_id ASC`
    );
    connection.release();

    res.json({
      status: 'success',
      data: rows
    });
  } catch (error) {
    console.error('Error en diagnostico medicos-por-especialidad:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error: ' + error.message
    });
  }
});

// Endpoint de validación de usuarios
app.post('/api/validar_usuario', async (req, res) => {
  try {
    const { cedula, fecha_nacimiento } = req.body;
    
    console.log('=== VALIDACIÓN NODE.JS ===');
    console.log('Datos recibidos:', { cedula, fecha_nacimiento });
    
    if (!cedula || !fecha_nacimiento) {
      return res.status(400).json({
        success: false,
        error: 'Datos incompletos'
      });
    }
    
    const connection = await pool.getConnection();
    
    // Consultar si el usuario existe en la tabla persona
    const [rows] = await connection.execute(
      'SELECT pers_id, pers_nombre, pers_ci, pers_fech_naci FROM persona WHERE pers_ci = ? AND pers_fech_naci = ?',
      [cedula, fecha_nacimiento]
    );
    
    connection.release();
    
    if (rows.length > 0) {
      const usuario = rows[0];
      console.log('✅ Usuario encontrado:', usuario);
      
      res.json({
        success: true,
        usuario: {
          id: usuario.pers_id,
          cedula: usuario.pers_ci,
          nombre: usuario.pers_nombre,
          fecha_nacimiento: usuario.pers_fech_naci
        }
      });
    } else {
      console.log('❌ Usuario no encontrado');
      res.json({
        success: false,
        error: 'Usuario no encontrado o datos incorrectos'
      });
    }
    
  } catch (error) {
    console.error('Error en validar_usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error del servidor: ' + error.message
    });
  }
});

// Endpoint para ver usuarios (debug)
app.get('/api/usuarios', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute('SELECT pers_id, pers_ci, pers_nombre, pers_fech_naci FROM persona LIMIT 10');
    connection.release();
    
    const usuarios = rows.map(row => ({
      id: row.pers_id,
      cedula: row.pers_ci,
      nombre: row.pers_nombre,
      fecha_nacimiento: row.pers_fech_naci
    }));
    
    res.json({
      status: 'success',
      usuarios: usuarios
    });
  } catch (error) {
    console.error('Error en usuarios:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error: ' + error.message
    });
  }
});

app.get('/api/especialidades', async (req, res) => {
  try {
    const allowedIds = [29, 33, 32, 25, 23, 133];

    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      `SELECT espe_id, espe_nombre
       FROM especialidad
       WHERE espe_id IN (${allowedIds.map(() => '?').join(', ')})
       ORDER BY espe_id ASC`,
      allowedIds
    );
    connection.release();

    const especialidades = rows.map(r => ({
      id: r.espe_id,
      nombre: r.espe_nombre
    }));

    res.json({
      status: 'success',
      especialidades
    });
  } catch (error) {
    console.error('Error en especialidades:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error: ' + error.message
    });
  }
});

app.get('/api/medicos', async (req, res) => {
  try {
    const espeId = req.query.espe_id;
    if (!espeId) {
      return res.status(400).json({
        status: 'error',
        message: 'Falta espe_id'
      });
    }

    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      `SELECT medi_id, medi_nombre, espe_id, espe_medi_id
       FROM medico
       WHERE espe_id = ? OR espe_medi_id = ?
       ORDER BY medi_nombre ASC`,
      [espeId, espeId]
    );
    connection.release();

    const medicos = rows.map(r => ({
      id: r.medi_id,
      nombre: r.medi_nombre,
      espe_id: r.espe_medi_id ?? r.espe_id
    }));

    res.json({
      status: 'success',
      medicos
    });
  } catch (error) {
    console.error('Error en medicos:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error: ' + error.message
    });
  }
});

app.get('/api/agenda/duracion-cita', async (req, res) => {
  try {
    const mediId = req.query.medi_id;
    const fecha = req.query.fecha;

    if (!mediId) {
      return res.status(400).json({
        status: 'error',
        message: 'Falta medi_id'
      });
    }

    const connection = await pool.getConnection();

    let rows;

    if (fecha) {
      [rows] = await connection.execute(
        `SELECT agen_id, medi_id, agen_dura_cita, agen_fech_inic, agen_fech_fina
         FROM agenda
         WHERE medi_id = ?
           AND stat_agen_id = 1
           AND ? BETWEEN agen_fech_inic AND agen_fech_fina
         ORDER BY agen_fech_fina DESC, agen_fech_inic DESC
         LIMIT 1`,
        [mediId, fecha]
      );
    }

    if (!rows || rows.length === 0) {
      [rows] = await connection.execute(
        `SELECT agen_id, medi_id, agen_dura_cita, agen_fech_inic, agen_fech_fina
         FROM agenda
         WHERE medi_id = ?
           AND stat_agen_id = 1
         ORDER BY agen_fech_fina DESC, agen_fech_inic DESC
         LIMIT 1`,
        [mediId]
      );
    }

    if (!rows || rows.length === 0) {
      [rows] = await connection.execute(
        `SELECT agen_id, medi_id, agen_dura_cita, agen_fech_inic, agen_fech_fina
         FROM agenda
         WHERE medi_id = ?
         ORDER BY agen_fech_fina DESC, agen_fech_inic DESC
         LIMIT 1`,
        [mediId]
      );
    }

    connection.release();

    if (!rows || rows.length === 0) {
      return res.json({
        status: 'success',
        durationMinutes: null,
        message: 'No se encontró agenda para el médico'
      });
    }

    const r = rows[0];
    res.json({
      status: 'success',
      durationMinutes: Number(r.agen_dura_cita),
      agenda: {
        agen_id: r.agen_id,
        medi_id: r.medi_id,
        agen_fech_inic: r.agen_fech_inic,
        agen_fech_fina: r.agen_fech_fina
      }
    });
  } catch (error) {
    console.error('Error en agenda/duracion-cita:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error: ' + error.message
    });
  }
});

app.get('/api/agenda', async (req, res) => {
  try {
    const mediId = req.query.medi_id;

    if (!mediId) {
      return res.status(400).json({
        status: 'error',
        message: 'Falta medi_id'
      });
    }

    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      `SELECT agen_id, hosp_id, medi_id, agen_fech_inic, agen_fech_fina, agen_dura_cita, stat_agen_id
       FROM agenda
       WHERE medi_id = ?
       ORDER BY agen_fech_inic DESC
       LIMIT 50`,
      [mediId]
    );
    connection.release();

    res.json({
      status: 'success',
      data: rows
    });
  } catch (error) {
    console.error('Error en agenda:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error: ' + error.message
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor Node.js corriendo en http://localhost:${PORT}`);
  console.log(`📡 Endpoints disponibles:`);
  console.log(`   GET  /api/test - Test de conexión`);
  console.log(`   POST /api/validar_usuario - Validar usuario`);
  console.log(`   GET  /api/usuarios - Ver usuarios`);
  console.log(`   GET  /api/especialidades - Ver especialidades permitidas`);
  console.log(`   GET  /api/medicos?espe_id=... - Ver médicos por especialidad`);
  console.log(`   GET  /api/agenda/duracion-cita?medi_id=...&fecha=YYYY-MM-DD - Duración cita (min)`);
  console.log(`   GET  /api/agenda/horarios-disponibles?medi_id=...&fecha=YYYY-MM-DD - Horarios por médico`);
  console.log(`   GET  /api/agenda?medi_id=... - Ver agendas por médico (debug)`);
  console.log(`   GET  /api/diagnostico/medicos-por-especialidad - Conteo de médicos por espe_id`);
  console.log(`   GET  /api/diagnostico/agenda-por-medico - Conteo de agendas por medi_id`);
  console.log(`   GET  /api/diagnostico/agenda-ultima-duracion - Última duración por médico`);
});

module.exports = app;
