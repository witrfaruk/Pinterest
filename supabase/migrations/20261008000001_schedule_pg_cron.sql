-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove existing jobs if re-running
DO $$
BEGIN
    PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'pinterest_slot_%';
EXCEPTION WHEN OTHERS THEN
    -- Ignore if table doesn't exist yet
END $$;

-- Schedule Slot 1: 17:30 IST (12:00 UTC)
SELECT cron.schedule(
    'pinterest_slot_1730_ist',
    '0 12 * * *',
    $$
    SELECT net.http_post(
        url := 'https://zphiodudidgvwgwctfkv.supabase.co/functions/v1/publish-pin',
        headers := jsonb_build_object(
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
    );
    $$
);

-- Schedule Slot 2: 19:30 IST (14:00 UTC)
SELECT cron.schedule(
    'pinterest_slot_1930_ist',
    '0 14 * * *',
    $$
    SELECT net.http_post(
        url := 'https://zphiodudidgvwgwctfkv.supabase.co/functions/v1/publish-pin',
        headers := jsonb_build_object(
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
    );
    $$
);

-- Schedule Slot 3: 21:30 IST (16:00 UTC)
SELECT cron.schedule(
    'pinterest_slot_2130_ist',
    '0 16 * * *',
    $$
    SELECT net.http_post(
        url := 'https://zphiodudidgvwgwctfkv.supabase.co/functions/v1/publish-pin',
        headers := jsonb_build_object(
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
    );
    $$
);

-- Schedule Slot 4: 23:30 IST (18:00 UTC)
SELECT cron.schedule(
    'pinterest_slot_2330_ist',
    '0 18 * * *',
    $$
    SELECT net.http_post(
        url := 'https://zphiodudidgvwgwctfkv.supabase.co/functions/v1/publish-pin',
        headers := jsonb_build_object(
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
    );
    $$
);

-- Schedule Slot 5: 01:30 IST (20:00 UTC)
SELECT cron.schedule(
    'pinterest_slot_0130_ist',
    '0 20 * * *',
    $$
    SELECT net.http_post(
        url := 'https://zphiodudidgvwgwctfkv.supabase.co/functions/v1/publish-pin',
        headers := jsonb_build_object(
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
    );
    $$
);
