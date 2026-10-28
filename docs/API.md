# Student Helper REST API

Base URL: `http://<server>:3000/api`. All bodies and responses are JSON.
Errors look like `{ "error": "message" }` with a 4xx/5xx status.

**Login token:** `POST /auth/login` returns `{ token, user }`. Send the token on every other request:
`Authorization: Bearer <token>` (valid 30 days).

Dates are `YYYY-MM-DD`, times are `HH:MM` (24h), week days are numbers `0=Sun ... 6=Sat`.

## Auth
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/register` | `{ username, email, password, display_name }` | `{ token, user }` |
| POST | `/auth/login` | `{ login, password }` (login = username or email) | `{ token, user }` |
| GET | `/auth/me` | | `{ user }` |

## Routine
| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/routine` | | `{ tasks: [...] }` |
| POST | `/routine/tasks` | `{ title, category, days:[1,2], start_time, end_time, priority:'normal'\|'high', notes }` | task |
| PUT | `/routine/tasks/:id` | same as POST | task |
| DELETE | `/routine/tasks/:id` | | `{ ok }` (soft delete, history is kept) |
| POST | `/routine/import` | `{ tasks:[...], replace:boolean }` | `{ imported, tasks }` |

`category` is one of `study, work, exercise, personal, break, other`.

## Today (check-in and points)
| Method | Path | Returns |
|---|---|---|
| GET | `/today` or `/today?date=YYYY-MM-DD` | day plan (below) |
| POST | `/today/:taskId/checkin` | day plan |
| POST | `/today/:taskId/complete` | day plan |

Day plan: `{ date, checkin_window_minutes, total_possible, earned, tasks:[{ id, title, category, start_time, end_time, priority, points, status, points_earned, checked_in_at, completed_at, checkin_opens_at, checkin_closes_at }] }`

`status` is `upcoming | checkin_open | in_progress | done | missed`. A mobile app can schedule a local alarm at `checkin_opens_at` for every task with `priority: 'high'`.

## Important tasks & events
`GET /events?from=&to=` · `POST /events` · `PUT /events/:id` · `DELETE /events/:id`
Body: `{ title, description, kind:'task'|'event', event_date, event_time, is_important, is_done }`

## Goals
`GET /goals` · `POST /goals` · `PUT /goals/:id` · `DELETE /goals/:id` · `POST /goals/:id/progress { amount, note }`
Body: `{ title, period:'daily'|'weekly'|'once', target_value, unit, auto_study, deadline, is_public }`
Each goal comes back with `progress`, `percent` and `is_done` for the current period.

## Users & profiles
| Method | Path | Notes |
|---|---|---|
| GET | `/users/search?q=` | includes `follow_status` |
| GET | `/users/:username` | profile; `locked:true` hides stats/routine/goals for private profiles |
| PUT | `/users/me` | `{ display_name, bio, school, accent_color, is_private }` |
| POST | `/users/me/avatar` | multipart form, field `avatar` (JPEG/PNG/WEBP, max 1 MB) |
| GET | `/avatars/:userId` | profile picture (public, no token). `avatar_url` values are relative, so prefix them with the server address in the app |
| PUT | `/users/me/password` | `{ current_password, new_password }` |

## Social
`POST /social/follow/:userId` (→ `pending` for private profiles) · `DELETE /social/follow/:userId`
`GET /social/requests` · `POST /social/requests/:userId/accept` · `POST /social/requests/:userId/decline`
`GET /social/followers` · `GET /social/following` · `GET /social/feed`

## Chat (encrypted at rest)
`GET /chat/conversations` · `GET /chat/unread-count`
`GET /chat/:userId?after=<lastMessageId>` (poll for new messages) · `POST /chat/:userId { text }`
You can message someone when at least one of you follows the other.

## Reports
`GET /reports?days=7|30|90` → `{ summary, daily, categories, parts_of_day, weekdays, tasks, goals, insights, life_impact }`
