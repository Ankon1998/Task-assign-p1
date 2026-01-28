// server.js - Backend API Server
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize SQLite Database
const db = new sqlite3.Database('./taskflow.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

// Create tables
function initializeDatabase() {
  db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tasks table
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      link TEXT NOT NULL,
      assigned_to TEXT NOT NULL,
      created_by TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      approved_at DATETIME,
      FOREIGN KEY (assigned_to) REFERENCES users(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`);

    // Errors table
    db.run(`CREATE TABLE IF NOT EXISTS errors (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      description TEXT NOT NULL,
      reported_by TEXT NOT NULL,
      reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id),
      FOREIGN KEY (reported_by) REFERENCES users(id)
    )`);

    // Insert default users if not exists
    const defaultPassword = bcrypt.hashSync('admin123', 10);
    const workerPassword = bcrypt.hashSync('worker123', 10);

    db.run(`INSERT OR IGNORE INTO users (id, email, password, name, role) VALUES 
      ('admin1', 'admin@example.com', ?, 'Admin User', 'admin')`,
      [defaultPassword]
    );

    db.run(`INSERT OR IGNORE INTO users (id, email, password, name, role) VALUES 
      ('worker1', 'worker@example.com', ?, 'Worker One', 'worker')`,
      [workerPassword]
    );

    db.run(`INSERT OR IGNORE INTO users (id, email, password, name, role) VALUES 
      ('worker2', 'worker2@example.com', ?, 'Worker Two', 'worker')`,
      [workerPassword]
    );

    console.log('Database initialized successfully');
  });
}

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// ==================== AUTH ROUTES ====================

// Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err || !isMatch) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      });
    });
  });
});

// Register new user (admin only)
app.post('/api/auth/register', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { email, password, name, role } = req.body;

  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: 'All fields required' });
  }

  const id = 'user_' + Date.now();
  const hashedPassword = bcrypt.hashSync(password, 10);

  db.run(
    'INSERT INTO users (id, email, password, name, role) VALUES (?, ?, ?, ?, ?)',
    [id, email, hashedPassword, name, role],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ error: 'Email already exists' });
        }
        return res.status(500).json({ error: 'Database error' });
      }

      res.json({
        message: 'User created successfully',
        user: { id, email, name, role }
      });
    }
  );
});

// ==================== USER ROUTES ====================

// Get all users
app.get('/api/users', authenticateToken, (req, res) => {
  db.all('SELECT id, email, name, role, created_at FROM users', [], (err, users) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(users);
  });
});

// Get workers only
app.get('/api/users/workers', authenticateToken, (req, res) => {
  db.all(
    'SELECT id, email, name, role, created_at FROM users WHERE role = ?',
    ['worker'],
    (err, workers) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(workers);
    }
  );
});

// ==================== TASK ROUTES ====================

// Get all tasks (with filters)
app.get('/api/tasks', authenticateToken, (req, res) => {
  const { worker, month, year, search } = req.query;
  let query = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];

  // Filter by worker
  if (worker && worker !== 'all') {
    query += ' AND assigned_to = ?';
    params.push(worker);
  }

  // Filter by user's own tasks if worker
  if (req.user.role === 'worker') {
    query += ' AND assigned_to = ?';
    params.push(req.user.id);
  }

  // Add ordering
  query += ' ORDER BY created_at DESC';

  db.all(query, params, (err, tasks) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    // Get errors for each task
    const taskIds = tasks.map(t => t.id);
    if (taskIds.length === 0) {
      return res.json([]);
    }

    const placeholders = taskIds.map(() => '?').join(',');
    db.all(
      `SELECT * FROM errors WHERE task_id IN (${placeholders})`,
      taskIds,
      (err, errors) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        // Group errors by task_id
        const errorsByTask = {};
        errors.forEach(error => {
          if (!errorsByTask[error.task_id]) {
            errorsByTask[error.task_id] = [];
          }
          errorsByTask[error.task_id].push(error);
        });

        // Attach errors to tasks
        const tasksWithErrors = tasks.map(task => ({
          ...task,
          errors: errorsByTask[task.id] || []
        }));

        // Apply client-side filters (month, year, search)
        let filtered = tasksWithErrors;

        if (month || year) {
          filtered = filtered.filter(task => {
            const taskDate = new Date(task.created_at);
            const matchMonth = !month || taskDate.getMonth() === parseInt(month);
            const matchYear = !year || taskDate.getFullYear() === parseInt(year);
            return matchMonth && matchYear;
          });
        }

        if (search) {
          const searchLower = search.toLowerCase();
          filtered = filtered.filter(task => 
            task.title.toLowerCase().includes(searchLower) ||
            (task.description && task.description.toLowerCase().includes(searchLower))
          );
        }

        res.json(filtered);
      }
    );
  });
});

// Create task (admin only)
app.post('/api/tasks', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { title, description, link, assignedTo } = req.body;

  if (!title || !link || !assignedTo) {
    return res.status(400).json({ error: 'Title, link, and assignedTo are required' });
  }

  const id = 'task_' + Date.now();
  const createdBy = req.user.id;

  db.run(
    `INSERT INTO tasks (id, title, description, link, assigned_to, created_by, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [id, title, description || '', link, assignedTo, createdBy],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, task) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        res.json({ ...task, errors: [] });
      });
    }
  );
});

// Update task status
app.patch('/api/tasks/:id/status', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['pending', 'completed', 'approved'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  // Workers can only mark their own tasks as completed
  if (req.user.role === 'worker' && status !== 'completed') {
    return res.status(403).json({ error: 'Workers can only mark tasks as completed' });
  }

  // Admins can approve tasks
  if (status === 'approved' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can approve tasks' });
  }

  const timestamp = new Date().toISOString();
  let query = 'UPDATE tasks SET status = ?';
  const params = [status];

  if (status === 'completed') {
    query += ', completed_at = ?';
    params.push(timestamp);
  } else if (status === 'approved') {
    query += ', approved_at = ?';
    params.push(timestamp);
  }

  query += ' WHERE id = ?';
  params.push(id);

  // If worker, ensure they can only update their own tasks
  if (req.user.role === 'worker') {
    query += ' AND assigned_to = ?';
    params.push(req.user.id);
  }

  db.run(query, params, function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Task not found or unauthorized' });
    }

    db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, task) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(task);
    });
  });
});

// ==================== ERROR ROUTES ====================

// Add error to task (admin only)
app.post('/api/tasks/:id/errors', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { id: taskId } = req.params;
  const { description } = req.body;

  if (!description) {
    return res.status(400).json({ error: 'Error description required' });
  }

  const errorId = 'error_' + Date.now();
  const reportedBy = req.user.id;

  db.run(
    'INSERT INTO errors (id, task_id, description, reported_by) VALUES (?, ?, ?, ?)',
    [errorId, taskId, description, reportedBy],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      db.get('SELECT * FROM errors WHERE id = ?', [errorId], (err, error) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        res.json(error);
      });
    }
  );
});

// Get errors for a task
app.get('/api/tasks/:id/errors', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.all('SELECT * FROM errors WHERE task_id = ?', [id], (err, errors) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(errors);
  });
});

// ==================== STATS ROUTES ====================

// Get statistics
app.get('/api/stats', authenticateToken, (req, res) => {
  const { worker, month, year } = req.query;

  let query = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];

  if (worker && worker !== 'all') {
    query += ' AND assigned_to = ?';
    params.push(worker);
  }

  if (req.user.role === 'worker') {
    query += ' AND assigned_to = ?';
    params.push(req.user.id);
  }

  db.all(query, params, (err, tasks) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    // Apply date filters
    let filtered = tasks;
    if (month || year) {
      filtered = filtered.filter(task => {
        const taskDate = new Date(task.created_at);
        const matchMonth = !month || taskDate.getMonth() === parseInt(month);
        const matchYear = !year || taskDate.getFullYear() === parseInt(year);
        return matchMonth && matchYear;
      });
    }

    const total = filtered.length;
    const completed = filtered.filter(t => t.status === 'completed' || t.status === 'approved').length;
    const approved = filtered.filter(t => t.status === 'approved').length;
    const pending = filtered.filter(t => t.status === 'pending').length;

    // Get error count
    const taskIds = filtered.map(t => t.id);
    if (taskIds.length === 0) {
      return res.json({
        total: 0,
        completed: 0,
        approved: 0,
        pending: 0,
        errors: 0,
        successRate: 0
      });
    }

    const placeholders = taskIds.map(() => '?').join(',');
    db.get(
      `SELECT COUNT(*) as errorCount FROM errors WHERE task_id IN (${placeholders})`,
      taskIds,
      (err, result) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        res.json({
          total,
          completed,
          approved,
          pending,
          errors: result.errorCount,
          successRate: total > 0 ? Math.round((completed / total) * 100) : 0
        });
      }
    );
  });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the app at http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Database connection closed');
    }
    process.exit(0);
  });
});
