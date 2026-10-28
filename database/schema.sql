-- =====================================================================
--  Student Helper - MySQL database schema
--  The website and the future mobile app both use this same database
--  (through the same REST API in /server).
--
--  You can run this file by hand in MySQL Workbench / phpMyAdmin,
--  or just run `npm run db:setup` inside the /server folder.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS student_helper
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE student_helper;

-- ---------------------------------------------------------------------
-- 1. USERS  (every student has their own account)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(30)  NOT NULL UNIQUE,          -- used in profile links
  email         VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,                 -- bcrypt hash, never the real password
  display_name  VARCHAR(60)  NOT NULL,
  bio           VARCHAR(280) DEFAULT '',
  school        VARCHAR(100) DEFAULT '',
  avatar_url    VARCHAR(255) DEFAULT NULL,
  accent_color  VARCHAR(7)   DEFAULT '#4f7a6a',        -- profile customization
  is_private    TINYINT(1)   NOT NULL DEFAULT 0,       -- 1 = locked profile
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 2. ROUTINE TASKS  (the weekly routine)
--    "days" holds week days as a comma list: 0=Sun,1=Mon ... 6=Sat
--    e.g. '1,2,3,4,5' = Monday to Friday
--    priority 'high' tasks are the ones that ring an alarm.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS routine_tasks (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  title       VARCHAR(100) NOT NULL,
  category    ENUM('study','work','exercise','personal','break','other') NOT NULL DEFAULT 'study',
  days        VARCHAR(20)  NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  priority    ENUM('normal','high') NOT NULL DEFAULT 'normal',
  notes       VARCHAR(255) DEFAULT '',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at  DATETIME DEFAULT NULL,                   -- "soft delete": keeps old points/reports correct
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX (user_id)
);

-- ---------------------------------------------------------------------
-- 3. TASK LOGS  (one row per task per day when the student checks in)
--    points_earned is only set when the task is completed AND the
--    student checked in inside the check-in window.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_logs (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        INT UNSIGNED NOT NULL,
  task_id        INT UNSIGNED NOT NULL,
  log_date       DATE NOT NULL,
  checked_in_at  DATETIME DEFAULT NULL,
  completed_at   DATETIME DEFAULT NULL,
  points_earned  INT NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES routine_tasks(id) ON DELETE CASCADE,
  UNIQUE KEY one_log_per_day (task_id, log_date),
  INDEX (user_id, log_date)
);

-- ---------------------------------------------------------------------
-- 4. IMPORTANT TASKS & EVENTS  (exams, deadlines, birthdays ...)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  title        VARCHAR(120) NOT NULL,
  description  VARCHAR(500) DEFAULT '',
  kind         ENUM('task','event') NOT NULL DEFAULT 'task',
  event_date   DATE NOT NULL,
  event_time   TIME DEFAULT NULL,
  is_important TINYINT(1) NOT NULL DEFAULT 1,
  is_done      TINYINT(1) NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX (user_id, event_date)
);

-- ---------------------------------------------------------------------
-- 5. GOALS  (daily / weekly study goals or one-time learning goals)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS goals (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  title        VARCHAR(120) NOT NULL,
  period       ENUM('daily','weekly','once') NOT NULL DEFAULT 'daily',
  target_value DECIMAL(8,2) NOT NULL DEFAULT 1,
  unit         VARCHAR(20)  NOT NULL DEFAULT 'hours',  -- hours, chapters, pages ...
  auto_study   TINYINT(1)   NOT NULL DEFAULT 0,        -- 1 = completed "study" tasks add hours automatically
  deadline     DATE DEFAULT NULL,
  is_public    TINYINT(1)   NOT NULL DEFAULT 1,        -- shown on profile to followers
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS goal_progress (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  goal_id     INT UNSIGNED NOT NULL,
  amount      DECIMAL(8,2) NOT NULL,
  note        VARCHAR(120) DEFAULT '',
  source_log  INT UNSIGNED DEFAULT NULL,               -- task_logs.id when added automatically
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
  INDEX (goal_id, created_at)
);

-- ---------------------------------------------------------------------
-- 6. FOLLOWS
--    status 'pending' is used when someone follows a private (locked)
--    profile; the owner must accept first.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS follows (
  follower_id  INT UNSIGNED NOT NULL,
  following_id INT UNSIGNED NOT NULL,
  status       ENUM('pending','accepted') NOT NULL DEFAULT 'accepted',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id, following_id),
  FOREIGN KEY (follower_id)  REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 7. AVATARS  (profile pictures, stored in the database so they survive
--    restarts on free cloud hosts)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS avatars (
  user_id     INT UNSIGNED PRIMARY KEY,                -- one profile picture per student
  mime        VARCHAR(40)  NOT NULL,                   -- e.g. image/jpeg
  data        MEDIUMBLOB   NOT NULL,                   -- the picture itself (max ~1 MB)
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- 8. PRIVATE CHAT
--    Messages are ENCRYPTED before they are saved (AES-256-GCM).
--    The database only ever holds ciphertext + iv + auth tag, so
--    someone reading the table cannot read the chats.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sender_id    INT UNSIGNED NOT NULL,
  receiver_id  INT UNSIGNED NOT NULL,
  ciphertext   TEXT        NOT NULL,
  iv           VARCHAR(32) NOT NULL,
  auth_tag     VARCHAR(32) NOT NULL,
  is_read      TINYINT(1)  NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sender_id)   REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX (sender_id, receiver_id, id),
  INDEX (receiver_id, is_read)
);
