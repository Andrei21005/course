
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ 
    message: 'admin API (simple stub)',
    endpoint: '/api/admin',
    status: 'working'
  });
});

router.post('/', (req, res) => {
  res.status(201).json({ 
    message: 'admin created (stub)',
    data: req.body,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
