# 🎯 Habit Tracker - Full Stack Application

A comprehensive habit tracking application with Node.js backend, MongoDB database, and JWT authentication.

## Features

### Backend
- ✅ RESTful API with Express.js
- ✅ MongoDB database with Mongoose ODM
- ✅ JWT-based authentication
- ✅ Password hashing with bcrypt
- ✅ Input validation
- ✅ User-specific data isolation
- ✅ CORS enabled

### Frontend
- ✅ User authentication (login/signup)
- ✅ Category-based habit organization
- ✅ 28-day calendar view
- ✅ Streak tracking
- ✅ Real-time statistics
- ✅ Progress visualization
- ✅ Responsive design

## Tech Stack

**Backend:**
- Node.js
- Express.js
- MongoDB
- Mongoose
- JWT (jsonwebtoken)
- bcryptjs
- express-validator

**Frontend:**
- HTML5
- CSS3
- Vanilla JavaScript
- Fetch API

## Installation

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or Atlas)

### Setup

1. **Clone the repository**
```bash
git clone https://github.com/diku9719/habit-tracker-fullstack.git
cd habit-tracker-fullstack
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
```

Edit `.env` file:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/habit-tracker
JWT_SECRET=your_secure_jwt_secret_key
NODE_ENV=development
```

4. **Start MongoDB**
```bash
# If using local MongoDB
mongod
```

5. **Run the application**
```bash
# Development mode with nodemon
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:5000`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (protected)

### Habits
- `GET /api/habits` - Get all user habits (protected)
- `GET /api/habits/:id` - Get single habit (protected)
- `POST /api/habits` - Create new habit (protected)
- `PUT /api/habits/:id` - Update habit (protected)
- `DELETE /api/habits/:id` - Delete habit (protected)
- `POST /api/habits/:id/complete` - Toggle habit completion (protected)
- `GET /api/habits/stats/summary` - Get user statistics (protected)

### Health Check
- `GET /api/health` - API health status

## API Usage Examples

### Register User
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com",
    "password": "password123",
    "displayName": "John Doe"
  }'
```

### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "password": "password123"
  }'
```

### Create Habit
```bash
curl -X POST http://localhost:5000/api/habits \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Morning Exercise",
    "category": "health",
    "frequency": "daily",
    "color": "#667eea"
  }'
```

### Toggle Completion
```bash
curl -X POST http://localhost:5000/api/habits/HABIT_ID/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "date": "2025-11-30"
  }'
```

## Database Schema

### User Model
```javascript
{
  username: String (unique, required),
  email: String (unique, required),
  password: String (hashed, required),
  displayName: String (required),
  createdAt: Date
}
```

### Habit Model
```javascript
{
  userId: ObjectId (ref: User),
  name: String (required),
  category: String (enum),
  frequency: String (enum),
  color: String,
  completions: [String], // Array of dates
  createdAt: Date,
  updatedAt: Date
}
```

## Deployment

### Deploy to Heroku
```bash
heroku create your-app-name
heroku config:set MONGODB_URI=your_mongodb_uri
heroku config:set JWT_SECRET=your_jwt_secret
git push heroku main
```

### Deploy to Railway
1. Connect your GitHub repository
2. Add environment variables
3. Deploy automatically

### Deploy to Render
1. Create new Web Service
2. Connect repository
3. Add environment variables
4. Deploy

## Frontend Integration

Open `public/index.html` in a browser or serve it with:
```bash
npx serve public
```

Update the API URL in the frontend:
```javascript
const API_URL = 'http://localhost:5000/api';
```

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- Protected routes with middleware
- Input validation
- CORS configuration
- Environment variable protection

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

MIT License - feel free to use this project for learning or production!

## Author

**tkdnaina**

## Support

For issues or questions, please open an issue on GitHub.

---

Built with ❤️ using Node.js, Express, and MongoDB
