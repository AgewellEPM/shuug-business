export function bookingStore(sql, transaction) {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS booking_settings (key TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY, host TEXT NOT NULL, request_key TEXT NOT NULL UNIQUE,
      start INTEGER NOT NULL, end INTEGER NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS bookings_by_host ON bookings(host, start, end);
    CREATE TABLE IF NOT EXISTS booking_jobs (
      id INTEGER PRIMARY KEY, booking TEXT NOT NULL, revision INTEGER NOT NULL, channel TEXT NOT NULL,
      status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, due INTEGER NOT NULL, data TEXT NOT NULL,
      UNIQUE(booking, revision, channel)
    );
    CREATE INDEX IF NOT EXISTS booking_jobs_due ON booking_jobs(status, due);
  `);
  const statement = query => sql.prepare(query);
  const setting = statement('SELECT data FROM booking_settings WHERE key = ?');
  const save = statement('INSERT INTO booking_settings VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data');
  const clear = statement('DELETE FROM booking_settings WHERE key = ?');
  const byId = statement('SELECT data FROM bookings WHERE id = ?'), byRequest = statement('SELECT data FROM bookings WHERE request_key = ?');
  const range = statement('SELECT data FROM bookings WHERE host = ? AND start < ? AND end > ? ORDER BY start, id');
  const put = statement(`INSERT INTO bookings VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
    start = excluded.start, end = excluded.end, status = excluded.status, data = excluded.data`);
  const enqueue = statement('INSERT OR IGNORE INTO booking_jobs(booking, revision, channel, status, due, data) VALUES (?, ?, ?, ?, ?, ?)');
  const next = statement(`SELECT * FROM booking_jobs j WHERE j.status = 'pending' AND j.due <= ?
    AND NOT EXISTS (SELECT 1 FROM booking_jobs p WHERE p.booking = j.booking AND p.channel = j.channel
       AND p.id < j.id AND p.status IN ('pending','working')) ORDER BY j.id LIMIT 1`);
  const claim = statement("UPDATE booking_jobs SET status = 'working', attempts = attempts + 1, due = ? WHERE id = ?");
  const expire = statement(`UPDATE booking_jobs SET status = CASE WHEN channel IN ('clientEmail','repEmail') THEN 'uncertain' ELSE 'pending' END
    WHERE status = 'working' AND due <= ?`);
  const finish = statement('UPDATE booking_jobs SET status = ?, due = ? WHERE id = ? AND attempts = ? AND status = \'working\'');
  const history = statement('SELECT channel, status FROM booking_jobs WHERE booking = ? AND revision = ?');
  const mailJob = statement("SELECT * FROM booking_jobs WHERE id = ? AND channel IN ('clientEmail','repEmail')");
  const receipt = statement('UPDATE booking_jobs SET status = ? WHERE id = ?');
  const retry = statement("UPDATE booking_jobs SET status = 'pending', due = 0, attempts = 0 WHERE booking = ? AND status = 'failed' AND channel NOT IN ('clientEmail','repEmail')");
  const decode = row => row ? JSON.parse(row.data) : null;
  return {
    transaction, setting: key => decode(setting.get(key)), save: (key, data) => save.run(key, JSON.stringify(data)), clear: key => clear.run(key),
    get: id => decode(byId.get(id)), byRequest: key => decode(byRequest.get(key)),
    range: (host, start, end) => range.all(host, end, start).map(decode),
    put: row => put.run(row.id, row.host, row.requestKey, row.start, row.end, row.status, JSON.stringify(row)),
    enqueue(row, channel, status, data) { enqueue.run(row.id, row.revision, channel, status, 0, JSON.stringify(data)); },
    statuses: row => Object.fromEntries(history.all(row.id, row.revision).map(item => [item.channel, item.status])),
    mailJob: id => { const job = mailJob.get(id); return job && { ...job, data: JSON.parse(job.data) }; },
    receipt: (id, status) => receipt.run(status, id), retry: id => retry.run(id),
    claim(now) {
      return transaction(() => {
        expire.run(now);
        const job = next.get(now);
        if (!job) return null;
        claim.run(now + 5 * 60_000, job.id);
        return { ...job, attempts: job.attempts + 1, data: JSON.parse(job.data) };
      });
    },
    finish: (job, status, due = 0) => finish.run(status, due, job.id, job.attempts),
  };
}
