
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ 
    message: 'goals API (simple stub)',
    endpoint: '/api/goals',
    status: 'working'
  });
});

router.post('/', (req, res) => {
  res.status(201).json({ 
    message: 'goals created (stub)',
    data: req.body,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
