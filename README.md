# CivicFix Backend

Node.js + Express backend for the CivicFix mobile app. Provides authentication, role-based access control, and civic issue reporting APIs backed by PostgreSQL/PostGIS.

## Prerequisites

- Node.js 18+
- PostgreSQL with PostGIS extension (`CREATE EXTENSION postgis;`)
- npm

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a PostgreSQL database (e.g. `civicfix_db`) and enable PostGIS if desired.
3. Copy `.env` and update values:
   ```
   PORT=5000
   DATABASE_URL=postgres://postgres:yourpassword@localhost:5432/civicfix_db
   JWT_SECRET=your_jwt_secret
   ```
4. Run database migrations (Sequelize sync is automatic on boot).
5. Start the development server:
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:5000`.

## Key Scripts

- `npm start` – start server in production mode.
- `npm run dev` – run with hot reload (nodemon).
- `npm run format` – format code with Prettier.
- `npm run tunnel` – start localtunnel to expose the backend publicly.
- `npm run dev:tunnel` – run both the server and tunnel simultaneously.
- `npm run view-users` – view all registered users in the database.
- `npm run test:connection` – test API connection to backend server.

## Using Localtunnel (for Mobile Development)

To expose your local backend to the internet (for testing with mobile devices):

1. **Install dependencies** (if not already done):
   ```bash
   npm install
   ```

2. **Start the backend server** (in one terminal):
   ```bash
   npm run dev
   ```

3. **Start the tunnel** (in another terminal):
   ```bash
   npm run tunnel
   ```

   This will create a public URL like `https://civicfixapp.loca.lt` pointing to your local server on port 5000.

4. **Update your mobile app** with the tunnel URL:
   - Set environment variable: `EXPO_PUBLIC_API_URL=https://civicfixapp.loca.lt`
   - Or update `mobile/src/utils/api.js` with the tunnel URL shown in the terminal

5. **Optional: Run both together**:
   ```bash
   npm run dev:tunnel
   ```

**Note**: The tunnel URL will be displayed in the terminal. Make sure to use the exact URL shown (it may vary if the subdomain is taken).

**Troubleshooting**:
- If the subdomain is taken, you can set a custom one in `.env`: `TUNNEL_SUBDOMAIN=your-unique-name`
- Or remove `TUNNEL_SUBDOMAIN` from `.env` to get a random subdomain
- Keep the tunnel process running while testing your mobile app
- The tunnel URL is temporary and will change if you restart the tunnel

## Project Structure

```
backend/
├── server.js
├── src
│   ├── config
│   │   └── db.js
│   ├── controllers
│   │   ├── authController.js
│   │   └── issueController.js
│   ├── middleware
│   │   ├── authMiddleware.js
│   │   └── errorHandler.js
│   ├── models
│   │   ├── Issue.js
│   │   ├── User.js
│   │   └── index.js
│   ├── routes
│   │   ├── authRoutes.js
│   │   └── issueRoutes.js
│   └── utils
│       └── catchAsync.js
├── .env
├── .gitignore
├── .prettierrc
├── package.json
└── README.md
```

## Authentication & Authorization

- `/api/auth/register` – citizen sign-up (email, password, name). Returns JWT.
- `/api/auth/login` – authenticate existing users.
- `/api/auth/users` – get all users (admin only, requires authentication).
- JWT payload includes `userId` and `role`.
- `Authorization: Bearer <token>` header required for protected routes.
- Staff/Admin roles must be provisioned manually (e.g. direct DB update) for now.

## Viewing Registered Users

To view all registered users, you can:

1. **Use the view-users script** (recommended):
   ```bash
   npm run view-users
   ```

2. **Query the database directly** using `psql`

3. **Use the admin API endpoint** (requires admin token):
   ```bash
   GET /api/auth/users
   Authorization: Bearer <admin_token>
   ```

See `VIEW_USERS.md` for detailed instructions.

## Issue APIs

- `POST /api/issues` – authenticated citizens create issues.
- `GET /api/issues` – list all issues.
- `GET /api/issues/:id` – fetch single issue.
- `PUT /api/issues/:id` – staff/admin update issue details.
- `DELETE /api/issues/:id` – admin remove issue.

Each issue stores latitude/longitude and supports status transitions: `Open`, `In Progress`, `Resolved`.

## Health Check

- `GET /health` – simple uptime probe.

## Next Steps

- Add migrations and seeders.
- Integrate email verification and password reset.
- Connect with Firebase Cloud Messaging for notifications.

