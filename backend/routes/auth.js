
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

// ==========================================
// USER REGISTRATION
// ==========================================
router.post('/register', async (req, res) => {
  try {
    const { full_name, email, password } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({
        message: 'Name, email and password are required.'
      });
    }

    const cleanName = full_name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length < 2 || cleanName.length > 150) {
      return res.status(400).json({
        message: 'Name must contain between 2 and 150 characters.'
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({
        message: 'Please enter a valid email address.'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: 'Password must contain at least 8 characters.'
      });
    }

    // Check whether email already exists
    const [existingUsers] = await pool.execute(
      'SELECT user_id FROM users WHERE email = ?',
      [cleanEmail]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        message: 'This email is already registered.'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Always create a normal user.
    // Admin privileges cannot be assigned through registration.
    const [result] = await pool.execute(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES (?, ?, ?, 'user')`,
      [cleanName, cleanEmail, passwordHash]
    );

    return res.status(201).json({
      message: 'Registration successful!',
      user: {
        user_id: result.insertId,
        full_name: cleanName,
        email: cleanEmail,
        role: 'user'
      }
    });

  } catch (error) {
    console.error('Registration error:', error);

    return res.status(500).json({
      message: 'Unable to register user.'
    });
  }
});


// ==========================================
// USER LOGIN
// ==========================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Fetch user including role
    const [users] = await pool.execute(
      `SELECT user_id, full_name, email, password_hash, role
       FROM users
       WHERE email = ?`,
      [cleanEmail]
    );

    if (users.length === 0 || !users[0].password_hash) {
      return res.status(401).json({
        message: 'Invalid email or password.'
      });
    }

    const user = users[0];

    // Verify password
    const passwordMatch = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatch) {
      return res.status(401).json({
        message: 'Invalid email or password.'
      });
    }

    // Generate JWT with user role
    const token = jwt.sign(
      {
        user_id: user.user_id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '1d'
      }
    );

    return res.json({
      message: 'Login successful!',
      token,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Login error:', error);

    return res.status(500).json({
      message: 'Unable to log in.'
    });
  }
});

module.exports = router;
