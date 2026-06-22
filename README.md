# Velix Backend

Accounts + sync API for Velix. Node + Express + PostgreSQL.

## What's built so far
- **Accounts:** register, login, logout, `/me`
- Password hashing (bcrypt), JWT tokens persisted in `sessions` (revocable)
- Rate limiting on auth endpoints
- Full DB schema (users, sessions, pairings, favorites, continue_watching) — pairing + sync endpoints come next

## Endpoints (live now)
```
GET  /                  health
POST /auth/register     {email, username, password, device_name?} -> {token, user}
POST /auth/login        {email, password, device_name?}           -> {token, user}
POST /auth/logout       (Bearer)                                   -> {ok}
GET  /auth/me           (Bearer)                                   -> {user}
```
Auth: send `Authorization: Bearer <token>` on protected routes.

## Deploy to Railway
1. Push this folder to a GitHub repo.
2. In Railway: **New Project → Deploy from GitHub repo** → pick it.
3. **Add a Postgres** plugin to the project (Railway sets `DATABASE_URL` automatically).
4. Add a variable **`JWT_SECRET`** = a long random string (`openssl rand -hex 32`).
5. Deploy. Migrations run automatically on boot.

Your API base URL will be something like `https://velix-backend-production.up.railway.app`.

## Run locally
```bash
npm install
cp .env.example .env      # then edit DATABASE_URL + JWT_SECRET
npm run migrate           # create tables
npm run dev               # starts on :8080
```

## Quick test (after deploy or locally)
```bash
# Register
curl -X POST $BASE/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","username":"Pita","password":"supersecret"}'

# Login
curl -X POST $BASE/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"supersecret"}'

# Me (use the token from above)
curl $BASE/auth/me -H "Authorization: Bearer <token>"
```

## Next steps
- **Pairing/QR flow** — `/pair/start`, `/pair/status`, `/pair/claim` + the phone signup web page
- **Sync** — `/favorites` and `/continue` read/write
- **App wiring** — `AuthManager` on the TV, favorites/CW read/write the API when logged in
