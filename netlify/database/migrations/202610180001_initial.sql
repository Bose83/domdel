CREATE TABLE accounts (
 id uuid PRIMARY KEY,
 login text NOT NULL UNIQUE CHECK(length(login) BETWEEN 3 AND 40),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 60),
 password_hash text NOT NULL,
 recovery_hash text NOT NULL,
 created_at bigint NOT NULL
);
CREATE TABLE rooms (
 id uuid PRIMARY KEY,
 creator uuid NOT NULL REFERENCES accounts(id),
 code text NOT NULL UNIQUE CHECK(code ~ '^[A-Z2-9]{10}$'),
 data jsonb NOT NULL,
 version integer NOT NULL DEFAULT 0
);
CREATE TABLE memberships (
 account_id uuid PRIMARY KEY REFERENCES accounts(id),
 room_id uuid NOT NULL REFERENCES rooms(id),
 member_id text NOT NULL,
 UNIQUE(room_id,member_id)
);
CREATE TABLE sessions (
 token_hash text PRIMARY KEY,
 account_id uuid NOT NULL REFERENCES accounts(id),
 expires_at bigint NOT NULL,
 touched_at bigint NOT NULL,
 ui jsonb NOT NULL DEFAULT '{}',
 revision integer NOT NULL DEFAULT 0
);
CREATE INDEX sessions_account ON sessions(account_id);
CREATE TABLE rate_limits (key text PRIMARY KEY, attempts integer NOT NULL, expires_at bigint NOT NULL);
CREATE TABLE pending_joins (
 account_id uuid PRIMARY KEY REFERENCES accounts(id),
 room_id uuid NOT NULL REFERENCES rooms(id),
 request_id text NOT NULL
);
CREATE TABLE requests (
 session_hash text NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 created_at bigint NOT NULL,
 PRIMARY KEY(session_hash,request_id)
);
CREATE INDEX rooms_creator ON rooms(creator);
CREATE INDEX pending_room ON pending_joins(room_id);
