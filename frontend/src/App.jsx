import { useEffect, useMemo, useState } from 'react';
import './App.css';

const API_URL = 'http://localhost:5000/api/books';
const RESERVATION_API_URL = 'http://localhost:5000/api/reservations';
const AUTH_API_URL = 'http://localhost:5000/api/auth';
const ADMIN_API_URL = 'http://localhost:5000/api/admin';

function App() {
  const [books, setBooks] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Authentication
  const [token, setToken] = useState(
    () => localStorage.getItem('shelfsense_token') || ''
  );

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('shelfsense_user')) || null;
    } catch {
      return null;
    }
  });

  const [authMode, setAuthMode] = useState('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState('');

  // Reservations
  const [reservingBookId, setReservingBookId] = useState(null);
  const [cancellingReservationId, setCancellingReservationId] = useState(null);
  const [returningReservationId, setReturningReservationId] = useState(null);
  const [reservationMessage, setReservationMessage] = useState('');
  const [myReservations, setMyReservations] = useState([]);
  const [reservationsLoading, setReservationsLoading] = useState(false);
  const [reservationsError, setReservationsError] = useState('');

  // Admin dashboard
  const [adminDashboard, setAdminDashboard] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminReservations, setAdminReservations] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [adminMessage, setAdminMessage] = useState('');
  const [activeView, setActiveView] = useState('home');
  const [editingBookId, setEditingBookId] = useState(null);

  const [bookForm, setBookForm] = useState({
    title: '',
    isbn: '',
    category: '',
    total_copies: 1,
    authors: ''
  });

  const isAdmin = user?.role === 'admin';

  // Load books
  const fetchBooks = async () => {
    try {
      const response = await fetch(API_URL);

      if (!response.ok) {
        throw new Error('Could not load books.');
      }

      const data = await response.json();
      setBooks(Array.isArray(data) ? data : []);
      setError('');
    } catch {
      setError(
        'Unable to connect to the library server. Make sure your backend is running on port 5000.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Load the logged-in user's reservations
  const fetchMyReservations = async (authToken = token) => {
    if (!authToken) {
      setMyReservations([]);
      setReservationsLoading(false);
      return;
    }

    try {
      setReservationsLoading(true);
      setReservationsError('');

      const response = await fetch(`${RESERVATION_API_URL}/me`, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Unable to load your reservations.');
      }

      setMyReservations(Array.isArray(data) ? data : []);
    } catch (err) {
      setReservationsError(err.message);
    } finally {
      setReservationsLoading(false);
    }
  };

  // Load admin dashboard, users, and reservations
  const fetchAdminData = async (authToken = token) => {
    if (!authToken) return;

    try {
      setAdminLoading(true);
      setAdminError('');

      const headers = {
        Authorization: `Bearer ${authToken}`
      };

      const [
        dashboardResponse,
        usersResponse,
        reservationsResponse
      ] = await Promise.all([
        fetch(`${ADMIN_API_URL}/dashboard`, { headers }),
        fetch(`${ADMIN_API_URL}/users`, { headers }),
        fetch(`${ADMIN_API_URL}/reservations`, { headers })
      ]);

      const [
        dashboardData,
        usersData,
        reservationsData
      ] = await Promise.all([
        dashboardResponse.json(),
        usersResponse.json(),
        reservationsResponse.json()
      ]);

      if (
        !dashboardResponse.ok ||
        !usersResponse.ok ||
        !reservationsResponse.ok
      ) {
        throw new Error(
          dashboardData.message ||
          usersData.message ||
          reservationsData.message ||
          'Unable to load admin information.'
        );
      }

      setAdminDashboard(dashboardData);
      setAdminUsers(Array.isArray(usersData) ? usersData : []);
      setAdminReservations(
        Array.isArray(reservationsData) ? reservationsData : []
      );
    } catch (err) {
      setAdminError(err.message);
    } finally {
      setAdminLoading(false);
    }
  };

  // Load data when the application starts
  useEffect(() => {
    fetchBooks();
  }, []);

  // Load personal reservations after login
  useEffect(() => {
    if (token && user) {
      fetchMyReservations(token);
    } else {
      setMyReservations([]);
      setReservationsLoading(false);
    }
  }, [token, user]);

  // Load admin data after admin login
  useEffect(() => {
    if (token && user?.role === 'admin') {
      fetchAdminData(token);
    } else {
      setAdminDashboard(null);
      setAdminUsers([]);
      setAdminReservations([]);
      setAdminError('');
      setActiveView('home');
    }
  }, [token, user]);

  // Authentication
  const handleAuthSubmit = async (event) => {
    event.preventDefault();

    setAuthLoading(true);
    setAuthMessage('');

    try {
      const endpoint =
        authMode === 'register' ? '/register' : '/login';

      const payload =
        authMode === 'register'
          ? {
              full_name: authName.trim(),
              email: authEmail.trim().toLowerCase(),
              password: authPassword
            }
          : {
              email: authEmail.trim().toLowerCase(),
              password: authPassword
            };

      const response = await fetch(`${AUTH_API_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Authentication failed.');
      }

      if (authMode === 'register') {
        setAuthMessage('Registration successful! Please log in.');
        setAuthMode('login');
        setAuthName('');
        setAuthPassword('');
      } else {
        if (!data.token || !data.user) {
          throw new Error('Login response is incomplete. Please try again.');
        }

        localStorage.setItem('shelfsense_token', data.token);
        localStorage.setItem('shelfsense_user', JSON.stringify(data.user));

        setToken(data.token);
        setUser(data.user);
        setAuthPassword('');
        setAuthMessage('');
        setReservationMessage('');
        setReservationsError('');
        setActiveView('home');

        await fetchMyReservations(data.token);

        if (data.user.role === 'admin') {
          await fetchAdminData(data.token);
        }
      }
    } catch (err) {
      setAuthMessage(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Logout
  const handleLogout = () => {
    localStorage.removeItem('shelfsense_token');
    localStorage.removeItem('shelfsense_user');

    setToken('');
    setUser(null);
    setMyReservations([]);
    setReservationsError('');
    setReservationMessage('');
    setAuthPassword('');
    setAuthMessage('You have logged out successfully.');
    setAuthMode('login');
    setActiveView('home');
    setAdminDashboard(null);
    setAdminUsers([]);
    setAdminReservations([]);
    resetBookForm();
  };

  // Book categories
  const categories = useMemo(
    () => [
      'All',
      ...new Set(books.map((book) => book.category).filter(Boolean))
    ],
    [books]
  );

  // Search and filtering
  const filteredBooks = useMemo(() => {
    return books.filter((book) => {
      const searchText =
        `${book.title} ${book.authors || ''} ${book.category || ''}`
          .toLowerCase();

      const matchesSearch = searchText.includes(search.toLowerCase());
      const matchesCategory =
        category === 'All' || book.category === category;

      return matchesSearch && matchesCategory;
    });
  }, [books, search, category]);

  const totalCopies = books.reduce(
    (sum, book) => sum + Number(book.total_copies || 0),
    0
  );

  const availableCopies = books.reduce(
    (sum, book) => sum + Number(book.available_copies || 0),
    0
  );

  // Reserve a book
  const handleReserve = async (book) => {
    if (!token) {
      setAuthMessage('Please log in to reserve a book.');
      setAuthMode('login');
      document.getElementById('authentication')?.scrollIntoView({
        behavior: 'smooth'
      });
      return;
    }

    setReservingBookId(book.book_id);
    setReservationMessage('');

    try {
      const response = await fetch(RESERVATION_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          book_id: book.book_id
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Reservation failed.');
      }

      setReservationMessage(
        `Success! ${data.book_title || book.title} has been reserved. Reservation ID: ${data.reservation_id}`
      );

      if (typeof data.available_copies === 'number') {
        setBooks((currentBooks) =>
          currentBooks.map((item) =>
            item.book_id === book.book_id
              ? {
                  ...item,
                  available_copies: data.available_copies
                }
              : item
          )
        );
      } else {
        await fetchBooks();
      }

      await fetchMyReservations();
    } catch (err) {
      setReservationMessage(err.message);
    } finally {
      setReservingBookId(null);
    }
  };

  // Cancel a reservation
  const handleCancelReservation = async (reservation) => {
    const reservationId = reservation.reservation_id;

    if (!window.confirm('Are you sure you want to cancel this reservation?')) {
      return;
    }

    setCancellingReservationId(reservationId);
    setReservationMessage('');

    try {
      const response = await fetch(
        `${RESERVATION_API_URL}/${reservationId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Unable to cancel reservation.');
      }

      setReservationMessage(
        `Success! Reservation #${reservationId} has been cancelled.`
      );

      await Promise.all([
        fetchBooks(),
        fetchMyReservations()
      ]);

      if (isAdmin) await fetchAdminData();
    } catch (err) {
      setReservationMessage(err.message);
    } finally {
      setCancellingReservationId(null);
    }
  };

  // Return a book
  const handleReturnReservation = async (reservation) => {
    const reservationId = reservation.reservation_id;

    if (!window.confirm('Are you sure you want to return this book?')) {
      return;
    }

    setReturningReservationId(reservationId);
    setReservationMessage('');

    try {
      const response = await fetch(
        `${RESERVATION_API_URL}/${reservationId}/return`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Unable to return the book.');
      }

      setReservationMessage(
        `Success! ${data.book_title || reservation.book_title || reservation.title || 'The book'} has been returned successfully.`
      );

      await Promise.all([
        fetchBooks(),
        fetchMyReservations()
      ]);

      if (isAdmin) await fetchAdminData();
    } catch (err) {
      setReservationMessage(err.message);
    } finally {
      setReturningReservationId(null);
    }
  };

  // Reset the book form
  const resetBookForm = () => {
    setBookForm({
      title: '',
      isbn: '',
      category: '',
      total_copies: 1,
      authors: ''
    });

    setEditingBookId(null);
  };

  // Update book form fields
  const handleBookFormChange = (event) => {
    const { name, value } = event.target;

    setBookForm((previous) => ({
      ...previous,
      [name]: value
    }));
  };

  // Add or update a book
  const handleBookSubmit = async (event) => {
    event.preventDefault();

    if (!isAdmin || !token) return;

    try {
      setAdminLoading(true);
      setAdminError('');
      setAdminMessage('');

      const payload = {
        title: bookForm.title.trim(),
        isbn: bookForm.isbn.trim() || null,
        category: bookForm.category.trim(),
        total_copies: Number(bookForm.total_copies),
        authors: bookForm.authors
          .split(',')
          .map((author) => author.trim())
          .filter(Boolean)
      };

      const response = await fetch(
        editingBookId
          ? `${ADMIN_API_URL}/books/${editingBookId}`
          : `${ADMIN_API_URL}/books`,
        {
          method: editingBookId ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Unable to save book.');
      }

      setAdminMessage(
        editingBookId
          ? 'Book updated successfully!'
          : 'Book added successfully!'
      );

      resetBookForm();

      await Promise.all([
        fetchBooks(),
        fetchAdminData()
      ]);
    } catch (err) {
      setAdminError(err.message);
    } finally {
      setAdminLoading(false);
    }
  };

  // Edit a book
  const handleEditBook = (book) => {
    setBookForm({
      title: book.title || '',
      isbn: book.isbn || '',
      category: book.category || '',
      total_copies: book.total_copies || 1,
      authors: Array.isArray(book.authors)
        ? book.authors.join(', ')
        : book.authors || ''
    });

    setEditingBookId(book.book_id);

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  // Delete a book
  const handleDeleteBook = async (bookId) => {
    if (!isAdmin || !token) return;

    const confirmed = window.confirm(
      'Are you sure you want to delete this book?'
    );

    if (!confirmed) return;

    try {
      setAdminError('');
      setAdminMessage('');

      const response = await fetch(
        `${ADMIN_API_URL}/books/${bookId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Unable to delete book.');
      }

      setAdminMessage('Book deleted successfully!');

      await Promise.all([
        fetchBooks(),
        fetchAdminData()
      ]);
    } catch (err) {
      setAdminError(err.message);
    }
  };

  // Read a dashboard statistic using alternative possible field names
  const getStat = (section, keys) => {
    const data = adminDashboard?.[section] || {};

    for (const key of keys) {
      if (data[key] !== undefined && data[key] !== null) {
        return data[key];
      }
    }

    return 0;
  };

  const formatDate = (value) => {
    if (!value) return '—';

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleDateString();
  };

  return (
    <div className="app">
      <header className="navbar">
        <a
          className="brand"
          href="#home"
          onClick={() => setActiveView('home')}
        >
          <span className="brand-icon">S</span>
          <span>
            ShelfSense<span className="brand-dot">.</span>
          </span>
        </a>

        <nav>
          <a
            className={activeView === 'home' ? 'nav-active' : ''}
            href="#home"
            onClick={() => setActiveView('home')}
          >
            Home
          </a>

          <a
            href="#catalog"
            onClick={() => setActiveView('home')}
          >
            Explore Books
          </a>

          <a
            href="#reservations"
            onClick={() => setActiveView('home')}
          >
            My Reservations
          </a>

          <a
            href="#how-it-works"
            onClick={() => setActiveView('home')}
          >
            How It Works
          </a>

          {isAdmin && (
            <button
              type="button"
              className={`admin-nav-link ${
                activeView === 'admin' ? 'nav-active' : ''
              }`}
              onClick={() => setActiveView('admin')}
            >
              Admin Dashboard
            </button>
          )}
        </nav>

        {user ? (
          <div className="auth-nav">
            <span>Hi, {user.full_name}</span>

            <button
              type="button"
              className="nav-button"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        ) : (
          <a className="nav-button" href="#authentication">
            Login / Register
          </a>
        )}
      </header>

      <main>
        {activeView === 'admin' && isAdmin ? (
          <section className="admin-dashboard section-wrap" id="admin-dashboard">
            <div className="section-heading">
              <div>
                <div className="eyebrow">SHELFSENSE MANAGEMENT</div>
                <h2>
                  Admin <em>Dashboard.</em>
                </h2>
                <p>
                  Manage your library, books, users, and reservations.
                </p>
              </div>

              <button
                type="button"
                className="primary-button"
                onClick={() => fetchAdminData()}
                disabled={adminLoading}
              >
                {adminLoading ? 'Refreshing...' : 'Refresh data ↻'}
              </button>
            </div>

            {adminError && (
              <p className="message error-message" role="alert">
                {adminError}
              </p>
            )}

            {adminMessage && (
              <p className="message success-message" role="status">
                {adminMessage}
              </p>
            )}

            {adminLoading && !adminDashboard && (
              <p className="message">Loading dashboard information...</p>
            )}

            {/* Dashboard statistics */}
            <div className="admin-stats-grid">
              <article className="admin-stat-card">
                <span>Total book titles</span>
                <strong>
                  {getStat('books', [
                    'total_books',
                    'total_titles',
                    'book_count',
                    'total'
                  ])}
                </strong>
              </article>

              <article className="admin-stat-card">
                <span>Total copies</span>
                <strong>
                  {getStat('books', [
                    'total_copies',
                    'totalCopies'
                  ])}
                </strong>
              </article>

              <article className="admin-stat-card">
                <span>Available copies</span>
                <strong>
                  {getStat('books', [
                    'available_copies',
                    'availableCopies'
                  ])}
                </strong>
              </article>

              <article className="admin-stat-card">
                <span>Registered users</span>
                <strong>
                  {getStat('users', [
                    'total_users',
                    'total',
                    'user_count'
                  ])}
                </strong>
              </article>

              <article className="admin-stat-card">
                <span>Total reservations</span>
                <strong>
                  {getStat('reservations', [
                    'total_reservations',
                    'total',
                    'reservation_count'
                  ])}
                </strong>
              </article>

              <article className="admin-stat-card">
                <span>Pending reservations</span>
                <strong>
                  {getStat('reservations', [
                    'pending',
                    'pending_reservations'
                  ])}
                </strong>
              </article>
            </div>

            {/* Book form */}
            <section className="admin-panel">
              <div className="admin-panel-heading">
                <div>
                  <div className="eyebrow">BOOK MANAGEMENT</div>
                  <h3>
                    {editingBookId ? 'Edit book' : 'Add a new book'}
                  </h3>
                </div>

                {editingBookId && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={resetBookForm}
                  >
                    Cancel editing
                  </button>
                )}
              </div>

              <form className="admin-book-form" onSubmit={handleBookSubmit}>
                <label>
                  Book title
                  <input
                    type="text"
                    name="title"
                    value={bookForm.title}
                    onChange={handleBookFormChange}
                    placeholder="Enter book title"
                    required
                  />
                </label>

                <label>
                  ISBN
                  <input
                    type="text"
                    name="isbn"
                    value={bookForm.isbn}
                    onChange={handleBookFormChange}
                    placeholder="Enter ISBN (optional)"
                  />
                </label>

                <label>
                  Category
                  <input
                    type="text"
                    name="category"
                    value={bookForm.category}
                    onChange={handleBookFormChange}
                    placeholder="e.g. Fiction, Science"
                    required
                  />
                </label>

                <label>
                  Total copies
                  <input
                    type="number"
                    name="total_copies"
                    min="1"
                    value={bookForm.total_copies}
                    onChange={handleBookFormChange}
                    required
                  />
                </label>

                <label className="admin-author-field">
                  Authors
                  <input
                    type="text"
                    name="authors"
                    value={bookForm.authors}
                    onChange={handleBookFormChange}
                    placeholder="Separate multiple authors with commas"
                  />
                </label>

                <div className="admin-form-actions">
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={adminLoading}
                  >
                    {adminLoading
                      ? 'Saving...'
                      : editingBookId
                        ? 'Update book'
                        : 'Add book'}
                  </button>

                  <button
                    type="button"
                    className="text-button"
                    onClick={resetBookForm}
                  >
                    Clear form
                  </button>
                </div>
              </form>
            </section>

            {/* Manage books */}
            <section className="admin-panel">
              <div className="admin-panel-heading">
                <div>
                  <div className="eyebrow">LIBRARY COLLECTION</div>
                  <h3>Manage books</h3>
                </div>

                <span className="collection-count">
                  {books.length} BOOKS
                </span>
              </div>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Title</th>
                      <th>Authors</th>
                      <th>Category</th>
                      <th>Total</th>
                      <th>Available</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {books.map((book) => (
                      <tr key={book.book_id}>
                        <td>{book.book_id}</td>
                        <td>{book.title}</td>
                        <td>{book.authors || '—'}</td>
                        <td>{book.category || '—'}</td>
                        <td>{book.total_copies}</td>
                        <td>{book.available_copies}</td>
                        <td>
                          <div className="admin-table-actions">
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => handleEditBook(book)}
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              className="text-button admin-delete-button"
                              onClick={() => handleDeleteBook(book.book_id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {books.length === 0 && (
                      <tr>
                        <td colSpan="7">No books available.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Registered users */}
            <section className="admin-panel">
              <div className="admin-panel-heading">
                <div>
                  <div className="eyebrow">ACCOUNT MANAGEMENT</div>
                  <h3>Registered users</h3>
                </div>

                <span className="collection-count">
                  {adminUsers.length} USERS
                </span>
              </div>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>User ID</th>
                      <th>Full name</th>
                      <th>Email</th>
                      <th>Role</th>
                    </tr>
                  </thead>

                  <tbody>
                    {adminUsers.map((item) => (
                      <tr key={item.user_id}>
                        <td>{item.user_id}</td>
                        <td>{item.full_name}</td>
                        <td>{item.email}</td>
                        <td>
                          <span className="admin-role">
                            {item.role}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {adminUsers.length === 0 && (
                      <tr>
                        <td colSpan="4">No users found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* All reservations */}
            <section className="admin-panel">
              <div className="admin-panel-heading">
                <div>
                  <div className="eyebrow">BORROWING ACTIVITY</div>
                  <h3>All reservations</h3>
                </div>

                <span className="collection-count">
                  {adminReservations.length} RESERVATIONS
                </span>
              </div>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Reservation ID</th>
                      <th>User</th>
                      <th>Email</th>
                      <th>Book</th>
                      <th>Reserved on</th>
                      <th>Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {adminReservations.map((item) => (
                      <tr key={item.reservation_id}>
                        <td>{item.reservation_id}</td>
                        <td>
                          {item.full_name ||
                            item.user_name ||
                            item.name ||
                            '—'}
                        </td>
                        <td>{item.email || '—'}</td>
                        <td>
                          {item.book_title || item.title || '—'}
                        </td>
                        <td>{formatDate(item.reserved_at)}</td>
                        <td>
                          <span className="admin-role">
                            {item.status || '—'}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {adminReservations.length === 0 && (
                      <tr>
                        <td colSpan="6">No reservations found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        ) : (
          <>
            {/* Hero */}
            <section className="hero" id="home">
              <div className="hero-content">
                <div className="eyebrow">
                  <span className="live-dot" />
                  YOUR NEXT CHAPTER STARTS HERE
                </div>

                <h1>
                  Every book has
                  <br />
                  a story. Find
                  <br />
                  <span>your next one.</span>
                </h1>

                <p className="hero-description">
                  A little curiosity goes a long way. Discover books,
                  find your favourites, and let your next adventure begin.
                </p>

                <a className="primary-button" href="#catalog">
                  Explore the collection <span>↗</span>
                </a>

                <div className="hero-note">
                  <span>✳</span> Discover. Borrow. Read. Repeat.
                </div>
              </div>

              <div className="hero-art">
                <div className="art-glow" />

                <div className="book-scene">
                  <div className="scene-book book-one">
                    <span>THE ART OF<br />SLOW LIVING</span>
                  </div>
                  <div className="scene-book book-two">
                    <span>THE<br />UNKNOWN</span>
                  </div>
                  <div className="scene-book book-three">
                    <span>IDEAS THAT<br />MATTER</span>
                  </div>
                  <div className="scene-book book-four">
                    <span>WILD<br />IMAGINATIONS</span>
                  </div>
                  <div className="scene-book book-five">
                    <span>THE<br />BEGINNING</span>
                  </div>

                  <div className="scene-shelf" />

                  <div className="plant-pot">
                    <span className="leaf leaf-one" />
                    <span className="leaf leaf-two" />
                    <span className="leaf leaf-three" />
                  </div>
                </div>

                <div className="floating-note">
                  A world between<br />every cover ✦
                </div>

                <div className="art-caption">
                  A universe of stories, just for you.
                </div>
              </div>
            </section>

            {/* Authentication */}
            {!user && (
              <section className="auth-section section-wrap" id="authentication">
                <div className="auth-card">
                  <div className="eyebrow">YOUR SHELFSENSE ACCOUNT</div>

                  <h2>
                    {authMode === 'login'
                      ? 'Welcome back.'
                      : 'Join our library.'}
                  </h2>

                  <p>
                    {authMode === 'login'
                      ? 'Log in to reserve books and manage your reading list.'
                      : 'Create an account to discover and reserve books.'}
                  </p>

                  <form onSubmit={handleAuthSubmit}>
                    {authMode === 'register' && (
                      <input
                        type="text"
                        placeholder="Full name"
                        value={authName}
                        onChange={(event) => setAuthName(event.target.value)}
                        minLength={2}
                        maxLength={150}
                        required
                      />
                    )}

                    <input
                      type="email"
                      placeholder="Email address"
                      value={authEmail}
                      onChange={(event) => setAuthEmail(event.target.value)}
                      required
                    />

                    <input
                      type="password"
                      placeholder="Password (minimum 8 characters)"
                      value={authPassword}
                      onChange={(event) => setAuthPassword(event.target.value)}
                      minLength={8}
                      required
                    />

                    <button
                      type="submit"
                      className="primary-button"
                      disabled={authLoading}
                    >
                      {authLoading
                        ? 'Please wait...'
                        : authMode === 'login'
                          ? 'Login'
                          : 'Create account'}
                    </button>
                  </form>

                  {authMessage && (
                    <p className="message" role="status">
                      {authMessage}
                    </p>
                  )}

                  <p className="auth-switch">
                    {authMode === 'login'
                      ? "Don't have an account?"
                      : 'Already have an account?'}
                    {' '}
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode(
                          authMode === 'login' ? 'register' : 'login'
                        );
                        setAuthMessage('');
                      }}
                    >
                      {authMode === 'login' ? 'Register' : 'Login'}
                    </button>
                  </p>
                </div>
              </section>
            )}

            {/* Library statistics */}
            <section className="stats-strip" aria-label="Library statistics">
              <div>
                <strong>{String(books.length).padStart(2, '0')}</strong>
                <span>Book titles</span>
              </div>
              <div>
                <strong>{String(totalCopies).padStart(2, '0')}</strong>
                <span>Total copies</span>
              </div>
              <div>
                <strong>{String(availableCopies).padStart(2, '0')}</strong>
                <span>Ready to borrow</span>
              </div>
              <div className="stats-message">
                Good books. Great discoveries. <span>✳</span>
              </div>
            </section>

            {/* Book catalog */}
            <section className="catalog section-wrap" id="catalog">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">THE COLLECTION</div>
                  <h2>
                    Stories worth <em>staying for.</em>
                  </h2>
                  <p>
                    Browse the shelves and find something that speaks to you.
                  </p>
                </div>

                <span className="collection-count">
                  {filteredBooks.length} BOOKS FOUND
                </span>
              </div>

              <div className="search-row">
                <label className="search-box">
                  <span>⌕</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search titles, authors, or topics..."
                    aria-label="Search books"
                  />

                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </label>

                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  aria-label="Filter by category"
                >
                  {categories.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              {loading && (
                <p className="message">
                  Gathering books from the library...
                </p>
              )}

              {error && (
                <p className="message error-message">{error}</p>
              )}

              {reservationMessage && (
                <div
                  className={`message ${
                    reservationMessage.startsWith('Success!')
                      ? 'success-message'
                      : 'error-message'
                  }`}
                  role="status"
                >
                  {reservationMessage}
                </div>
              )}

              {!loading && !error && filteredBooks.length > 0 && (
                <div className="book-grid">
                  {filteredBooks.map((book, index) => {
                    const available = Number(book.available_copies || 0);
                    const total = Number(book.total_copies || 0);

                    return (
                      <article className="book-card" key={book.book_id}>
                        <div className={`book-cover cover-${(index % 5) + 1}`}>
                          <span className="cover-category">
                            {book.category || 'DISCOVER'}
                          </span>

                          <div className="cover-symbol">
                            {['✳', '◒', '❧', '✦', '◎'][index % 5]}
                          </div>

                          <div className="cover-title">{book.title}</div>

                          <div className="cover-author">
                            {book.authors || 'Unknown author'}
                          </div>

                          <span className="cover-mark">S.</span>
                        </div>

                        <div className="book-details">
                          <div className="book-category">
                            {book.category || 'General'}
                          </div>

                          <h3>{book.title}</h3>

                          <p className="author-name">
                            by {book.authors || 'Unknown author'}
                          </p>

                          <div className="book-card-footer">
                            <span
                              className={`availability ${
                                available > 0 ? 'available' : 'unavailable'
                              }`}
                            >
                              <span className="status-dot" />
                              {available > 0
                                ? `${available} available`
                                : 'Currently borrowed'}
                            </span>

                            <span className="copy-count">
                              {available}/{total}
                            </span>
                          </div>

                          <button
                            type="button"
                            className="text-button"
                            disabled={
                              available <= 0 ||
                              reservingBookId === book.book_id
                            }
                            onClick={() => handleReserve(book)}
                          >
                            {reservingBookId === book.book_id
                              ? 'Reserving...'
                              : available <= 0
                                ? 'Unavailable'
                                : 'Reserve book →'}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {!loading && !error && filteredBooks.length === 0 && (
                <div className="empty-state">
                  <span>⌕</span>
                  <h3>No books found</h3>
                  <p>Try another title, author, or category.</p>

                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setSearch('');
                      setCategory('All');
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </section>

            {/* My reservations */}
            <section
              className="reservations-section section-wrap"
              id="reservations"
            >
              <div className="section-heading">
                <div>
                  <div className="eyebrow">YOUR READING LIST</div>
                  <h2>
                    My <em>reservations.</em>
                  </h2>
                  <p>Keep track of the books you have reserved.</p>
                </div>

                <span className="collection-count">
                  {myReservations.length} RESERVATIONS
                </span>
              </div>

              {!user && (
                <div className="empty-state">
                  <h3>Login to view your reservations</h3>
                  <p>
                    Your personal reading list will appear here after login.
                  </p>
                  <a className="text-button" href="#authentication">
                    Login / Register →
                  </a>
                </div>
              )}

              {user && reservationsLoading && (
                <p className="message">Loading your reservations...</p>
              )}

              {user && reservationsError && (
                <p className="message error-message">
                  {reservationsError}
                </p>
              )}

              {user &&
                !reservationsLoading &&
                !reservationsError &&
                myReservations.length === 0 && (
                  <div className="empty-state">
                    <h3>No reservations yet</h3>
                    <p>
                      Find a book you love and reserve it from the collection.
                    </p>
                    <a className="text-button" href="#catalog">
                      Explore books →
                    </a>
                  </div>
                )}

              {user &&
                !reservationsLoading &&
                !reservationsError &&
                myReservations.length > 0 && (
                  <div className="reservations-grid">
                    {myReservations.map((reservation) => (
                      <article
                        className="reservation-card"
                        key={reservation.reservation_id}
                      >
                        <div className="reservation-card-top">
                          <span className="reservation-label">
                            RESERVATION #{reservation.reservation_id}
                          </span>

                          <span
                            className={`reservation-status status-${String(
                              reservation.status || 'pending'
                            ).toLowerCase()}`}
                          >
                            {reservation.status || 'Pending'}
                          </span>
                        </div>

                        <h3>
                          {reservation.book_title ||
                            reservation.title ||
                            'Book title unavailable'}
                        </h3>

                        {reservation.category && (
                          <span className="reservation-category">
                            {reservation.category}
                          </span>
                        )}

                        <div className="reservation-meta">
                          Reserved on:{' '}
                          {reservation.reserved_at
                            ? new Date(
                                reservation.reserved_at
                              ).toLocaleDateString()
                            : 'Date unavailable'}
                        </div>

                        {String(
                          reservation.status || 'pending'
                        ).toLowerCase() === 'pending' && (
                          <div className="reservation-actions">
                            <button
                              type="button"
                              className="text-button"
                              disabled={
                                cancellingReservationId ===
                                  reservation.reservation_id ||
                                returningReservationId ===
                                  reservation.reservation_id
                              }
                              onClick={() =>
                                handleCancelReservation(reservation)
                              }
                            >
                              {cancellingReservationId ===
                              reservation.reservation_id
                                ? 'Cancelling...'
                                : 'Cancel reservation'}
                            </button>

                            <button
                              type="button"
                              className="text-button"
                              disabled={
                                cancellingReservationId ===
                                  reservation.reservation_id ||
                                returningReservationId ===
                                  reservation.reservation_id
                              }
                              onClick={() =>
                                handleReturnReservation(reservation)
                              }
                            >
                              {returningReservationId ===
                              reservation.reservation_id
                                ? 'Returning...'
                                : 'Return book'}
                            </button>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
            </section>

            {/* How it works */}
            <section className="how-section" id="how-it-works">
              <div className="section-wrap">
                <div className="eyebrow">SIMPLE BY DESIGN</div>

                <h2>
                  Your reading journey, <em>made easy.</em>
                </h2>

                <p className="how-intro">
                  Three little steps between you and your next favourite book.
                </p>

                <div className="steps-grid">
                  <article className="step-card">
                    <span className="step-number">01</span>
                    <div className="step-icon">⌕</div>
                    <h3>Find your book</h3>
                    <p>
                      Search by title, author, or category and explore our
                      collection.
                    </p>
                  </article>

                  <article className="step-card">
                    <span className="step-number">02</span>
                    <div className="step-icon">↗</div>
                    <h3>Check availability</h3>
                    <p>
                      See how many copies are available before planning your
                      next read.
                    </p>
                  </article>

                  <article className="step-card">
                    <span className="step-number">03</span>
                    <div className="step-icon">✳</div>
                    <h3>Start reading</h3>
                    <p>
                      Reserve an available copy and keep track of your
                      reservation.
                    </p>
                  </article>
                </div>
              </div>
            </section>

            {/* Recommendation */}
            <section className="recommend-section section-wrap">
              <div>
                <div className="eyebrow">
                  A SMALL NUDGE OF INSPIRATION
                </div>
                <h2>Not sure what to read next?</h2>
                <p>
                  Try a different category. Your next favourite story might
                  surprise you.
                </p>
              </div>

              <a className="primary-button" href="#catalog">
                Find your next read ↗
              </a>
            </section>
          </>
        )}
      </main>

      <footer className="footer">
        <a
          className="brand"
          href="#home"
          onClick={() => setActiveView('home')}
        >
          <span className="brand-icon">S</span>
          <span>
            ShelfSense<span className="brand-dot">.</span>
          </span>
        </a>

        <p>Made for curious minds and lifelong readers.</p>
        <span>© 2026 ShelfSense Library</span>
      </footer>
    </div>
  );
}

export default App;