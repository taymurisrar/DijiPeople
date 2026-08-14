using System.Globalization;

using Microsoft.Data.Sqlite;

namespace DijiPeople.Gateway.Storage;

/// <summary>
/// Every read and write against the local durable store.
///
/// The two rules this file exists to keep:
///
///   1. A punch observed on a device is recorded before anything decides
///      whether to send it, and it is recorded exactly once per device.
///   2. A queued punch is removed only when DijiPeople has acknowledged it.
///
/// Both hold across a crash, because the observe-and-enqueue step is one
/// transaction and acknowledgement is a separate one that runs after the HTTP
/// response, never before it.
/// </summary>
public sealed class GatewayStore
{
    private readonly GatewayDatabase _database;

    public GatewayStore(GatewayDatabase database)
    {
        _database = database;
    }

    // ------------------------------------------------------------ key/value

    public string? GetState(string key) => _database.Read(connection =>
    {
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT value FROM GatewayState WHERE key = $key;";
        command.Parameters.AddWithValue("$key", key);
        return command.ExecuteScalar() as string;
    });

    public Task SetStateAsync(string key, string? value, CancellationToken cancellationToken = default) =>
        _database.WriteAsync((connection, transaction) =>
        {
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                INSERT INTO GatewayState (key, value, updatedAt)
                VALUES ($key, $value, $now)
                ON CONFLICT(key) DO UPDATE SET value = $value, updatedAt = $now;
                """;
            command.Parameters.AddWithValue("$key", key);
            command.Parameters.AddWithValue("$value", (object?)value ?? DBNull.Value);
            command.Parameters.AddWithValue("$now", Timestamp(DateTimeOffset.UtcNow));
            command.ExecuteNonQuery();
        }, cancellationToken);

    // ------------------------------------------------------- observe/enqueue

    /// <summary>
    /// Records what a device reported and queues only what is admitted.
    ///
    /// One transaction covers both tables. A crash between them would otherwise
    /// leave a punch marked "already seen" but never queued — an event silently
    /// lost forever, which is precisely the failure this design exists to
    /// prevent.
    ///
    /// <paramref name="isAdmitted"/> is the import-window decision. A punch it
    /// rejects is still fingerprinted, so the next poll recognises it instead of
    /// re-evaluating years of history every cycle.
    /// </summary>
    public async Task<EnqueueOutcome> ObserveAndEnqueueAsync(
        string deviceId,
        string integrationId,
        string? deviceTimezone,
        IReadOnlyCollection<ObservedPunch> punches,
        Func<ObservedPunch, bool> isAdmitted,
        CancellationToken cancellationToken = default)
    {
        var now = Timestamp(DateTimeOffset.UtcNow);

        return await _database.WriteAsync((connection, transaction) =>
        {
            var alreadyKnown = 0;
            var queued = 0;
            var skippedOutsideWindow = 0;
            string? highWater = null;

            using var exists = connection.CreateCommand();
            exists.Transaction = transaction;
            exists.CommandText =
                "SELECT 1 FROM ObservedEvent WHERE deviceId = $device AND fingerprint = $fingerprint;";
            var existsDevice = exists.Parameters.Add("$device", SqliteType.Text);
            var existsFingerprint = exists.Parameters.Add("$fingerprint", SqliteType.Text);

            using var observe = connection.CreateCommand();
            observe.Transaction = transaction;
            observe.CommandText = """
                INSERT INTO ObservedEvent (deviceId, fingerprint, occurredAtLocal, firstSeenAt, queued)
                VALUES ($device, $fingerprint, $occurredAt, $now, $queued)
                ON CONFLICT(deviceId, fingerprint) DO NOTHING;
                """;
            var observeDevice = observe.Parameters.Add("$device", SqliteType.Text);
            var observeFingerprint = observe.Parameters.Add("$fingerprint", SqliteType.Text);
            var observeOccurred = observe.Parameters.Add("$occurredAt", SqliteType.Text);
            observe.Parameters.AddWithValue("$now", now);
            var observeQueued = observe.Parameters.Add("$queued", SqliteType.Integer);

            using var enqueue = connection.CreateCommand();
            enqueue.Transaction = transaction;
            enqueue.CommandText = """
                INSERT INTO OutboundEvent (
                    deviceId, integrationId, fingerprint, externalUserId, occurredAtLocal,
                    deviceTimezone, verificationModeRaw, punchStateRaw, workCodeRaw,
                    state, attemptCount, createdAt)
                VALUES (
                    $device, $integration, $fingerprint, $user, $occurredAt,
                    $timezone, $verification, $punchState, $workCode,
                    'PENDING', 0, $now)
                ON CONFLICT(deviceId, fingerprint) DO NOTHING;
                """;
            var enqueueDevice = enqueue.Parameters.Add("$device", SqliteType.Text);
            enqueue.Parameters.AddWithValue("$integration", integrationId);
            var enqueueFingerprint = enqueue.Parameters.Add("$fingerprint", SqliteType.Text);
            var enqueueUser = enqueue.Parameters.Add("$user", SqliteType.Text);
            var enqueueOccurred = enqueue.Parameters.Add("$occurredAt", SqliteType.Text);
            enqueue.Parameters.AddWithValue("$timezone", (object?)deviceTimezone ?? DBNull.Value);
            var enqueueVerification = enqueue.Parameters.Add("$verification", SqliteType.Integer);
            var enqueuePunchState = enqueue.Parameters.Add("$punchState", SqliteType.Integer);
            var enqueueWorkCode = enqueue.Parameters.Add("$workCode", SqliteType.Integer);
            enqueue.Parameters.AddWithValue("$now", now);

            foreach (var punch in punches)
            {
                if (string.CompareOrdinal(punch.OccurredAtLocal, highWater) > 0)
                {
                    highWater = punch.OccurredAtLocal;
                }

                existsDevice.Value = deviceId;
                existsFingerprint.Value = punch.Fingerprint;
                if (exists.ExecuteScalar() is not null)
                {
                    alreadyKnown++;
                    continue;
                }

                var admitted = isAdmitted(punch);

                observeDevice.Value = deviceId;
                observeFingerprint.Value = punch.Fingerprint;
                observeOccurred.Value = punch.OccurredAtLocal;
                observeQueued.Value = admitted ? 1 : 0;
                observe.ExecuteNonQuery();

                if (!admitted)
                {
                    skippedOutsideWindow++;
                    continue;
                }

                enqueueDevice.Value = deviceId;
                enqueueFingerprint.Value = punch.Fingerprint;
                enqueueUser.Value = punch.ExternalUserId;
                enqueueOccurred.Value = punch.OccurredAtLocal;
                enqueueVerification.Value = (object?)punch.VerificationModeRaw ?? DBNull.Value;
                enqueuePunchState.Value = (object?)punch.PunchStateRaw ?? DBNull.Value;
                enqueueWorkCode.Value = (object?)punch.WorkCodeRaw ?? DBNull.Value;
                enqueue.ExecuteNonQuery();
                queued++;
            }

            if (highWater is not null)
            {
                using var mark = connection.CreateCommand();
                mark.Transaction = transaction;
                // Only ever moves forward. A terminal whose clock was corrected
                // backwards must not drag the mark with it, or the punches in
                // between would look older than something already processed.
                mark.CommandText = """
                    UPDATE DeviceState
                       SET highWaterOccurredAtLocal = $high
                     WHERE deviceId = $device
                       AND (highWaterOccurredAtLocal IS NULL OR highWaterOccurredAtLocal < $high);
                    """;
                mark.Parameters.AddWithValue("$high", highWater);
                mark.Parameters.AddWithValue("$device", deviceId);
                mark.ExecuteNonQuery();
            }

            return new EnqueueOutcome(punches.Count, queued, alreadyKnown, skippedOutsideWindow);
        }, cancellationToken);
    }

    // ------------------------------------------------------------ queue read

    /// <summary>
    /// Takes the next batch for one integration/device and marks it in flight.
    ///
    /// Claiming and sending are separate steps on purpose: the rows are marked
    /// IN_FLIGHT before the request leaves, so a crash mid-upload leaves evidence
    /// that work was attempted, and start-up returns those rows to PENDING.
    /// </summary>
    public Task<IReadOnlyList<OutboundEventRecord>> ClaimBatchAsync(
        int batchSize,
        CancellationToken cancellationToken = default) =>
        _database.WriteAsync<IReadOnlyList<OutboundEventRecord>>((connection, transaction) =>
        {
            var now = DateTimeOffset.UtcNow;

            // One device per batch: the ingestion endpoint scopes deduplication
            // by device, so mixing devices in a request would need a different
            // shape server-side for no benefit.
            using var pick = connection.CreateCommand();
            pick.Transaction = transaction;
            pick.CommandText = """
                SELECT integrationId, deviceId
                  FROM OutboundEvent
                 WHERE state IN ('PENDING', 'RETRY')
                   AND (nextAttemptAt IS NULL OR nextAttemptAt <= $now)
                 ORDER BY id
                 LIMIT 1;
                """;
            pick.Parameters.AddWithValue("$now", Timestamp(now));

            string integrationId;
            string deviceId;
            using (var reader = pick.ExecuteReader())
            {
                if (!reader.Read())
                {
                    return Array.Empty<OutboundEventRecord>();
                }

                integrationId = reader.GetString(0);
                deviceId = reader.GetString(1);
            }

            var records = new List<OutboundEventRecord>();

            using var select = connection.CreateCommand();
            select.Transaction = transaction;
            select.CommandText = """
                SELECT id, deviceId, integrationId, fingerprint, externalUserId,
                       occurredAtLocal, deviceTimezone, verificationModeRaw,
                       punchStateRaw, workCodeRaw, attemptCount
                  FROM OutboundEvent
                 WHERE state IN ('PENDING', 'RETRY')
                   AND (nextAttemptAt IS NULL OR nextAttemptAt <= $now)
                   AND integrationId = $integration
                   AND deviceId = $device
                 ORDER BY id
                 LIMIT $limit;
                """;
            select.Parameters.AddWithValue("$now", Timestamp(now));
            select.Parameters.AddWithValue("$integration", integrationId);
            select.Parameters.AddWithValue("$device", deviceId);
            select.Parameters.AddWithValue("$limit", batchSize);

            using (var reader = select.ExecuteReader())
            {
                while (reader.Read())
                {
                    records.Add(new OutboundEventRecord(
                        reader.GetInt64(0),
                        reader.GetString(1),
                        reader.GetString(2),
                        reader.GetString(3),
                        reader.GetString(4),
                        reader.GetString(5),
                        reader.IsDBNull(6) ? null : reader.GetString(6),
                        reader.IsDBNull(7) ? null : reader.GetInt32(7),
                        reader.IsDBNull(8) ? null : reader.GetInt32(8),
                        reader.IsDBNull(9) ? null : reader.GetInt32(9),
                        reader.GetInt32(10)));
                }
            }

            if (records.Count == 0)
            {
                return Array.Empty<OutboundEventRecord>();
            }

            MarkState(connection, transaction, records, OutboundEventState.InFlight);
            return records;
        }, cancellationToken);

    /// <summary>
    /// Removes rows DijiPeople acknowledged.
    ///
    /// Called only after a successful HTTP response. "Duplicate" counts as
    /// acknowledged — the cloud already holds the record, which is the outcome
    /// the queue exists to reach.
    /// </summary>
    public Task AcknowledgeAsync(
        IReadOnlyCollection<OutboundEventRecord> records,
        CancellationToken cancellationToken = default) =>
        _database.WriteAsync((connection, transaction) =>
        {
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = "DELETE FROM OutboundEvent WHERE id = $id;";
            var id = command.Parameters.Add("$id", SqliteType.Integer);

            foreach (var record in records)
            {
                id.Value = record.Id;
                command.ExecuteNonQuery();
            }

            using var stamp = connection.CreateCommand();
            stamp.Transaction = transaction;
            stamp.CommandText = """
                INSERT INTO GatewayState (key, value, updatedAt)
                VALUES ('lastSuccessfulUploadAt', $now, $now)
                ON CONFLICT(key) DO UPDATE SET value = $now, updatedAt = $now;
                """;
            stamp.Parameters.AddWithValue("$now", Timestamp(DateTimeOffset.UtcNow));
            stamp.ExecuteNonQuery();
        }, cancellationToken);

    /// <summary>
    /// Returns a failed batch to the queue with a backoff.
    ///
    /// The retry ceiling is high and the backoff caps at an hour rather than
    /// growing without bound: a cloud outage that lasts a working day must end
    /// with the punches uploaded, not dead-lettered.
    /// </summary>
    public Task FailAsync(
        IReadOnlyCollection<OutboundEventRecord> records,
        string errorCode,
        int maxAttempts,
        CancellationToken cancellationToken = default) =>
        _database.WriteAsync((connection, transaction) =>
        {
            var now = DateTimeOffset.UtcNow;

            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                UPDATE OutboundEvent
                   SET state = $state,
                       attemptCount = attemptCount + 1,
                       nextAttemptAt = $nextAttempt,
                       lastErrorCode = $errorCode,
                       lastErrorAt = $now
                 WHERE id = $id;
                """;
            var state = command.Parameters.Add("$state", SqliteType.Text);
            var nextAttempt = command.Parameters.Add("$nextAttempt", SqliteType.Text);
            command.Parameters.AddWithValue("$errorCode", errorCode);
            command.Parameters.AddWithValue("$now", Timestamp(now));
            var id = command.Parameters.Add("$id", SqliteType.Integer);

            foreach (var record in records)
            {
                var attempt = record.AttemptCount + 1;
                var deadLettered = attempt >= maxAttempts;

                state.Value = deadLettered
                    ? OutboundEventState.DeadLetter
                    : OutboundEventState.Retry;
                nextAttempt.Value = deadLettered
                    ? DBNull.Value
                    : Timestamp(now.Add(BackoffFor(attempt)));
                id.Value = record.Id;
                command.ExecuteNonQuery();
            }
        }, cancellationToken);

    /// <summary>
    /// Exponential with a one-hour ceiling: 30s, 1m, 2m, 4m … capped.
    /// Long enough to stop hammering a dead API, short enough that a restored
    /// connection drains the backlog within minutes rather than hours.
    /// </summary>
    internal static TimeSpan BackoffFor(int attempt)
    {
        var seconds = 30d * Math.Pow(2, Math.Min(attempt - 1, 10));
        return TimeSpan.FromSeconds(Math.Min(seconds, 3600));
    }

    /// <summary>
    /// Returns dead-lettered rows to the queue.
    ///
    /// Nothing expires them automatically. An operator decides, because the
    /// reason they dead-lettered (a rejected payload, a revoked credential) is
    /// usually something a human fixed.
    /// </summary>
    public Task<int> RequeueDeadLettersAsync(CancellationToken cancellationToken = default) =>
        _database.WriteAsync((connection, transaction) =>
        {
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                UPDATE OutboundEvent
                   SET state = 'PENDING', attemptCount = 0, nextAttemptAt = NULL
                 WHERE state = 'DEAD_LETTER';
                """;
            return command.ExecuteNonQuery();
        }, cancellationToken);

    public QueueMetrics GetQueueMetrics() => _database.Read(connection =>
    {
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT
                (SELECT COUNT(*) FROM OutboundEvent WHERE state IN ('PENDING','RETRY','IN_FLIGHT')),
                (SELECT COUNT(*) FROM OutboundEvent WHERE state = 'DEAD_LETTER'),
                (SELECT MIN(createdAt) FROM OutboundEvent WHERE state IN ('PENDING','RETRY','IN_FLIGHT')),
                (SELECT value FROM GatewayState WHERE key = 'lastSuccessfulUploadAt');
            """;

        using var reader = command.ExecuteReader();
        if (!reader.Read())
        {
            return new QueueMetrics(0, 0, null, null);
        }

        return new QueueMetrics(
            reader.GetInt32(0),
            reader.GetInt32(1),
            reader.IsDBNull(2) ? null : ParseTimestamp(reader.GetString(2)),
            reader.IsDBNull(3) ? null : ParseTimestamp(reader.GetString(3)));
    });

    // ---------------------------------------------------------- device state

    public DeviceRuntimeState? GetDeviceState(string deviceId) => _database.Read(connection =>
    {
        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT deviceId, integrationId, lastSyncCompletedAt, lastSuccessfulSyncAt,
                   consecutiveFailures, health, nextEligibleAt, baselineEstablishedAt,
                   highWaterOccurredAtLocal, lastAcknowledgedSyncRequestAt
              FROM DeviceState
             WHERE deviceId = $device;
            """;
        command.Parameters.AddWithValue("$device", deviceId);

        using var reader = command.ExecuteReader();
        if (!reader.Read()) return null;

        return new DeviceRuntimeState(
            reader.GetString(0),
            reader.GetString(1),
            reader.IsDBNull(2) ? null : ParseTimestamp(reader.GetString(2)),
            reader.IsDBNull(3) ? null : ParseTimestamp(reader.GetString(3)),
            reader.GetInt32(4),
            reader.GetString(5),
            reader.IsDBNull(6) ? null : ParseTimestamp(reader.GetString(6)),
            reader.IsDBNull(7) ? null : ParseTimestamp(reader.GetString(7)),
            reader.IsDBNull(8) ? null : reader.GetString(8),
            reader.IsDBNull(9) ? null : ParseTimestamp(reader.GetString(9)));
    });

    public Task EnsureDeviceAsync(
        string deviceId,
        string integrationId,
        string deviceName,
        CancellationToken cancellationToken = default) =>
        _database.WriteAsync((connection, transaction) =>
        {
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                INSERT INTO DeviceState (deviceId, integrationId, deviceName)
                VALUES ($device, $integration, $name)
                ON CONFLICT(deviceId) DO UPDATE
                    SET integrationId = $integration, deviceName = $name;
                """;
            command.Parameters.AddWithValue("$device", deviceId);
            command.Parameters.AddWithValue("$integration", integrationId);
            command.Parameters.AddWithValue("$name", deviceName);
            command.ExecuteNonQuery();
        }, cancellationToken);

    /// <summary>
    /// Records the outcome of a device sync.
    ///
    /// Health is only downgraded to ERROR after repeated failures. A terminal
    /// that missed one poll because someone was standing at it is not a fault,
    /// and paging on the first blip trains an operator to ignore the signal.
    /// </summary>
    public Task RecordSyncOutcomeAsync(
        string deviceId,
        bool succeeded,
        string? errorCode,
        DateTimeOffset completedAt,
        DateTimeOffset nextEligibleAt,
        int failureThreshold,
        CancellationToken cancellationToken = default) =>
        _database.WriteAsync((connection, transaction) =>
        {
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = succeeded
                ? """
                  UPDATE DeviceState
                     SET lastSyncCompletedAt = $completed,
                         lastSuccessfulSyncAt = $completed,
                         consecutiveFailures = 0,
                         health = 'ONLINE',
                         lastErrorCode = NULL,
                         lastErrorAt = NULL,
                         nextEligibleAt = $next
                   WHERE deviceId = $device;
                  """
                : """
                  UPDATE DeviceState
                     SET lastSyncCompletedAt = $completed,
                         consecutiveFailures = consecutiveFailures + 1,
                         health = CASE
                             WHEN consecutiveFailures + 1 >= $threshold THEN 'OFFLINE'
                             ELSE 'ERROR'
                         END,
                         lastErrorCode = $errorCode,
                         lastErrorAt = $completed,
                         nextEligibleAt = $next
                   WHERE deviceId = $device;
                  """;

            command.Parameters.AddWithValue("$completed", Timestamp(completedAt));
            command.Parameters.AddWithValue("$next", Timestamp(nextEligibleAt));
            command.Parameters.AddWithValue("$device", deviceId);
            if (!succeeded)
            {
                command.Parameters.AddWithValue("$errorCode", (object?)errorCode ?? DBNull.Value);
                command.Parameters.AddWithValue("$threshold", failureThreshold);
            }

            command.ExecuteNonQuery();
        }, cancellationToken);

    public Task MarkSyncStartedAsync(
        string deviceId,
        DateTimeOffset startedAt,
        CancellationToken cancellationToken = default) =>
        _database.WriteAsync((connection, transaction) =>
        {
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText =
                "UPDATE DeviceState SET lastSyncStartedAt = $started WHERE deviceId = $device;";
            command.Parameters.AddWithValue("$started", Timestamp(startedAt));
            command.Parameters.AddWithValue("$device", deviceId);
            command.ExecuteNonQuery();
        }, cancellationToken);

    public Task MarkBaselineAsync(
        string deviceId,
        DateTimeOffset establishedAt,
        CancellationToken cancellationToken = default) =>
        _database.WriteAsync((connection, transaction) =>
        {
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            // Only the first time. Re-stamping would move the import window
            // forward on every poll and quietly stop admitting anything.
            command.CommandText = """
                UPDATE DeviceState
                   SET baselineEstablishedAt = $at
                 WHERE deviceId = $device AND baselineEstablishedAt IS NULL;
                """;
            command.Parameters.AddWithValue("$at", Timestamp(establishedAt));
            command.Parameters.AddWithValue("$device", deviceId);
            command.ExecuteNonQuery();
        }, cancellationToken);

    public Task AcknowledgeSyncRequestAsync(
        string deviceId,
        DateTimeOffset requestedAt,
        CancellationToken cancellationToken = default) =>
        _database.WriteAsync((connection, transaction) =>
        {
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                UPDATE DeviceState
                   SET lastAcknowledgedSyncRequestAt = $at
                 WHERE deviceId = $device
                   AND (lastAcknowledgedSyncRequestAt IS NULL OR lastAcknowledgedSyncRequestAt < $at);
                """;
            command.Parameters.AddWithValue("$at", Timestamp(requestedAt));
            command.Parameters.AddWithValue("$device", deviceId);
            command.ExecuteNonQuery();
        }, cancellationToken);

    public Task RecordVerifiedAsync(
        string deviceId,
        DateTimeOffset verifiedAt,
        CancellationToken cancellationToken = default) =>
        _database.WriteAsync((connection, transaction) =>
        {
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText =
                "UPDATE DeviceState SET lastVerifiedAt = $at WHERE deviceId = $device;";
            command.Parameters.AddWithValue("$at", Timestamp(verifiedAt));
            command.Parameters.AddWithValue("$device", deviceId);
            command.ExecuteNonQuery();
        }, cancellationToken);

    /// <summary>Device health as this gateway currently sees it, for heartbeat.</summary>
    public IReadOnlyDictionary<string, string> GetDeviceHealth() => _database.Read(connection =>
    {
        var health = new Dictionary<string, string>(StringComparer.Ordinal);

        using var command = connection.CreateCommand();
        command.CommandText = "SELECT deviceId, health FROM DeviceState;";
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            health[reader.GetString(0)] = reader.GetString(1);
        }

        return health;
    });

    // --------------------------------------------------- configuration cache

    public (string ConfigVersion, string Payload)? GetCachedConfiguration() =>
        _database.Read(connection =>
        {
            using var command = connection.CreateCommand();
            command.CommandText =
                "SELECT configVersion, payload FROM ConfigurationCache WHERE id = 1;";
            using var reader = command.ExecuteReader();
            return reader.Read()
                ? ((string, string)?)(reader.GetString(0), reader.GetString(1))
                : null;
        });

    public Task CacheConfigurationAsync(
        string configVersion,
        string payload,
        CancellationToken cancellationToken = default) =>
        _database.WriteAsync((connection, transaction) =>
        {
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                INSERT INTO ConfigurationCache (id, configVersion, payload, fetchedAt)
                VALUES (1, $version, $payload, $now)
                ON CONFLICT(id) DO UPDATE
                    SET configVersion = $version, payload = $payload, fetchedAt = $now;
                """;
            command.Parameters.AddWithValue("$version", configVersion);
            command.Parameters.AddWithValue("$payload", payload);
            command.Parameters.AddWithValue("$now", Timestamp(DateTimeOffset.UtcNow));
            command.ExecuteNonQuery();
        }, cancellationToken);

    // ------------------------------------------------------- provisioning

    /// <summary>
    /// True when this job has already been executed against the device.
    ///
    /// The server's lease decides who owns a job; this stops a gateway that
    /// executed a write and then failed to report it from executing it a second
    /// time when the lease lapses and it re-claims the same work.
    /// </summary>
    public bool HasExecuted(string jobId) => _database.Read(connection =>
    {
        using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT executedAt FROM ProvisioningState WHERE jobId = $job AND executedAt IS NOT NULL;";
        command.Parameters.AddWithValue("$job", jobId);
        return command.ExecuteScalar() is not null;
    });

    public Task RecordJobClaimedAsync(
        string jobId,
        string deviceId,
        string operation,
        DateTimeOffset? leaseExpiresAt,
        CancellationToken cancellationToken = default) =>
        _database.WriteAsync((connection, transaction) =>
        {
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                INSERT INTO ProvisioningState (jobId, deviceId, operation, claimedAt, leaseExpiresAt)
                VALUES ($job, $device, $operation, $now, $lease)
                ON CONFLICT(jobId) DO UPDATE
                    SET claimedAt = $now, leaseExpiresAt = $lease;
                """;
            command.Parameters.AddWithValue("$job", jobId);
            command.Parameters.AddWithValue("$device", deviceId);
            command.Parameters.AddWithValue("$operation", operation);
            command.Parameters.AddWithValue("$now", Timestamp(DateTimeOffset.UtcNow));
            command.Parameters.AddWithValue(
                "$lease",
                leaseExpiresAt is null ? DBNull.Value : Timestamp(leaseExpiresAt.Value));
            command.ExecuteNonQuery();
        }, cancellationToken);

    public Task RecordJobExecutedAsync(
        string jobId,
        bool succeeded,
        string? errorCode,
        CancellationToken cancellationToken = default) =>
        _database.WriteAsync((connection, transaction) =>
        {
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                UPDATE ProvisioningState
                   SET executedAt = $now, succeeded = $succeeded, lastErrorCode = $errorCode
                 WHERE jobId = $job;
                """;
            command.Parameters.AddWithValue("$now", Timestamp(DateTimeOffset.UtcNow));
            command.Parameters.AddWithValue("$succeeded", succeeded ? 1 : 0);
            command.Parameters.AddWithValue("$errorCode", (object?)errorCode ?? DBNull.Value);
            command.Parameters.AddWithValue("$job", jobId);
            command.ExecuteNonQuery();
        }, cancellationToken);

    public Task RecordJobReportedAsync(
        string jobId,
        CancellationToken cancellationToken = default) =>
        _database.WriteAsync((connection, transaction) =>
        {
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText =
                "UPDATE ProvisioningState SET reportedAt = $now WHERE jobId = $job;";
            command.Parameters.AddWithValue("$now", Timestamp(DateTimeOffset.UtcNow));
            command.Parameters.AddWithValue("$job", jobId);
            command.ExecuteNonQuery();
        }, cancellationToken);

    // ----------------------------------------------------------------- utils

    private static void MarkState(
        SqliteConnection connection,
        SqliteTransaction transaction,
        IReadOnlyCollection<OutboundEventRecord> records,
        string state)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "UPDATE OutboundEvent SET state = $state WHERE id = $id;";
        command.Parameters.AddWithValue("$state", state);
        var id = command.Parameters.Add("$id", SqliteType.Integer);

        foreach (var record in records)
        {
            id.Value = record.Id;
            command.ExecuteNonQuery();
        }
    }

    /// <summary>
    /// ISO-8601 with an explicit UTC offset. These are gateway/cloud instants,
    /// not device wall clocks — device timestamps are stored verbatim as the
    /// terminal reported them and never given an offset.
    /// </summary>
    internal static string Timestamp(DateTimeOffset value) =>
        value.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture);

    internal static DateTimeOffset? ParseTimestamp(string value) =>
        DateTimeOffset.TryParse(
            value,
            CultureInfo.InvariantCulture,
            DateTimeStyles.RoundtripKind,
            out var parsed)
            ? parsed
            : null;
}

/// <summary>What one device read produced, in queue terms.</summary>
public sealed record EnqueueOutcome(
    int Read,
    int Queued,
    int AlreadyKnown,
    int SkippedOutsideWindow);
