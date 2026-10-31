
const express = require('express');
const pool = require('../db');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

const router = express.Router();

// All admin routes require login AND admin permission.
router.use(authMiddleware, adminMiddleware);


// ==========================================
// 1. ADMIN DASHBOARD STATISTICS
// GET /api/admin/dashboard
// ==========================================

router.get('/dashboard', async (req, res) => {
  try {
    const [bookStats] = await pool.query(`
      SELECT
        COUNT(*) AS total_books,
        COALESCE(SUM(total_copies), 0) AS total_copies,
        COALESCE(SUM(available_copies), 0) AS available_copies
      FROM books
    `);

    const [userStats] = await pool.query(`
      SELECT
        COUNT(*) AS total_users,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS total_admins
      FROM users
    `);

    const [reservationStats] = await pool.query(`
      SELECT
        COUNT(*) AS total_reservations,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'fulfilled' THEN 1 ELSE 0 END) AS fulfilled,
        SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END) AS returned,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
      FROM reservations
    `);

    return res.json({
      books: bookStats[0],
      users: userStats[0],
      reservations: reservationStats[0]
    });

  } catch (error) {
    console.error('Admin dashboard error:', error);

    return res.status(500).json({
      message: 'Unable to retrieve dashboard statistics.'
    });
  }
});


// ==========================================
// 2. VIEW ALL REGISTERED USERS
// GET /api/admin/users
// ==========================================

router.get('/users', async (req, res) => {
  try {
    const [users] = await pool.query(`
      SELECT
        user_id,
        full_name,
        email,
        role
      FROM users
      ORDER BY user_id DESC
    `);

    return res.json(users);

  } catch (error) {
    console.error('Admin users error:', error);

    return res.status(500).json({
      message: 'Unable to retrieve users.'
    });
  }
});


// ==========================================
// 3. VIEW ALL RESERVATIONS
// GET /api/admin/reservations
// ==========================================

router.get('/reservations', async (req, res) => {
  try {
    const [reservations] = await pool.query(`
      SELECT
        r.reservation_id,
        r.user_id,
        u.full_name,
        u.email,
        r.book_id,
        b.title AS book_title,
        r.reserved_at,
        r.status
      FROM reservations r
      INNER JOIN users u
        ON r.user_id = u.user_id
      INNER JOIN books b
        ON r.book_id = b.book_id
      ORDER BY r.reserved_at DESC, r.reservation_id DESC
    `);

    return res.json(reservations);

  } catch (error) {
    console.error('Admin reservations error:', error);

    return res.status(500).json({
      message: 'Unable to retrieve reservations.'
    });
  }
});


// ==========================================
// 4. ADD A NEW BOOK
// POST /api/admin/books
// ==========================================

router.post('/books', async (req, res) => {
  const {
    title,
    isbn,
    category,
    total_copies,
    authors
  } = req.body;

  if (
    typeof title !== 'string' ||
    !title.trim() ||
    typeof category !== 'string' ||
    !category.trim() ||
    !Number.isInteger(Number(total_copies)) ||
    Number(total_copies) < 1
  ) {
    return res.status(400).json({
      message: 'Valid title, category and total copies are required.'
    });
  }

  const cleanTitle = title.trim();
  const cleanCategory = category.trim();
  const cleanIsbn = isbn && String(isbn).trim()
    ? String(isbn).trim()
    : null;

  const authorNames = Array.isArray(authors)
    ? authors
        .filter(name => typeof name === 'string')
        .map(name => name.trim())
        .filter(Boolean)
    : [];

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [result] = await connection.execute(
      `INSERT INTO books
       (title, isbn, category, total_copies, available_copies)
       VALUES (?, ?, ?, ?, ?)`,
      [
        cleanTitle,
        cleanIsbn,
        cleanCategory,
        Number(total_copies),
        Number(total_copies)
      ]
    );

    const bookId = result.insertId;

    for (const authorName of [...new Set(authorNames)]) {
      const [existingAuthors] = await connection.execute(
        'SELECT author_id FROM authors WHERE author_name = ?',
        [authorName]
      );

      let authorId;

      if (existingAuthors.length > 0) {
        authorId = existingAuthors[0].author_id;
      } else {
        const [authorResult] = await connection.execute(
          'INSERT INTO authors (author_name) VALUES (?)',
          [authorName]
        );

        authorId = authorResult.insertId;
      }

      await connection.execute(
        `INSERT INTO book_authors (book_id, author_id)
         VALUES (?, ?)`,
        [bookId, authorId]
      );
    }

    await connection.commit();

    return res.status(201).json({
      message: 'Book added successfully.',
      book_id: bookId
    });

  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    console.error('Add book error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        message: 'A book with this ISBN already exists.'
      });
    }

    return res.status(500).json({
      message: 'Unable to add book.'
    });

  } finally {
    if (connection) connection.release();
  }
});


// ==========================================
// 5. UPDATE AN EXISTING BOOK
// PUT /api/admin/books/:bookId
// ==========================================

router.put('/books/:bookId', async (req, res) => {
  const bookId = Number(req.params.bookId);

  if (!Number.isInteger(bookId) || bookId <= 0) {
    return res.status(400).json({
      message: 'Invalid book ID.'
    });
  }

  const {
    title,
    isbn,
    category,
    total_copies,
    authors
  } = req.body;

  if (
    typeof title !== 'string' ||
    !title.trim() ||
    typeof category !== 'string' ||
    !category.trim() ||
    !Number.isInteger(Number(total_copies)) ||
    Number(total_copies) < 1
  ) {
    return res.status(400).json({
      message: 'Valid title, category and total copies are required.'
    });
  }

  const authorNames = Array.isArray(authors)
    ? authors
        .filter(name => typeof name === 'string')
        .map(name => name.trim())
        .filter(Boolean)
    : [];

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [books] = await connection.execute(
      `SELECT total_copies, available_copies
       FROM books
       WHERE book_id = ?
       FOR UPDATE`,
      [bookId]
    );

    if (books.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        message: 'Book not found.'
      });
    }

    const book = books[0];

    // Copies currently in use cannot be removed from inventory.
    const copiesInUse =
      Number(book.total_copies) - Number(book.available_copies);

    const newTotal = Number(total_copies);

    if (newTotal < copiesInUse) {
      await connection.rollback();

      return res.status(409).json({
        message: `At least ${copiesInUse} total copies are required because some copies are currently reserved.`
      });
    }

    const newAvailable = newTotal - copiesInUse;

    const cleanIsbn = isbn && String(isbn).trim()
      ? String(isbn).trim()
      : null;

    await connection.execute(
      `UPDATE books
       SET title = ?,
           isbn = ?,
           category = ?,
           total_copies = ?,
           available_copies = ?
       WHERE book_id = ?`,
      [
        title.trim(),
        cleanIsbn,
        category.trim(),
        newTotal,
        newAvailable,
        bookId
      ]
    );

    // Replace author associations only when authors is supplied.
    if (Array.isArray(authors)) {
      await connection.execute(
        'DELETE FROM book_authors WHERE book_id = ?',
        [bookId]
      );

      for (const authorName of [...new Set(authorNames)]) {
        const [existingAuthors] = await connection.execute(
          'SELECT author_id FROM authors WHERE author_name = ?',
          [authorName]
        );

        let authorId;

        if (existingAuthors.length > 0) {
          authorId = existingAuthors[0].author_id;
        } else {
          const [authorResult] = await connection.execute(
            'INSERT INTO authors (author_name) VALUES (?)',
            [authorName]
          );

          authorId = authorResult.insertId;
        }

        await connection.execute(
          `INSERT INTO book_authors (book_id, author_id)
           VALUES (?, ?)`,
          [bookId, authorId]
        );
      }
    }

    await connection.commit();

    return res.json({
      message: 'Book updated successfully.',
      book_id: bookId,
      total_copies: newTotal,
      available_copies: newAvailable
    });

  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    console.error('Update book error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        message: 'A book with this ISBN already exists.'
      });
    }

    return res.status(500).json({
      message: 'Unable to update book.'
    });

  } finally {
    if (connection) connection.release();
  }
});


// ==========================================
// 6. DELETE A BOOK
// DELETE /api/admin/books/:bookId
// ==========================================

router.delete('/books/:bookId', async (req, res) => {
  const bookId = Number(req.params.bookId);

  if (!Number.isInteger(bookId) || bookId <= 0) {
    return res.status(400).json({
      message: 'Invalid book ID.'
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [books] = await connection.execute(
      'SELECT book_id, title FROM books WHERE book_id = ? FOR UPDATE',
      [bookId]
    );

    if (books.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        message: 'Book not found.'
      });
    }

    // Preserve historical reservations and transaction records.
    const [reservations] = await connection.execute(
      'SELECT reservation_id FROM reservations WHERE book_id = ? LIMIT 1',
      [bookId]
    );

    const [transactions] = await connection.execute(
      'SELECT transaction_id FROM transactions WHERE book_id = ? LIMIT 1',
      [bookId]
    );

    if (reservations.length > 0 || transactions.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        message: 'This book cannot be deleted because reservation or transaction records exist. You can update its details instead.'
      });
    }

    await connection.execute(
      'DELETE FROM book_authors WHERE book_id = ?',
      [bookId]
    );

    await connection.execute(
      'DELETE FROM books WHERE book_id = ?',
      [bookId]
    );

    await connection.commit();

    return res.json({
      message: 'Book deleted successfully.',
      book_id: bookId,
      title: books[0].title
    });

  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }

    console.error('Delete book error:', error);

    return res.status(500).json({
      message: 'Unable to delete book.'
    });

  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
