const express = require('express');
const path = require('path');
const { body, validationResult } = require('express-validator');
const moment = require('moment-timezone');
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3008;

// Use in-memory storage for Render (since sqlite3 has compatibility issues)
let doctors = [
  {
    id: 1,
    name: 'Dr. Alice Smith',
    specialization: 'Cardiology',
    working_hours: JSON.stringify({ start: '08:00', end: '16:00' }),
    profile_image: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=150&h=150&fit=crop&crop=face',
    availability_status: 'Available Today'
  },
  {
    id: 2,
    name: 'Dr. Bob Johnson',
    specialization: 'Neurology',
    working_hours: JSON.stringify({ start: '10:00', end: '18:00' }),
    profile_image: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=150&h=150&fit=crop&crop=face',
    availability_status: 'Available Today'
  },
  {
    id: 3,
    name: 'Dr. Charlie Brown',
    specialization: 'Pediatrics',
    working_hours: JSON.stringify({ start: '09:00', end: '17:00' }),
    profile_image: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150&h=150&fit=crop&crop=face',
    availability_status: 'Fully Booked'
  },
  {
    id: 4,
    name: 'Dr. Sarah Wilson',
    specialization: 'Dermatology',
    working_hours: JSON.stringify({ start: '08:30', end: '16:30' }),
    profile_image: 'https://images.unsplash.com/photo-1594824475542-9d1d775414e6?w=150&h=150&fit=crop&crop=face',
    availability_status: 'On Leave'
  },
  {
    id: 5,
    name: 'Dr. Michael Chen',
    specialization: 'Orthopedics',
    working_hours: JSON.stringify({ start: '09:30', end: '17:30' }),
    profile_image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
    availability_status: 'Available Today'
  }
];

let appointments = [];
let nextAppointmentId = 1;

// Configure CORS for production
app.use(cors({
  origin: true, // Allow all origins for testing
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Test endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Niroggyan Healthcare Backend is running!' });
});

// Initialize Server
const initializeServer = async () => {
  try {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}/`);
    });
  } catch (e) {
    console.error(`Server Error: ${e.message}`);
    process.exit(1);
  }
};

// Fetching all doctors
app.get('/doctors', async (req, res) => {
  res.json(doctors);
});

// Adding a new doctor
app.post('/doctors', async (req, res) => {
  const { name, specialization, working_start, working_end, profile_image, availability_status } = req.body;

  if (!name || !specialization || !working_start || !working_end) {
    return res.status(400).json({ error: 'All fields are required (name, specialization, working_start, working_end)' });
  }

  try {
    const newDoctor = {
      id: doctors.length + 1,
      name,
      specialization,
      working_hours: JSON.stringify({ start: working_start, end: working_end }),
      profile_image: profile_image || null,
      availability_status: availability_status || 'Available Today'
    };

    doctors.push(newDoctor);
    res.status(201).json({ id: newDoctor.id, message: 'Doctor added successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add doctor' });
  }
});

// Fetching available slots for a doctor on a given date
app.get('/doctors/:id/slots', async (req, res) => {
  const { id } = req.params;
  const { date, duration = 30 } = req.query;
  if (!date) return res.status(400).json({ error: 'Date is required' });

  const doctor = doctors.find(d => d.id == id);
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
  
  // Use Indian Standard Time (IST) for all time calculations
  let startTime = moment.tz(`${date} ${workingHours.start}`, 'YYYY-MM-DD HH:mm', 'Asia/Kolkata');
  let endTime = moment.tz(`${date} ${workingHours.end}`, 'YYYY-MM-DD HH:mm', 'Asia/Kolkata');

  // Checking if the requested date is today
  const today = moment.tz('Asia/Kolkata').format('YYYY-MM-DD');
  const isToday = date === today;
  const currentTime = moment.tz('Asia/Kolkata');

  // Generating slots based on requested duration
  while (startTime.add(duration, 'minutes') <= endTime) {
    const slotStart = startTime.clone().subtract(duration, 'minutes');
    const slotTime = moment.tz(`${date} ${slotStart.format('HH:mm')}`, 'YYYY-MM-DD HH:mm', 'Asia/Kolkata');
    
    // If it's today, only including slots that are in the future
    if (!isToday || slotTime.isAfter(currentTime)) {
      availableSlots.push(slotStart.format('HH:mm'));
    }
  }

  // Getting booked appointments for this date
  const bookedAppointments = appointments.filter(apt => 
    apt.doctor_id == id && apt.date.startsWith(date)
  );

  // Filtering out overlapping slots
  const conflictingSlots = [];
  bookedAppointments.forEach(appointment => {
    const appointmentStart = moment.tz(appointment.date, 'Asia/Kolkata');
    const appointmentEnd = appointmentStart.clone().add(appointment.duration, 'minutes');
    
    availableSlots.forEach(slot => {
      const slotStart = moment.tz(`${date} ${slot}`, 'YYYY-MM-DD HH:mm', 'Asia/Kolkata');
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
    const doctor = doctors.find(d => d.id == doctor_id);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
    
    // Validating working hours
    const workingHours = JSON.parse(doctor.working_hours);
    const appointmentTime = moment.tz(date, 'Asia/Kolkata');
    const appointmentEnd = appointmentTime.clone().add(duration, 'minutes');
    const dayStart = moment.tz(date, 'Asia/Kolkata').format('YYYY-MM-DD');
    const workStart = moment.tz(`${dayStart} ${workingHours.start}`, 'YYYY-MM-DD HH:mm', 'Asia/Kolkata');
    const workEnd = moment.tz(`${dayStart} ${workingHours.end}`, 'YYYY-MM-DD HH:mm', 'Asia/Kolkata');
    
    if (appointmentTime < workStart || appointmentEnd > workEnd) {
      return res.status(400).json({ error: 'Appointment time is outside doctor working hours' });
    }
    
    // Checking for conflicts
    const existing = appointments.find(apt => 
      apt.doctor_id == doctor_id && apt.date === date
    );
    if (existing) return res.status(400).json({ error: 'Time slot already booked' });

    const newAppointment = {
      id: nextAppointmentId++,
      doctor_id,
      date,
      duration,
      appointment_type,
      patient_name,
      patient_email,
      notes
    };

    appointments.push(newAppointment);

    res.json({ id: newAppointment.id, message: 'Appointment booked successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to book appointment' });
  }
});

// Fetching all appointments
app.get('/appointments', async (req, res) => {
  res.json(appointments);
});

// Updating an appointment
app.put('/appointments/:id', async (req, res) => {
  const { id } = req.params;
  const { doctor_id, date, duration, appointment_type, patient_name, patient_email, notes } = req.body;
  
  try {
    // Validating working hours
    const doctor = doctors.find(d => d.id == doctor_id);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
    
    const workingHours = JSON.parse(doctor.working_hours);
    const appointmentTime = moment.tz(date, 'Asia/Kolkata');
    const appointmentEnd = appointmentTime.clone().add(duration, 'minutes');
    const dayStart = moment.tz(date, 'Asia/Kolkata').format('YYYY-MM-DD');
    const workStart = moment.tz(`${dayStart} ${workingHours.start}`, 'YYYY-MM-DD HH:mm', 'Asia/Kolkata');
    const workEnd = moment.tz(`${dayStart} ${workingHours.end}`, 'YYYY-MM-DD HH:mm', 'Asia/Kolkata');
    
    if (appointmentTime < workStart || appointmentEnd > workEnd) {
      return res.status(400).json({ error: 'Appointment time is outside doctor working hours' });
    }
    
    // Checking for conflicts with other appointments
    const conflictingAppointment = appointments.find(apt => 
      apt.doctor_id == doctor_id && apt.date === date && apt.id != id
    );
    
    if (conflictingAppointment) {
      return res.status(400).json({ error: 'Time slot already booked' });
    }
    
    const appointmentIndex = appointments.findIndex(apt => apt.id == id);
    if (appointmentIndex === -1) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    
    appointments[appointmentIndex] = {
      ...appointments[appointmentIndex],
      doctor_id,
      date,
      duration,
      appointment_type,
      patient_name,
      patient_email,
      notes
    };
    
    res.json({ message: 'Appointment updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// Deleting an appointment
app.delete('/appointments/:id', async (req, res) => {
  const { id } = req.params;
  const appointmentIndex = appointments.findIndex(apt => apt.id == id);
  
  if (appointmentIndex === -1) {
    return res.status(404).json({ error: 'Appointment not found' });
  }
  
  appointments.splice(appointmentIndex, 1);
  res.json({ message: 'Appointment canceled' });
});

// Cleanup all appointments (for development/production deployment)
app.delete('/appointments/cleanup/all', async (req, res) => {
  try {
    appointments = [];
    nextAppointmentId = 1;
    res.json({ message: 'All appointments cleaned up successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to cleanup appointments' });
  }
});

initializeServer();
