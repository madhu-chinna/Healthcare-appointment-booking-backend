# Niroggyan Healthcare Backend

A Node.js backend for healthcare appointment booking system.

## Features

- Doctor management
- Appointment booking
- Available slots calculation
- Time validation (no past slots for today)
- CORS enabled for frontend integration

## API Endpoints

- `GET /doctors` - Get all doctors
- `POST /doctors` - Add a new doctor
- `GET /doctors/:id/slots` - Get available slots for a doctor
- `POST /appointments` - Book an appointment
- `GET /appointments` - Get all appointments
- `PUT /appointments/:id` - Update an appointment
- `DELETE /appointments/:id` - Delete an appointment
- `DELETE /appointments/cleanup/all` - Clean up all appointments

## Deployment on Render

1. Connect your GitHub repository to Render
2. Set the following configuration:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node.js

3. Environment Variables (optional):
   - `NODE_ENV`: `production`
   - `PORT`: (auto-assigned by Render)

## Local Development

```bash
npm install
npm run dev
```

The server will start on `http://localhost:3008`

## Notes

- Uses in-memory storage for Render compatibility
- Data resets on server restart
- For production, consider using a persistent database like PostgreSQL 