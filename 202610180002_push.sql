CREATE TABLE push_subscriptions (
 id text PRIMARY KEY,
 session_hash text NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
 subscription jsonb NOT NULL,
 created_at bigint NOT NULL,
 checked_at bigint NOT NULL DEFAULT 0,
 last_sent bigint NOT NULL DEFAULT 0
);
CREATE TABLE push_deliveries (
 subscription_id text NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
 notice_key text NOT NULL,
 created_at bigint NOT NULL,
 PRIMARY KEY(subscription_id,notice_key)
);
