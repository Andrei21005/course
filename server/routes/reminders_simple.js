
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ 
    message: 'reminders API (simple stub)',
    endpoint: '/api/reminders',
    status: 'working'
  });
});

router.post('/', (req, res) => {
  res.status(201).json({ 
    message: 'reminders created (stub)',
    data: req.body,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
