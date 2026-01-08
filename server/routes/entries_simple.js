
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ 
    message: 'entries API (simple stub)',
    endpoint: '/api/entries',
    status: 'working'
  });
});

router.post('/', (req, res) => {
  res.status(201).json({ 
    message: 'entries created (stub)',
    data: req.body,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
