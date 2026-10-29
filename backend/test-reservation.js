
async function testReservation() {
  try {
    const response = await fetch(
      'http://localhost:5000/api/reservations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: 1,
          book_id: 1
        })
      }
    );

    const data = await response.json();

    console.log('HTTP Status:', response.status);
    console.log('Response:', data);
  } catch (error) {
    console.error('Request failed:', error.message);
  }
}

testReservation();
