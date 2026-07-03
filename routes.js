const express = require('express');
const router = express.Router();
const { Event, Registration, User } = require('./database');
const { requireAuth } = require('./authMiddleware');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// --- AUTHENTICATION ROUTES ---

// User Registration (Signup)
router.post('/auth/signup', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword, role });
    await user.save();
    res.status(201).json({ message: "User created successfully" });
  } catch (err) {
    res.status(400).json({ error: "Email already exists or invalid data" });
  }
});

// User Login
router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ error: "Invalid email or password" });
  }
  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
  res.json({ token, role: user.role, name: user.name });
});


// --- EVENT ROUTES ---

// 1. View Event List (Public)
router.get('/events', async (req, res) => {
  try {
    const events = await Event.find().populate('organizer', 'name');
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// 2. View Event Details (Public)
router.get('/events/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).populate('organizer', 'name');
    if (!event) return res.status(404).json({ error: "Event not found" });
    res.json(event);
  } catch (err) {
    res.status(400).json({ error: "Invalid Event ID" });
  }
});

// 3. Create a New Event (Organizer Only)
router.post('/events', requireAuth, async (req, res) => {
  if (req.user.role !== 'organizer') {
    return res.status(403).json({ error: "Only organizers can create events" });
  }
  try {
    const { title, description, date, location, capacity } = req.body;
    const newEvent = new Event({ title, description, date, location, capacity, organizer: req.user.id });
    await newEvent.save();
    res.status(201).json(newEvent);
  } catch (err) {
    res.status(400).json({ error: "Failed to create event" });
  }
});


// --- REGISTRATION ROUTES ---

// 4. Submit Registration Form (Protected)
router.post('/register', requireAuth, async (req, res) => {
  try {
    const { eventId } = req.body;
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    // Validate Event Capacity
    const currentRegistrations = await Registration.countDocuments({ event: eventId });
    if (currentRegistrations >= event.capacity) {
      return res.status(400).json({ error: "Event is fully booked" });
    }

    const registration = new Registration({ user: req.user.id, event: eventId });
    await registration.save();
    res.status(201).json({ message: "Registered successfully", registration });
  } catch (err) {
    res.status(400).json({ error: "You are already registered for this event" });
  }
});

// 5. View User's Registrations (Protected)
router.get('/my-registrations', requireAuth, async (req, res) => {
  try {
    const myRegistrations = await Registration.find({ user: req.user.id }).populate('event');
    res.json(myRegistrations);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// 6. Cancel Registration (Protected)
router.delete('/my-registrations/:id', requireAuth, async (req, res) => {
  try {
    // Ensures a user can only delete their own registration mapping
    const cancelled = await Registration.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!cancelled) {
      return res.status(404).json({ error: "Registration not found or unauthorized" });
    }
    res.json({ message: "Registration cancelled successfully" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
