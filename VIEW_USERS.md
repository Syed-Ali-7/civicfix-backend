# Viewing Registered Users

After users sign up through your mobile app, their data is stored in the PostgreSQL database. Here are several ways to view the registered users:

## Method 1: Using the View Users Script (Easiest)

The easiest way to view all registered users is using the provided script:

```bash
cd backend
npm run view-users
```

This will display:
- User ID (UUID)
- Name
- Email
- Role (citizen, staff, or admin)
- Created date
- Updated date

**Example output:**
```
✅ Connected to database

📊 Found 3 user(s):

════════════════════════════════════════════════════════════════════════════════

👤 User #1
────────────────────────────────────────────────────────────────────────────────
   ID:        a1b2c3d4-e5f6-7890-abcd-ef1234567890
   Name:      John Doe
   Email:     john@example.com
   Role:      citizen
   Created:   2024-01-15 10:30:00
   Updated:   2024-01-15 10:30:00

...
```

## Method 2: Using PostgreSQL Directly

You can also query the database directly using `psql`:

```bash
# Connect to your database
psql -d your_database_name

# Or using the connection string from .env
psql postgres://postgres:password@localhost:5432/civicfix_db
```

Then run SQL queries:

```sql
-- View all users (without passwords)
SELECT id, name, email, role, created_at, updated_at 
FROM users 
ORDER BY created_at DESC;

-- Count total users
SELECT COUNT(*) FROM users;

-- View users by role
SELECT name, email, role FROM users WHERE role = 'citizen';

-- View latest registered users
SELECT name, email, created_at 
FROM users 
ORDER BY created_at DESC 
LIMIT 10;
```

## Method 3: Using Admin API Endpoint (Requires Admin Token)

If you have an admin user, you can use the API endpoint:

```bash
# First, login as admin to get a token
curl -X POST https://your-api-url/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "admin_password"}'

# Use the token to get users list
curl -X GET https://your-api-url/api/auth/users \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Note:** This endpoint requires:
- Valid authentication token
- Admin role

## Method 4: Using Database GUI Tools

You can use GUI tools like:
- **pgAdmin** (PostgreSQL admin tool)
- **DBeaver** (Universal database tool)
- **TablePlus** (Modern database client)
- **DataGrip** (JetBrains database IDE)

Connect using your `DATABASE_URL` from `.env` and browse the `users` table.

## Database Schema

The `users` table structure:

| Column      | Type     | Description                    |
|-------------|----------|--------------------------------|
| id          | UUID     | Unique user identifier         |
| name        | STRING   | User's full name               |
| email       | STRING   | User's email (unique)          |
| password    | STRING   | Hashed password (bcrypt)       |
| role        | ENUM     | User role (citizen/staff/admin)|
| created_at  | TIMESTAMP| Account creation date          |
| updated_at  | TIMESTAMP| Last update date               |

## Security Notes

⚠️ **Important:**
- Passwords are stored as hashed values (bcrypt) - you cannot see original passwords
- The view-users script does NOT show passwords (for security)
- Admin API endpoint requires authentication and admin role
- Always protect database credentials in `.env` file

## Troubleshooting

### Script won't run
- Make sure database is running
- Check `DATABASE_URL` in `.env` is correct
- Ensure backend has connected to database at least once (to create tables)

### No users found
- Verify users have successfully signed up
- Check database connection
- Verify you're connecting to the correct database

### Permission errors
- Check database user has SELECT permissions
- Verify `.env` credentials are correct

## Quick Commands Reference

```bash
# View users
npm run view-users

# View users with details
npm run view-users

# Connect to database
psql -d your_database_name

# Count users (in psql)
SELECT COUNT(*) FROM users;
```

