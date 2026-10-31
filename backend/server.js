
const express = require('express');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

const authMiddleware = require('./middleware/authMiddleware');

const app = express();

// --------------------------------------------------
// GLOBAL MIDDLEWARE
// --------------------------------------------------

app.use(cors());
app.use(express.json());

// --------------------------------------------------
// AUTHENTICATION ROUTES
// --------------------------------------------------

const authRoutes = require('./routes/auth');

app.use('/api/auth', authRoutes);

// --------------------------------------------------
// TEST ROUTE
// --------------------------------------------------

app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to ShelfSense Library API!'
  });
});

// --------------------------------------------------
// GET ALL BOOKS
// --------------------------------------------------

app.get('/api/books', async (req, res) => {
  try {
    const [books] = await pool.query(`
      SELECT
        b.book_id,
        b.title,
        b.isbn,
        b.category,
        b.total_copies,
        b.available_copies,
        GROUP_CONCAT(
          a.author_name SEPARATOR ', '
        ) AS authors
      FROM books b
      LEFT JOIN book_authors ba
        ON b.book_id = ba.book_id
      LEFT JOIN authors a
        ON ba.author_id = a.author_id
      GROUP BY
        b.book_id,
        b.title,
        b.isbn,
        b.category,
        b.total_copies,
        b.available_copies
      ORDER BY b.title
    `);

    return res.json(books);

  } catch (error) {
    console.error('Database error:', error);

    return res.status(500).json({
      error: 'Unable to retrieve books.'
    });
  }
});

// --------------------------------------------------
// CREATE BOOK RESERVATION
// JWT PROTECTED
// --------------------------------------------------

app.post('/api/reservations', authMiddleware, async (req, res) => {

  // Get user ID from verified JWT token
  const userId = Number(req.user.user_id);

  const { book_id } = req.body;

  if (
    !Number.isInteger(userId) ||
    userId <= 0 ||
    book_id === undefined ||
    !Number.isInteger(Number(book_id)) ||
    Number(book_id) <= 0
  ) {
    return res.status(400).json({
      message: 'Please provide a valid book ID.'
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();

    await connection.beginTransaction();

    // Check whether authenticated user exists
    const [users] = await connection.execute(
      'SELECT user_id FROM users WHERE user_id = ?',
      [userId]
    );

    if (users.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        message: 'User not found.'
      });
    }

    // Lock book row
    const [books] = await connection.execute(
      `SELECT book_id, title, available_copies
       FROM books
       WHERE book_id = ?
       FOR UPDATE`,
      [Number(book_id)]
    );

    if (books.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        message: 'Book not found.'
      });
    }

    const book = books[0];

    if (Number(book.available_copies) <= 0) {
      await connection.rollback();

      return res.status(409).json({
        message: 'Sorry, this book is currently unavailable.'
      });
    }

    // Decrease available inventory
    const [updateResult] = await connection.execute(
      `UPDATE books
       SET available_copies = available_copies - 1
       WHERE book_id = ?
       AND available_copies > 0`,
      [Number(book_id)]
    );

    if (updateResult.affectedRows !== 1) {
      await connection.rollback();

      return res.status(409).json({
        message: 'No copies are currently available.'
      });
    }

    // Create reservation for authenticated user
    const [reservationResult] = await connection.execute(
      `INSERT INTO reservations (user_id, book_id, status)
       VALUES (?, ?, 'pending')`,
      [userId, Number(book_id)]
    );

    const [updatedBooks] = await connection.execute(
      `SELECT available_copies
       FROM books
       WHERE book_id = ?`,
      [Number(book_id)]
    );

    await connection.commit();

    return res.status(201).json({
      message: 'Book reserved successfully!',
      reservation_id: reservationResult.insertId,
      book_title: book.title,
      status: 'pending',
      available_copies: updatedBooks[0].available_copies
    });

  } catch (error) {

    if (connection) {
      await connection.rollback().catch(() => {});
    }

    console.error('Reservation error:', error);

    return res.status(500).json({
      message: 'Unable to create reservation.'
    });

  } finally {

    if (connection) {
      connection.release();
    }
  }
});

// --------------------------------------------------
// GET AUTHENTICATED USER'S RESERVATIONS
// JWT PROTECTED
// --------------------------------------------------

app.get('/api/reservations/me', authMiddleware, async (req, res) => {

  const userId = Number(req.user.user_id);

  try {

    const [reservations] = await pool.execute(
      `SELECT
         r.reservation_id,
         r.user_id,
         r.book_id,
         b.title AS book_title,
         b.category,
         r.reserved_at,
         r.status
       FROM reservations r
       INNER JOIN books b
         ON r.book_id = b.book_id
       WHERE r.user_id = ?
       ORDER BY r.reserved_at DESC, r.reservation_id DESC`,
      [userId]
    );

    return res.json(reservations);

  } catch (error) {

    console.error('Fetch reservations error:', error);

    return res.status(500).json({
      message: 'Unable to retrieve reservations.'
    });
  }
});

// --------------------------------------------------
// CANCEL A PENDING RESERVATION
// JWT PROTECTED
// --------------------------------------------------

app.delete(
  '/api/reservations/:reservationId',
  authMiddleware,
  async (req, res) => {

    const reservationId = Number(req.params.reservationId);
    const userId = Number(req.user.user_id);

    if (
      !Number.isInteger(reservationId) ||
      reservationId <= 0
    ) {
      return res.status(400).json({
        message: 'Please provide a valid reservation ID.'
      });
    }

    let connection;

    try {

      connection = await pool.getConnection();

      await connection.beginTransaction();

      const [reservations] = await connection.execute(
        `SELECT reservation_id, user_id, book_id, status
         FROM reservations
         WHERE reservation_id = ?
         AND user_id = ?
         FOR UPDATE`,
        [reservationId, userId]
      );

      if (reservations.length === 0) {
        await connection.rollback();

        return res.status(404).json({
          message: 'Reservation not found for this user.'
        });
      }

      const reservation = reservations[0];

      if (String(reservation.status).toLowerCase() !== 'pending') {
        await connection.rollback();

        return res.status(409).json({
          message: `This reservation cannot be cancelled because its status is "${reservation.status}".`
        });
      }

      const [books] = await connection.execute(
        `SELECT book_id, title, total_copies, available_copies
         FROM books
         WHERE book_id = ?
         FOR UPDATE`,
        [reservation.book_id]
      );

      if (books.length === 0) {
        await connection.rollback();

        return res.status(404).json({
          message: 'The book associated with this reservation was not found.'
        });
      }

      const book = books[0];

      if (
        Number(book.available_copies) >=
        Number(book.total_copies)
      ) {
        await connection.rollback();

        return res.status(409).json({
          message: 'Inventory is already at its maximum. No changes were made.'
        });
      }

      const [updateReservation] = await connection.execute(
        `UPDATE reservations
         SET status = 'cancelled'
         WHERE reservation_id = ?
         AND user_id = ?
         AND status = 'pending'`,
        [reservationId, userId]
      );

      if (updateReservation.affectedRows !== 1) {
        await connection.rollback();

        return res.status(409).json({
          message: 'The reservation status changed. Please refresh and try again.'
        });
      }

      await connection.execute(
        `UPDATE books
         SET available_copies = available_copies + 1
         WHERE book_id = ?`,
        [reservation.book_id]
      );

      const [updatedBooks] = await connection.execute(
        `SELECT available_copies
         FROM books
         WHERE book_id = ?`,
        [reservation.book_id]
      );

      await connection.commit();

      return res.json({
        message: 'Reservation cancelled successfully.',
        reservation_id: reservationId,
        book_title: book.title,
        status: 'cancelled',
        available_copies: updatedBooks[0].available_copies
      });

    } catch (error) {

      if (connection) {
        await connection.rollback().catch(() => {});
      }

      console.error('Cancel reservation error:', error);

      return res.status(500).json({
        message: 'Unable to cancel the reservation.'
      });

    } finally {

      if (connection) {
        connection.release();
      }
    }
  }
);

// --------------------------------------------------
// RETURN A RESERVED BOOK
// JWT PROTECTED
// --------------------------------------------------

app.post(
  '/api/reservations/:reservationId/return',
  authMiddleware,
  async (req, res) => {

    const reservationId = Number(req.params.reservationId);
    const userId = Number(req.user.user_id);

    if (
      !Number.isInteger(reservationId) ||
      reservationId <= 0
    ) {
      return res.status(400).json({
        message: 'Please provide a valid reservation ID.'
      });
    }

    let connection;

    try {

      connection = await pool.getConnection();

      await connection.beginTransaction();

      const [reservations] = await connection.execute(
        `SELECT reservation_id, user_id, book_id, status
         FROM reservations
         WHERE reservation_id = ?
         AND user_id = ?
         FOR UPDATE`,
        [reservationId, userId]
      );

      if (reservations.length === 0) {
        await connection.rollback();

        return res.status(404).json({
          message: 'Reservation not found for this user.'
        });
      }

      const reservation = reservations[0];

      if (String(reservation.status).toLowerCase() !== 'pending') {
        await connection.rollback();

        return res.status(409).json({
          message: `This reservation cannot be returned because its status is "${reservation.status}".`
        });
      }

      const [books] = await connection.execute(
        `SELECT book_id, title, total_copies, available_copies
         FROM books
         WHERE book_id = ?
         FOR UPDATE`,
        [reservation.book_id]
      );

      if (books.length === 0) {
        await connection.rollback();

        return res.status(404).json({
          message: 'The book associated with this reservation was not found.'
        });
      }

      const book = books[0];

      if (
        Number(book.available_copies) >=
        Number(book.total_copies)
      ) {
        await connection.rollback();

        return res.status(409).json({
          message: 'Inventory is already at its maximum. No changes were made.'
        });
      }

      const [updateResult] = await connection.execute(
        `UPDATE reservations
         SET status = 'returned'
         WHERE reservation_id = ?
         AND user_id = ?
         AND status = 'pending'`,
        [reservationId, userId]
      );

      if (updateResult.affectedRows !== 1) {
        await connection.rollback();

        return res.status(409).json({
          message: 'The reservation status changed. Please refresh and try again.'
        });
      }

      await connection.execute(
        `UPDATE books
         SET available_copies = available_copies + 1
         WHERE book_id = ?`,
        [reservation.book_id]
      );

      const [updatedBooks] = await connection.execute(
        `SELECT available_copies
         FROM books
         WHERE book_id = ?`,
        [reservation.book_id]
      );

      await connection.commit();

      return res.json({
        message: 'Book returned successfully!',
        reservation_id: reservationId,
        book_title: book.title,
        status: 'returned',
        available_copies: updatedBooks[0].available_copies
      });

    } catch (error) {

      if (connection) {
        await connection.rollback().catch(() => {});
      }

      console.error('Return book error:', error);

      return res.status(500).json({
        message: 'Unable to return the book.'
      });

    } finally {

      if (connection) {
        connection.release();
      }
    }
  }
);

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`ShelfSense API running at http://localhost:${PORT}`);
});
