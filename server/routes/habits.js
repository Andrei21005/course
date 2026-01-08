const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Habit = require('../models/Habit');
const auth = require('../middleware/auth');

// @route   GET /api/habits
// @desc    Get all habits for logged-in user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const habits = await Habit.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(habits);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/habits/:id
// @desc    Get single habit by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const habit = await Habit.findOne({ _id: req.params.id, userId: req.user.id });
    
    if (!habit) {
      return res.status(404).json({ error: 'Habit not found' });
    }

    res.json(habit);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ error: 'Habit not found' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/habits
// @desc    Create a new habit
// @access  Private
router.post('/', [
  auth,
  body('name').trim().notEmpty().withMessage('Habit name is required'),
  body('category').isIn(['health', 'productivity', 'learning', 'mindfulness', 'social', 'finance', 'creativity', 'other']).withMessage('Invalid category'),
  body('frequency').isIn(['daily', 'weekly', 'custom']).withMessage('Invalid frequency'),
  body('color').notEmpty().withMessage('Color is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, category, frequency, color } = req.body;

  try {
    const habit = new Habit({
      userId: req.user.id,
      name,
      category,
      frequency,
      color,
      completions: []
    });

    await habit.save();
    res.json(habit);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/habits/:id
// @desc    Update a habit
// @access  Private
router.put('/:id', auth, async (req, res) => {
  const { name, category, frequency, color } = req.body;

  try {
    let habit = await Habit.findOne({ _id: req.params.id, userId: req.user.id });

    if (!habit) {
      return res.status(404).json({ error: 'Habit not found' });
    }

    // Update fields
    if (name) habit.name = name;
    if (category) habit.category = category;
    if (frequency) habit.frequency = frequency;
    if (color) habit.color = color;

    await habit.save();
    res.json(habit);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ error: 'Habit not found' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/habits/:id
// @desc    Delete a habit
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const habit = await Habit.findOneAndDelete({ _id: req.params.id, userId: req.user.id });

    if (!habit) {
      return res.status(404).json({ error: 'Habit not found' });
    }

    res.json({ message: 'Habit deleted successfully' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ error: 'Habit not found' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/habits/:id/complete
// @desc    Toggle habit completion for a date
// @access  Private
router.post('/:id/complete', [
  auth,
  body('date').isISO8601().withMessage('Valid date is required (YYYY-MM-DD)')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { date } = req.body;

  try {
    const habit = await Habit.findOne({ _id: req.params.id, userId: req.user.id });

    if (!habit) {
      return res.status(404).json({ error: 'Habit not found' });
    }

    // Check if date is already completed
    const index = habit.completions.indexOf(date);
    
    if (index > -1) {
      // Remove completion
      habit.completions.splice(index, 1);
    } else {
      // Add completion
      habit.completions.push(date);
    }

    await habit.save();
    res.json(habit);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ error: 'Habit not found' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/habits/stats/summary
// @desc    Get user's habit statistics
// @access  Private
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const habits = await Habit.find({ userId: req.user.id });
    const today = new Date().toISOString().split('T')[0];

    const stats = {
      totalHabits: habits.length,
      completedToday: habits.filter(h => h.completions.includes(today)).length,
      totalCompletions: habits.reduce((sum, h) => sum + h.completions.length, 0),
      categoryCounts: {}
    };

    // Count habits by category
    habits.forEach(habit => {
      stats.categoryCounts[habit.category] = (stats.categoryCounts[habit.category] || 0) + 1;
    });

    res.json(stats);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
