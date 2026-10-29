# ShelfSense Library

ShelfSense Library is a web-based library management application that allows users to browse books, search the catalog, filter by category, reserve books, cancel reservations, and return books.

## Features

- Browse the book catalog
- Search for books and filter by category
- View book availability
- Reserve books
- View personal reservations
- Cancel pending reservations
- Return reserved books
- Update book availability in the database

## Technology Stack

- **Frontend:** React, Vite
- **Backend:** Node.js, Express.js
- **Database:** MySQL
- **API communication:** Fetch API

## Project Structure

```text
ShelfSense-Library/
├── frontend/
├── backend/
├── .gitignore
└── README.md
```

## Prerequisites

Install the following before running the project:

- Node.js and npm
- MySQL Server
- Git

## Setup Instructions

### 1. Clone the repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd ShelfSense-Library
```

### 2. Configure the database

Create a MySQL database named `shelfsense_library`.

Run the project's database schema and sample-data SQL scripts if they are included in the repository.

Configure the database connection using environment variables as required by the backend.

### 3. Install and start the backend

```bash
cd backend
npm install
npm start
```

### 4. Install and start the frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL displayed by Vite in your terminal.

## Current Status

The core book catalog, reservation, cancellation, and return workflows have been implemented and tested.

## Future Enhancements

- User registration and authentication
- Admin dashboard
- Due-date and overdue tracking
- Library reports and analytics

## Author

Add your name and GitHub profile here.
