-- Attendance location is a mandatory integrity control for all self-service modes.
UPDATE "TenantSetting"
SET "value" = CASE "key"
  WHEN 'locationRequiredForModes' THEN '["OFFICE","REMOTE","HYBRID"]'::jsonb
  WHEN 'allowManualLocationException' THEN 'false'::jsonb
  ELSE 'true'::jsonb
END,
"updatedAt" = CURRENT_TIMESTAMP
WHERE "category" = 'attendance'
  AND "key" IN (
    'requireRemoteLocationCapture',
    'locationCaptureRequired',
    'locationRequiredForModes',
    'captureLocationOnCheckIn',
    'captureLocationOnCheckOut',
    'allowManualLocationException',
    'highAccuracyLocation'
  );
