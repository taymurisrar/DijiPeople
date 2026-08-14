using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;

namespace DijiPeople.Gateway.Storage;

/// <summary>
/// The local durable store.
///
/// This is NOT a cache. A punch that has been read from a terminal and not yet
/// acknowledged by DijiPeople exists in exactly one place — here — and losing it
/// loses a person's attendance record. Everything below is shaped by that:
/// synchronous=FULL, write-ahead logging, one writer at a time, and no state
/// transition that marks work delivered before the cloud has said so.
///
/// WHAT IS STORED: fingerprints, timestamps, counts, queue state, device health.
/// WHAT IS NOT: biometric data of any kind, device passwords, comm keys, the
/// gateway credential, or any employee record beyond the external identifier the
/// terminal itself uses.
/// </summary>
public sealed class GatewayDatabase : IDisposable
{
    private readonly string _connectionString;
    private readonly ILogger<GatewayDatabase> _logger;

    /// <summary>
    /// SQLite allows one writer. Serialising here turns a would-be
    /// SQLITE_BUSY into an ordinary wait, which matters because the scheduler,
    /// the uploader and the heartbeat all write.
    /// </summary>
    private readonly SemaphoreSlim _writeLock = new(1, 1);

    public GatewayDatabase(string databasePath, ILogger<GatewayDatabase> logger)
    {
        _logger = logger;

        var directory = Path.GetDirectoryName(Path.GetFullPath(databasePath));
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        _connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared,
            Pooling = true,
        }.ToString();
    }

    public SqliteConnection OpenConnection()
    {
        var connection = new SqliteConnection(_connectionString);
        connection.Open();

        using var pragma = connection.CreateCommand();
        // WAL lets a read proceed while a write is in flight, which keeps the
        // heartbeat's queue-depth query from blocking behind a large enqueue.
        // synchronous=FULL costs write throughput and buys the guarantee that
        // matters here: an acknowledged write survives a power cut.
        pragma.CommandText = """
            PRAGMA journal_mode=WAL;
            PRAGMA synchronous=FULL;
            PRAGMA foreign_keys=ON;
            PRAGMA busy_timeout=15000;
            """;
        pragma.ExecuteNonQuery();

        return connection;
    }

    /// <summary>Runs a write under the single-writer lock, inside a transaction.</summary>
    public async Task<T> WriteAsync<T>(
        Func<SqliteConnection, SqliteTransaction, T> work,
        CancellationToken cancellationToken = default)
    {
        await _writeLock.WaitAsync(cancellationToken);
        try
        {
            using var connection = OpenConnection();
            using var transaction = connection.BeginTransaction();
            var result = work(connection, transaction);
            transaction.Commit();
            return result;
        }
        finally
        {
            _writeLock.Release();
        }
    }

    public async Task WriteAsync(
        Action<SqliteConnection, SqliteTransaction> work,
        CancellationToken cancellationToken = default) =>
        await WriteAsync<object?>(
            (connection, transaction) =>
            {
                work(connection, transaction);
                return null;
            },
            cancellationToken);

    public T Read<T>(Func<SqliteConnection, T> work)
    {
        using var connection = OpenConnection();
        return work(connection);
    }

    /// <summary>
    /// Creates the schema.
    ///
    /// Plain CREATE TABLE IF NOT EXISTS, applied at every start. The schema is
    /// small and owned entirely by this application, so a migration framework
    /// would add a moving part without adding a guarantee. Future changes must
    /// be additive for the same reason the server's are: an upgrade must never
    /// discard punches that have not been uploaded yet.
    /// </summary>
    public void Initialise()
    {
        using var connection = OpenConnection();
        using var command = connection.CreateCommand();

        command.CommandText = """
            -- Small key/value facts about this installation.
            CREATE TABLE IF NOT EXISTS GatewayState (
                key         TEXT PRIMARY KEY,
                value       TEXT,
                updatedAt   TEXT NOT NULL
            );

            -- Per-device operational state. Separate from the cloud's device
            -- record: this is what the gateway needs to decide what to do next,
            -- and it must survive an outage in which the cloud is unreachable.
            CREATE TABLE IF NOT EXISTS DeviceState (
                deviceId                  TEXT PRIMARY KEY,
                integrationId             TEXT NOT NULL,
                deviceName                TEXT,
                lastSyncStartedAt         TEXT,
                lastSyncCompletedAt       TEXT,
                lastSuccessfulSyncAt      TEXT,
                lastVerifiedAt            TEXT,
                consecutiveFailures       INTEGER NOT NULL DEFAULT 0,
                health                    TEXT NOT NULL DEFAULT 'UNKNOWN',
                lastErrorCode             TEXT,
                lastErrorAt               TEXT,
                nextEligibleAt            TEXT,
                -- Set the first time this device is read. Everything already on
                -- the terminal at that moment is fingerprinted but only admitted
                -- if it falls inside the configured import window.
                baselineEstablishedAt     TEXT,
                -- Optimisation only. Correctness comes from the fingerprint
                -- table, so a device clock that jumps backwards cannot hide
                -- punches behind a stale high-water mark.
                highWaterOccurredAtLocal  TEXT,
                lastAcknowledgedSyncRequestAt TEXT
            );

            -- Every punch this gateway has ever seen on a device, whether or not
            -- it was admitted for upload. This is the local dedupe: without it a
            -- terminal that re-reads its whole history every poll would requeue
            -- years of records on every cycle.
            CREATE TABLE IF NOT EXISTS ObservedEvent (
                deviceId        TEXT NOT NULL,
                fingerprint     TEXT NOT NULL,
                occurredAtLocal TEXT NOT NULL,
                firstSeenAt     TEXT NOT NULL,
                -- 0 for a record outside the import window: seen, deliberately
                -- not sent, and never reconsidered.
                queued          INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (deviceId, fingerprint)
            );

            CREATE INDEX IF NOT EXISTS ObservedEvent_device_time
                ON ObservedEvent (deviceId, occurredAtLocal);

            -- The outbound queue. A row leaves this table only when DijiPeople
            -- has acknowledged it.
            CREATE TABLE IF NOT EXISTS OutboundEvent (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                deviceId            TEXT NOT NULL,
                integrationId       TEXT NOT NULL,
                fingerprint         TEXT NOT NULL,
                externalUserId      TEXT NOT NULL,
                occurredAtLocal     TEXT NOT NULL,
                deviceTimezone      TEXT,
                verificationModeRaw INTEGER,
                punchStateRaw       INTEGER,
                workCodeRaw         INTEGER,
                state               TEXT NOT NULL DEFAULT 'PENDING',
                attemptCount        INTEGER NOT NULL DEFAULT 0,
                nextAttemptAt       TEXT,
                lastErrorCode       TEXT,
                lastErrorAt         TEXT,
                createdAt           TEXT NOT NULL,
                UNIQUE (deviceId, fingerprint)
            );

            CREATE INDEX IF NOT EXISTS OutboundEvent_ready
                ON OutboundEvent (state, nextAttemptAt);
            CREATE INDEX IF NOT EXISTS OutboundEvent_target
                ON OutboundEvent (integrationId, deviceId, state);

            -- Last configuration DijiPeople sent. Lets the gateway keep serving
            -- its devices through a cloud outage instead of going idle.
            CREATE TABLE IF NOT EXISTS ConfigurationCache (
                id            INTEGER PRIMARY KEY CHECK (id = 1),
                configVersion TEXT NOT NULL,
                payload       TEXT NOT NULL,
                fetchedAt     TEXT NOT NULL
            );

            -- Provisioning jobs this gateway has taken. The server's lease is the
            -- authority on ownership; this is only enough to avoid re-running a
            -- job the gateway already executed but could not report.
            CREATE TABLE IF NOT EXISTS ProvisioningState (
                jobId          TEXT PRIMARY KEY,
                deviceId       TEXT NOT NULL,
                operation      TEXT NOT NULL,
                claimedAt      TEXT NOT NULL,
                leaseExpiresAt TEXT,
                executedAt     TEXT,
                succeeded      INTEGER,
                reportedAt     TEXT,
                lastErrorCode  TEXT
            );

            CREATE INDEX IF NOT EXISTS ProvisioningState_unreported
                ON ProvisioningState (reportedAt);
            """;

        command.ExecuteNonQuery();

        RecoverInFlight(connection);
    }

    /// <summary>
    /// Returns rows abandoned mid-upload to PENDING.
    ///
    /// A gateway killed while a batch was on the wire cannot know whether the
    /// cloud stored it. Re-sending is the safe choice in exactly one direction:
    /// the ingestion endpoint deduplicates, so a re-send costs nothing, whereas
    /// assuming delivery would silently drop the punches.
    /// </summary>
    private void RecoverInFlight(Microsoft.Data.Sqlite.SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = """
            UPDATE OutboundEvent
               SET state = 'PENDING', nextAttemptAt = NULL
             WHERE state = 'IN_FLIGHT';
            """;

        var recovered = command.ExecuteNonQuery();
        if (recovered > 0)
        {
            _logger.LogWarning(
                "Recovered {Count} attendance record(s) that were mid-upload when the gateway last stopped. They will be re-sent; DijiPeople discards duplicates.",
                recovered);
        }
    }

    public void Dispose()
    {
        _writeLock.Dispose();
        // Pooled connections hold the file open, which blocks an uninstall from
        // removing the data folder if the operator asked for that.
        SqliteConnection.ClearAllPools();
    }
}
