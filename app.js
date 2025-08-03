const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { open } = require('sqlite');
const { body, validationResult } = require('express-validator');
const moment = require('moment');
const cors = require("cors");


const app = express();
const PORT = 3008;
const dbPath = path.join(__dirname, 'appointment.db');
let db = null;

app.use(cors());
app.use(express.json());

// Initializing Database and Server
const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    await createTables();
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}/`);
    });
  } catch (e) {
    console.error(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

// Creating Tables
const createTables = async () => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      specialization TEXT NOT NULL,
      working_hours TEXT NOT NULL,
      profile_image TEXT,
      availability_status TEXT DEFAULT 'Available Today'
    );
  `);
  
  await db.exec(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      duration INTEGER NOT NULL,
      appointment_type TEXT NOT NULL,
      patient_name TEXT NOT NULL,
      patient_email TEXT NOT NULL,
      notes TEXT,
      FOREIGN KEY (doctor_id) REFERENCES doctors(id)
    );
  `);


  // Inserting sample doctors if none exist
  const count = await db.get(`SELECT COUNT(*) AS count FROM doctors`);
  if (count.count === 0) {
    const workingHours = [
      { start: '08:00', end: '16:00' },
      { start: '10:00', end: '18:00' },
      { start: '09:00', end: '17:00' },
      { start: '08:30', end: '16:30' },
      { start: '09:30', end: '17:30' }
    ];
    
    await db.run(`INSERT INTO doctors (name, specialization, working_hours, profile_image, availability_status) VALUES 
      ('Dr. Alice Smith', 'Cardiology', ?, 'https://i.pravatar.cc/150?img=1', 'Available Today'),
      ('Dr. Bob Johnson', 'Neurology', ?, 'https://i.pravatar.cc/150?img=2', 'Available Today'),
      ('Dr. Charlie Brown', 'Pediatrics', ?, 'https://i.pravatar.cc/150?img=3', 'Fully Booked'),
      ('Dr. Sarah Wilson', 'Dermatology', ?, 'https://i.pravatar.cc/150?img=4', 'On Leave'),
      ('Dr. Michael Chen', 'Orthopedics', ?, 'https://i.pravatar.cc/150?img=5', 'Available Today')
    `, [
      JSON.stringify(workingHours[0]),
      JSON.stringify(workingHours[1]),
      JSON.stringify(workingHours[2]),
      JSON.stringify(workingHours[3]),
      JSON.stringify(workingHours[4])
    ]);
  }



};

// Fetching all doctors
app.get('/doctors', async (req, res) => {
  const doctors = await db.all('SELECT * FROM doctors');
  res.json(doctors);
});

// Adding a new doctor
app.post('/doctors', async (req, res) => {
  const { name, specialization, working_start, working_end, profile_image, availability_status } = req.body;

  // Validating request
  if (!name || !specialization || !working_start || !working_end) {
    return res.status(400).json({ error: 'All fields are required (name, specialization, working_start, working_end)' });
  }

  try {
    const result = await db.run(
      'INSERT INTO doctors (name, specialization, working_start, working_end, profile_image, availability_status) VALUES (?, ?, ?, ?, ?, ?)',
      [name, specialization, working_start, working_end, profile_image || null, availability_status || 'Available Today']
    );

    res.status(201).json({ id: result.lastID, message: 'Doctor added successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add doctor' });
  }
});


// Fetching available slots for a doctor on a given date
app.get('/doctors/:id/slots', async (req, res) => {
  const { id } = req.params;
  const { date, duration = 30 } = req.query;
  if (!date) return res.status(400).json({ error: 'Date is required' });

  const doctor = await db.get('SELECT * FROM doctors WHERE id = ?', [id]);
  if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

  // Check if doctor is available (not on leave or fully booked)
  if (doctor.availability_status === 'On Leave') {
    return res.json({ 
      availableSlots: [], 
      workingHours: JSON.parse(doctor.working_hours),
      message: 'Doctor is on leave today' 
    });
  }

  if (doctor.availability_status === 'Fully Booked') {
    return res.json({ 
      availableSlots: [], 
      workingHours: JSON.parse(doctor.working_hours),
      message: 'Doctor is fully booked today' 
    });
  }

  const workingHours = JSON.parse(doctor.working_hours);
  let availableSlots = [];
  let startTime = moment(`${date} ${workingHours.start}`, 'YYYY-MM-DD HH:mm');
  let endTime = moment(`${date} ${workingHours.end}`, 'YYYY-MM-DD HH:mm');

  // Checking if the requested date is today
  const today = moment().format('YYYY-MM-DD');
  const isToday = date === today;
  const currentTime = moment();

  // Generating slots based on requested duration
  while (startTime.add(duration, 'minutes') <= endTime) {
    const slotStart = startTime.clone().subtract(duration, 'minutes');
    const slotTime = moment(`${date} ${slotStart.format('HH:mm')}`, 'YYYY-MM-DD HH:mm');
    
    // If it's today, only including slots that are in the future
    if (!isToday || slotTime.isAfter(currentTime)) {
      availableSlots.push(slotStart.format('HH:mm'));
    }
  }

  // Getting booked appointments for this date
  const bookedAppointments = await db.all(
    'SELECT date, duration FROM appointments WHERE doctor_id = ? AND date LIKE ?',
    [id, `${date}%`]
  );

  // Filtering out overlapping slots
  const conflictingSlots = [];
  bookedAppointments.forEach(appointment => {
    const appointmentStart = moment(appointment.date);
    const appointmentEnd = appointmentStart.clone().add(appointment.duration, 'minutes');
    
    availableSlots.forEach(slot => {
      const slotStart = moment(`${date} ${slot}`, 'YYYY-MM-DD HH:mm');
      const slotEnd = slotStart.clone().add(parseInt(duration), 'minutes');
      
      if (slotStart < appointmentEnd && slotEnd > appointmentStart) {
        conflictingSlots.push(slot);
      }
    });
  });

  availableSlots = availableSlots.filter(slot => !conflictingSlots.includes(slot));

  res.json({ availableSlots, workingHours });
});

// Creating an appointment
app.post('/appointments', async (req, res) => {
  const { doctor_id, date, duration, appointment_type, patient_name, patient_email, notes } = req.body;
  
  try {
    // Validating doctor exists
    const doctor = await db.get('SELECT * FROM doctors WHERE id = ?', [doctor_id]);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
    
    // Validating working hours
    const workingHours = JSON.parse(doctor.working_hours);
    const appointmentTime = moment(date);
    const appointmentEnd = appointmentTime.clone().add(duration, 'minutes');
    const dayStart = moment(date).format('YYYY-MM-DD');
    const workStart = moment(`${dayStart} ${workingHours.start}`, 'YYYY-MM-DD HH:mm');
    const workEnd = moment(`${dayStart} ${workingHours.end}`, 'YYYY-MM-DD HH:mm');
    
    if (appointmentTime < workStart || appointmentEnd > workEnd) {
      return res.status(400).json({ error: 'Appointment time is outside doctor working hours' });
    }
    
    // Checking for conflicts
    const existing = await db.get(
      'SELECT * FROM appointments WHERE doctor_id = ? AND date = ?',
      [doctor_id, date]
    );
    if (existing) return res.status(400).json({ error: 'Time slot already booked' });

    const result = await db.run(
      'INSERT INTO appointments (doctor_id, date, duration, appointment_type, patient_name, patient_email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [doctor_id, date, duration, appointment_type, patient_name, patient_email, notes]
    );

    res.json({ id: result.lastID, message: 'Appointment booked successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to book appointment' });
  }
});

// Fetching all appointments
app.get('/appointments', async (req, res) => {
  const appointments = await db.all('SELECT * FROM appointments');
  res.json(appointments);
});

// Updating an appointment
app.put('/appointments/:id', async (req, res) => {
  const { id } = req.params;
  const { doctor_id, date, duration, appointment_type, patient_name, patient_email, notes } = req.body;
  
  try {
    // Validating working hours
    const doctor = await db.get('SELECT * FROM doctors WHERE id = ?', [doctor_id]);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
    
    const workingHours = JSON.parse(doctor.working_hours);
    const appointmentTime = moment(date);
    const appointmentEnd = appointmentTime.clone().add(duration, 'minutes');
    const dayStart = moment(date).format('YYYY-MM-DD');
    const workStart = moment(`${dayStart} ${workingHours.start}`, 'YYYY-MM-DD HH:mm');
    const workEnd = moment(`${dayStart} ${workingHours.end}`, 'YYYY-MM-DD HH:mm');
    
    if (appointmentTime < workStart || appointmentEnd > workEnd) {
      return res.status(400).json({ error: 'Appointment time is outside doctor working hours' });
    }
    
    // Checking for conflicts with other appointments
    const conflictingAppointment = await db.get(
      'SELECT * FROM appointments WHERE doctor_id = ? AND date = ? AND id != ?',
      [doctor_id, date, id]
    );
    
    if (conflictingAppointment) {
      return res.status(400).json({ error: 'Time slot already booked' });
    }
    
    await db.run(
      'UPDATE appointments SET doctor_id = ?, date = ?, duration = ?, appointment_type = ?, patient_name = ?, patient_email = ?, notes = ? WHERE id = ?',
      [doctor_id, date, duration, appointment_type, patient_name, patient_email, notes, id]
    );
    
    res.json({ message: 'Appointment updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// Deleting an appointment
app.delete('/appointments/:id', async (req, res) => {
  const { id } = req.params;
  await db.run('DELETE FROM appointments WHERE id = ?', [id]);
  res.json({ message: 'Appointment canceled' });
});

// Cleanup all appointments (for development/production deployment)
app.delete('/appointments/cleanup/all', async (req, res) => {
  try {
    await db.run('DELETE FROM appointments');
    await db.run('DELETE FROM sqlite_sequence WHERE name="appointments"');
    res.json({ message: 'All appointments cleaned up successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to cleanup appointments' });
  }
});


initializeDBAndServer();
